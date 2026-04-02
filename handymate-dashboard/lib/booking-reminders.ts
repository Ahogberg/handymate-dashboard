/**
 * Bokningspåminnelse — skickar SMS 24h före bokning till kund.
 * Körs från nattlig cron (agent-context).
 */

import { getServerSupabase } from '@/lib/supabase'
import { buildSmsSuffix } from '@/lib/sms-reply-number'

export async function sendBookingReminders(
  businessId: string
): Promise<{ success: boolean; sent: number; error?: string }> {
  const supabase = getServerSupabase()

  try {
    // Hitta bokningar imorgon (24h framåt)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStart = tomorrow.toISOString().split('T')[0] + 'T00:00:00'
    const tomorrowEnd = tomorrow.toISOString().split('T')[0] + 'T23:59:59'

    const { data: bookings } = await supabase
      .from('booking')
      .select(`
        booking_id, scheduled_start, notes, status,
        customer:customer_id(name, phone_number, customer_id)
      `)
      .eq('business_id', businessId)
      .gte('scheduled_start', tomorrowStart)
      .lte('scheduled_start', tomorrowEnd)
      .in('status', ['pending', 'confirmed'])

    if (!bookings || bookings.length === 0) {
      return { success: true, sent: 0 }
    }

    // Hämta företagsnamn
    const { data: config } = await supabase
      .from('business_config')
      .select('business_name, contact_name, assigned_phone_number')
      .eq('business_id', businessId)
      .single()

    const bizName = config?.business_name || 'Vi'
    const suffix = buildSmsSuffix(bizName, config?.assigned_phone_number)

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
    let sent = 0

    for (const booking of bookings) {
      const customer = booking.customer as any
      if (!customer?.phone_number) continue

      // Kolla om påminnelse redan skickats (via sms_log)
      const { data: alreadySent } = await supabase
        .from('sms_log')
        .select('sms_id')
        .eq('business_id', businessId)
        .eq('phone_to', customer.phone_number)
        .ilike('message', '%påminnelse%imorgon%')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle()

      if (alreadySent) continue // Redan påmind

      const time = new Date(booking.scheduled_start).toLocaleTimeString('sv-SE', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Stockholm',
      })

      const customerName = customer.name?.split(' ')[0] || ''
      const jobDesc = booking.notes?.split(' — ')[0]?.slice(0, 40) || 'ditt besök'

      const message = `Hej ${customerName}! Påminnelse om ${jobDesc} imorgon kl ${time}. Vi ses!\n${suffix}`

      try {
        await fetch(`${appUrl}/api/sms/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: businessId,
            to: customer.phone_number,
            message,
          }),
        })
        sent++
      } catch { /* continue with next */ }
    }

    return { success: true, sent }
  } catch (err: any) {
    return { success: false, sent: 0, error: err.message }
  }
}
