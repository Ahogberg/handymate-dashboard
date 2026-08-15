import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { stockholmLocalToISO } from '@/lib/bookings/availability'
import { normalizeSwedishPhone } from '@/lib/phone-normalize'
import { sendSmsViaElks } from '@/lib/sms-send'
import { syncBookingToCalendar } from '@/lib/google-calendar-sync'
import { createLeadAndDeal } from '@/lib/leads/golden-path'

export const dynamic = 'force-dynamic'

/**
 * POST /api/public/book/[slug]
 * Publik (ingen auth) — kund bokar en ledig tid via storefront-slug.
 * Body: { date, time, duration, name, phone, email?, service_type?, notes? }
 * Går via Golden Path (lib/leads/golden-path.ts) för kund + lead + deal —
 * gör bokningskanalen synlig i pipelinen (Increment A6, 2026-08-10) — sen
 * booking, kalendersynk, SMS-bekräftelse till kund + notis till hantverkaren.
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

  // Golden Path: kund + lead + deal (Increment A6, 2026-08-10) — gör
  // bokningskanalen synlig i pipelinen istället för att bara skapa kund +
  // booking i det tysta. Kund-uppslaget/skapandet delegeras hit — golden
  // pathens dedup (normaliserad telefon → e-post, se
  // lib/leads/golden-path.ts) är starkare än ruttens gamla exakta
  // telefon-eq-match. Clash-checken ovan ÄR ruttens idempotens för
  // dubbelklick/ombokning på samma tid: den körs INNAN detta anrop, så en
  // riktig dubbel-submission stoppas med 409 där och hinner aldrig skapa
  // en andra lead/deal här.
  //
  // notify:false — bokningsflödet skickar redan sin egen bekräftelse till
  // kunden och notis till hantverkaren längre ner i denna rutt. Golden
  // paths ägar-SMS ("Ny lead") plus det seedade snabbsvars-SMS:et till
  // kunden ("tack för din förfrågan, vi återkommer") ovanpå en
  // bokningsbekräftelse vore förvirrande dubbelkommunikation. notify:false
  // skapar lead + deal men hoppar över SMS + automation-event.
  const niceTime = `${date} kl ${time}`
  const leadMessage = [service_type, notes, `Önskad tid: ${niceTime}`].filter(Boolean).join(' — ')
  const gp = await createLeadAndDeal(
    {
      businessId,
      businessPhoneNumber: config?.phone_number || null,
      name: name.trim(),
      phone,
      email: email || null,
      message: leadMessage,
      source: 'website_form',
      notify: false,
    },
    supabase,
  )
  // Ett tyst deal-fel får aldrig se ut som success — logga det, men blockera
  // inte bokningen (kunden ska ändå få sin tid).
  if (gp.dealError) {
    console.error('[public/book] Lead skapad men deal misslyckades:', gp.dealError)
  }
  const customerId = gp.customerId

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
  // (niceTime är redan beräknad ovan, till golden path-meddelandet)
  const company = config?.business_name || 'Vi'
  try {
    await sendSmsViaElks({
      supabase, businessId, businessName: config?.business_name, to: phone,
      message: `Hej ${name.split(' ')[0]}! Din tid hos ${company} är bokad: ${niceTime}. Vi hör av oss om något behöver ändras.`,
      customerId, relatedId: bookingId, messageType: 'booking_confirmation',
      recipient: 'customer', purpose: 'transactional',
    })
  } catch (e) { console.error('[public/book] customer SMS error:', e) }

  if (config?.phone_number) {
    try {
      await sendSmsViaElks({
        supabase, businessId, businessName: config?.business_name, to: config.phone_number,
        message: `Ny bokning via hemsidan: ${name} (${phone}), ${niceTime}${service_type ? ` — ${service_type}` : ''}.`,
        relatedId: bookingId, messageType: 'booking_internal',
        recipient: 'internal', purpose: 'internal',
      })
    } catch (e) { console.error('[public/book] internal SMS error:', e) }
  }

  return NextResponse.json({ ok: true, booking_id: bookingId, scheduled_start: startISO })
}
