import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { stockholmLocalToISO } from '@/lib/bookings/availability'
import { normalizeSwedishPhone } from '@/lib/phone-normalize'
import { sendSmsViaElks } from '@/lib/sms-send'
import { syncBookingToCalendar } from '@/lib/google-calendar-sync'

export const dynamic = 'force-dynamic'

/**
 * POST /api/public/book/[slug]
 * Publik (ingen auth) — kund bokar en ledig tid via storefront-slug.
 * Body: { date, time, duration, name, phone, email?, service_type?, notes? }
 * Dedupar/skapar kund, skapar booking, synkar kalender, SMS-bekräftelse till
 * kund + notis till hantverkaren.
 */
export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = getServerSupabase()
  const body = await request.json().catch(() => ({}))
  const { date, time, name, email, service_type, notes } = body
  const duration = Math.min(Math.max(Number(body?.duration) || 60, 15), 480)
  const phone = normalizeSwedishPhone(body?.phone || '')

  if (!date || !time || !name?.trim() || !phone || !phone.startsWith('+')) {
    return NextResponse.json({ error: 'Fyll i namn, giltigt telefonnummer, datum och tid.' }, { status: 400 })
  }

  // Slug → publicerat storefront → företag
  const { data: storefront } = await supabase
    .from('storefront').select('business_id, is_published').eq('slug', params.slug).maybeSingle()
  if (!storefront || !storefront.is_published) {
    return NextResponse.json({ error: 'Hittades inte' }, { status: 404 })
  }
  const businessId = storefront.business_id

  const { data: config } = await supabase
    .from('business_config')
    .select('user_id, business_name, phone_number')
    .eq('business_id', businessId)
    .single()

  const startISO = stockholmLocalToISO(date, time)
  const startEpoch = Date.parse(startISO)
  if (startEpoch < Date.now()) {
    return NextResponse.json({ error: 'Tiden har redan passerat.' }, { status: 400 })
  }
  const endISO = new Date(startEpoch + duration * 60000).toISOString()

  // Race-check: är tiden fortfarande ledig?
  const dayStart = stockholmLocalToISO(date, '00:00')
  const dayEnd = stockholmLocalToISO(date, '23:59')
  const { data: existing } = await supabase
    .from('booking').select('scheduled_start, scheduled_end, status')
    .eq('business_id', businessId).gte('scheduled_start', dayStart).lte('scheduled_start', dayEnd).neq('status', 'cancelled')
  const clash = (existing || []).some((b: any) => {
    const bs = Date.parse(b.scheduled_start)
    const be = b.scheduled_end ? Date.parse(b.scheduled_end) : bs + 60 * 60000
    return startEpoch < be && (startEpoch + duration * 60000) > bs
  })
  if (clash) return NextResponse.json({ error: 'Tiden är tyvärr inte längre ledig. Välj en annan tid.' }, { status: 409 })

  // Dedupa/skapa kund på telefon
  let customerId: string
  const { data: found } = await supabase
    .from('customer').select('customer_id, name, email').eq('business_id', businessId).eq('phone_number', phone).maybeSingle()
  if (found) {
    customerId = found.customer_id
    const patch: Record<string, any> = {}
    if (!found.name && name) patch.name = name
    if (!found.email && email) patch.email = email
    if (Object.keys(patch).length) await supabase.from('customer').update(patch).eq('customer_id', customerId)
  } else {
    customerId = 'cust_' + Math.random().toString(36).slice(2, 11)
    await supabase.from('customer').insert({
      customer_id: customerId, business_id: businessId, name: name.trim(),
      phone_number: phone, email: email || null, source: 'website_form', created_at: new Date().toISOString(),
    })
  }

  // Skapa booking
  const bookingId = 'book_' + Math.random().toString(36).slice(2, 11)
  const combinedNotes = [service_type, notes].filter(Boolean).join(' — ') || 'Bokad via hemsidan'
  const { error: insErr } = await supabase.from('booking').insert({
    booking_id: bookingId, business_id: businessId, customer_id: customerId,
    scheduled_start: startISO, scheduled_end: endISO, status: 'confirmed',
    notes: combinedNotes, kind: service_type === 'emergency' ? 'emergency' : 'service',
    created_at: new Date().toISOString(),
  })
  if (insErr) {
    console.error('[public/book] insert error:', insErr)
    return NextResponse.json({ error: 'Kunde inte spara bokningen' }, { status: 500 })
  }

  // Google Calendar-synk (non-blocking)
  try {
    const result = await syncBookingToCalendar(supabase, businessId, config?.user_id, {
      booking_id: bookingId, scheduled_start: startISO, scheduled_end: endISO, notes: combinedNotes, customer_name: name,
    })
    if (result) {
      await supabase.from('booking').update({ google_event_id: result.eventId, google_calendar_id: result.calendarId }).eq('booking_id', bookingId)
    }
  } catch (e) { console.error('[public/book] calendar sync error:', e) }

  // Bekräftelse-SMS till kund + notis till hantverkaren (non-blocking)
  const niceTime = `${date} kl ${time}`
  const company = config?.business_name || 'Vi'
  try {
    await sendSmsViaElks({
      supabase, businessId, businessName: config?.business_name, to: phone,
      message: `Hej ${name.split(' ')[0]}! Din tid hos ${company} är bokad: ${niceTime}. Vi hör av oss om något behöver ändras.`,
      customerId, relatedId: bookingId, messageType: 'booking_confirmation',
    })
  } catch (e) { console.error('[public/book] customer SMS error:', e) }

  if (config?.phone_number) {
    try {
      await sendSmsViaElks({
        supabase, businessId, businessName: config?.business_name, to: config.phone_number,
        message: `Ny bokning via hemsidan: ${name} (${phone}), ${niceTime}${service_type ? ` — ${service_type}` : ''}.`,
        relatedId: bookingId, messageType: 'booking_internal',
      })
    } catch (e) { console.error('[public/book] internal SMS error:', e) }
  }

  return NextResponse.json({ ok: true, booking_id: bookingId, scheduled_start: startISO })
}
