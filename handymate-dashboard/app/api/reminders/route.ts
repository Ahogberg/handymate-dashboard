import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServerSupabase } from '@/lib/supabase'
import { buildSmsSuffix } from '@/lib/sms-reply-number'


interface Booking {
  booking_id: string
  scheduled_start: string
  business_id: string
  customer: {
    name: string
    phone_number: string
  }
  business_config: {
    business_name: string
  }
}

/**
 * Genom strypunkten (etapp 0 batch 1, 2026-08-08).
 *
 * Bokningspåminnelser gick tidigare direkt mot 46elks utan opt-out-spärr,
 * utan sms_log och utan kostnadsmätning. Signaturen har utökats med tenant
 * och kund — utan dem går varken opt-out eller bokföring att göra.
 */
async function sendSMS(
  supabase: SupabaseClient,
  businessId: string,
  to: string,
  message: string,
  from: string,
  customerId?: string | null,
  bookingId?: string | null,
): Promise<boolean> {
  const { sendSmsViaElks } = await import('@/lib/sms-send')
  const r = await sendSmsViaElks({
    supabase,
    businessId,
    businessName: from,
    to,
    message,
    customerId: customerId || null,
    relatedId: bookingId || null,
    messageType: 'booking_reminder',
    recipient: 'customer',
    purpose: 'transactional',
  })
  if (!r.success) console.error('[reminders] SMS misslyckades:', r.error)
  return r.success
}

export async function POST(request: NextRequest) {
  // Tenant-svepet 2026-09-01: här låg `process.env.CRON_SECRET ||
  // 'handymate-cron-secret'` — en HÅRDKODAD reservhemlighet i källkoden.
  // Rutten läser bokningar över ALLA företag och skickar riktiga SMS, så
  // en saknad env-variabel hade öppnat plattformsbred SMS-sändning för
  // vem som helst som läst repot. Nu samma fail-closed helper som alla
  // cron-rutter (lib/cron/verify-secret.ts).
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServerSupabase()
    // Hitta bokningar som är 24h fram (med 1h marginal)
    const now = new Date()
    const in23Hours = new Date(now.getTime() + 23 * 60 * 60 * 1000)
    const in25Hours = new Date(now.getTime() + 25 * 60 * 60 * 1000)

    const { data: bookings, error } = await supabase
      .from('booking')
      .select(`
        booking_id,
        scheduled_start,
        business_id,
        reminder_sent,
        customer (
          name,
          phone_number
        ),
        business_config:business_id (
          business_name,
          assigned_phone_number
        )
      `)
      .eq('status', 'confirmed')
      .is('reminder_sent', null)
      .gte('scheduled_start', in23Hours.toISOString())
      .lte('scheduled_start', in25Hours.toISOString())

    if (error) throw error

    let sent = 0
    let failed = 0

    for (const booking of (bookings || []) as unknown as Booking[]) {
      const customer = booking.customer
      const business = booking.business_config

      if (!customer?.phone_number || !business?.business_name) continue

      const bookingDate = new Date(booking.scheduled_start)
      const timeStr = bookingDate.toLocaleTimeString('sv-SE', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })

      const suffix = buildSmsSuffix(business.business_name, (business as any).assigned_phone_number)
      const message = `Påminnelse: Du har en tid hos ${business.business_name} imorgon kl ${timeStr}. Välkommen! Behöver du ändra tiden?\n${suffix}`

      const success = await sendSMS(supabase, booking.business_id, customer.phone_number, message, business.business_name, (customer as any).customer_id ?? null, booking.booking_id)

      if (success) {
        // Markera som skickad
        await supabase
          .from('booking')
          .update({ reminder_sent: new Date().toISOString() })
          .eq('booking_id', booking.booking_id)
        sent++
      } else {
        failed++
      }
    }

    return NextResponse.json({ 
      success: true, 
      sent, 
      failed,
      checked: bookings?.length || 0
    })

  } catch (error: any) {
    console.error('Reminder error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET för manuell test
export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    message: 'Use POST with Bearer token to trigger reminders',
    endpoint: '/api/reminders'
  })
}
