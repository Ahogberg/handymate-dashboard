import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { ensureValidToken, getCalendarEvents } from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/google-calendar
 * Google Calendar push notification webhook.
 * Google skickar POST hit vid varje kalenderändring.
 * Headers: X-Goog-Channel-ID, X-Goog-Resource-ID, X-Goog-Resource-State
 */
export async function POST(request: NextRequest) {
  try {
    const channelId = request.headers.get('x-goog-channel-id') || ''
    const resourceState = request.headers.get('x-goog-resource-state') || ''
    const resourceId = request.headers.get('x-goog-resource-id') || ''

    // 'sync' = initial handshake, 'exists' = actual change
    if (resourceState === 'sync') {
      console.log(`[Calendar Webhook] Sync handshake for channel ${channelId}`)
      return new NextResponse(null, { status: 200 })
    }

    if (resourceState !== 'exists') {
      return new NextResponse(null, { status: 200 })
    }

    const supabase = getServerSupabase()

    // Hitta vilken business som äger denna channel
    const { data: watch } = await supabase
      .from('calendar_watches')
      .select('business_id, calendar_connection_id')
      .eq('channel_id', channelId)
      .eq('is_active', true)
      .single()

    if (!watch) {
      console.warn(`[Calendar Webhook] Unknown channel: ${channelId}`)
      return new NextResponse(null, { status: 200 })
    }

    // Hämta calendar connection
    const { data: connection } = await supabase
      .from('calendar_connection')
      .select('*')
      .eq('id', watch.calendar_connection_id)
      .single()

    if (!connection || !connection.sync_enabled) {
      return new NextResponse(null, { status: 200 })
    }

    // Säkerställ giltig token
    const tokenResult = await ensureValidToken(connection)
    if (!tokenResult) {
      console.error(`[Calendar Webhook] Token refresh failed for ${watch.business_id}`)
      return new NextResponse(null, { status: 200 })
    }

    // Hämta senaste händelser (senaste 5 min för att fånga ändringen)
    const from = new Date(Date.now() - 5 * 60 * 1000)
    const to = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 dagar framåt

    const events = await getCalendarEvents(
      tokenResult.access_token,
      connection.calendar_id || 'primary',
      from,
      to
    )

    // Synka till booking-tabellen
    let synced = 0
    for (const event of events) {
      if (event.allDay) continue

      // Kolla om bokning redan finns med detta google_event_id
      const { data: existing } = await supabase
        .from('booking')
        .select('booking_id, scheduled_start')
        .eq('business_id', watch.business_id)
        .eq('google_event_id', event.id)
        .maybeSingle()

      if (existing) {
        // Uppdatera om tid ändrats
        const existingStart = new Date(existing.scheduled_start).getTime()
        const newStart = event.start.getTime()
        if (Math.abs(existingStart - newStart) > 60000) {
          await supabase
            .from('booking')
            .update({
              scheduled_start: event.start.toISOString(),
              scheduled_end: event.end.toISOString(),
              synced_from_google_at: new Date().toISOString(),
            })
            .eq('booking_id', existing.booking_id)
          synced++
        }
      }
      // Nya events från Google → skapas inte som bokningar automatiskt
      // (det vore förvirrande — bara synka existerande)
    }

    // Uppdatera last_synced
    await supabase
      .from('calendar_connection')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', connection.id)

    console.log(`[Calendar Webhook] ${watch.business_id}: ${synced} bookings updated from ${events.length} events`)

    return new NextResponse(null, { status: 200 })
  } catch (error: any) {
    console.error('[Calendar Webhook] Error:', error.message)
    // Returnera alltid 200 — annars stoppar Google att skicka notiser
    return new NextResponse(null, { status: 200 })
  }
}
