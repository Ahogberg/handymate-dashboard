import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import {
  ensureValidToken,
  getCalendarEvents,
  createGoogleEvent,
} from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'

const MAX_CONNECTIONS_PER_RUN = 10

/**
 * GET /api/cron/sync-calendars
 * Vercel Cron job to sync all enabled calendar connections
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // Get all enabled calendar connections (rate limited)
    const { data: connections, error: fetchError } = await supabase
      .from('calendar_connection')
      .select('*')
      .eq('sync_enabled', true)
      .limit(MAX_CONNECTIONS_PER_RUN)

    if (fetchError) {
      console.error('Error fetching calendar connections:', fetchError)
      throw fetchError
    }

    if (!connections || connections.length === 0) {
      return NextResponse.json({ synced: 0, failed: 0, skipped: 0 })
    }

    let synced = 0
    let failed = 0
    let skipped = 0

    for (const connection of connections) {
      try {
        // Ensure valid token
        const tokenResult = await ensureValidToken(connection)
        if (!tokenResult) {
          // Token refresh failed, set sync_error and skip
          await supabase
            .from('calendar_connection')
            .update({ sync_error: 'Failed to refresh access token' })
            .eq('id', connection.id)
          failed++
          continue
        }

        // Update token in DB if refreshed
        if (tokenResult.access_token !== connection.access_token) {
          await supabase
            .from('calendar_connection')
            .update({
              access_token: tokenResult.access_token,
              token_expires_at: new Date(tokenResult.expiry_date).toISOString(),
            })
            .eq('id', connection.id)
        }

        const accessToken = tokenResult.access_token
        const calendarId = connection.calendar_id || 'primary'
        const syncDirection = connection.sync_direction || 'both'
        const businessId = connection.business_id
        const businessUserId = connection.business_user_id

        // Date range: 30 days back to 90 days forward
        const timeMin = new Date()
        timeMin.setDate(timeMin.getDate() - 30)
        const timeMax = new Date()
        timeMax.setDate(timeMax.getDate() + 90)

        // ---- IMPORT FROM GOOGLE ----
        if (syncDirection === 'import' || syncDirection === 'both') {
          const googleEvents = await getCalendarEvents(accessToken, calendarId, timeMin, timeMax)
          const googleEventIds = new Set(googleEvents.map((e) => e.id))

          for (const gEvent of googleEvents) {
            const { data: existing } = await supabase
              .from('schedule_entry')
              .select('id, title, start_datetime, end_datetime')
              .eq('business_id', businessId)
              .eq('google_event_id', gEvent.id)
              .single()

            if (!existing) {
              const id = `sch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
              await supabase.from('schedule_entry').insert({
                id,
                business_id: businessId,
                business_user_id: businessUserId,
                title: gEvent.summary,
                description: gEvent.description,
                start_datetime: gEvent.start.toISOString(),
                end_datetime: gEvent.end.toISOString(),
                all_day: gEvent.allDay,
                type: 'external',
                external_source: 'google',
                status: 'scheduled',
                google_event_id: gEvent.id,
              })
            } else {
              const startChanged = new Date(existing.start_datetime).getTime() !== gEvent.start.getTime()
              const endChanged = new Date(existing.end_datetime).getTime() !== gEvent.end.getTime()
              const titleChanged = existing.title !== gEvent.summary

              if (startChanged || endChanged || titleChanged) {
                await supabase
                  .from('schedule_entry')
                  .update({
                    title: gEvent.summary,
                    start_datetime: gEvent.start.toISOString(),
                    end_datetime: gEvent.end.toISOString(),
                  })
                  .eq('id', existing.id)
              }
            }
          }

          // Cancel entries whose Google events no longer exist
          const { data: externalEntries } = await supabase
            .from('schedule_entry')
            .select('id, google_event_id')
            .eq('business_id', businessId)
            .eq('business_user_id', businessUserId)
            .eq('type', 'external')
            .eq('external_source', 'google')
            .neq('status', 'cancelled')
            .gte('start_datetime', timeMin.toISOString())
            .lte('end_datetime', timeMax.toISOString())

          if (externalEntries) {
            for (const entry of externalEntries) {
              if (entry.google_event_id && !googleEventIds.has(entry.google_event_id)) {
                await supabase
                  .from('schedule_entry')
                  .update({ status: 'cancelled' })
                  .eq('id', entry.id)
              }
            }
          }
        }

        // ---- EXPORT TO GOOGLE ----
        if (syncDirection === 'export' || syncDirection === 'both') {
          const { data: localEntries } = await supabase
            .from('schedule_entry')
            .select('*')
            .eq('business_id', businessId)
            .eq('business_user_id', businessUserId)
            .neq('type', 'external')
            .neq('status', 'cancelled')
            .is('synced_to_google_at', null)
            .gte('start_datetime', timeMin.toISOString())
            .lte('end_datetime', timeMax.toISOString())

          if (localEntries) {
            for (const entry of localEntries) {
              try {
                const googleEventId = await createGoogleEvent(accessToken, calendarId, {
                  summary: entry.title,
                  description: entry.description || undefined,
                  start: new Date(entry.start_datetime),
                  end: new Date(entry.end_datetime),
                  allDay: entry.all_day || false,
                })

                await supabase
                  .from('schedule_entry')
                  .update({
                    google_event_id: googleEventId,
                    synced_to_google_at: new Date().toISOString(),
                  })
                  .eq('id', entry.id)
              } catch (err) {
                console.error(`Error exporting entry ${entry.id} to Google:`, err)
              }
            }
          }
        }

        // Update last_sync_at and clear errors
        await supabase
          .from('calendar_connection')
          .update({ last_sync_at: new Date().toISOString(), sync_error: null })
          .eq('id', connection.id)

        synced++
      } catch (err) {
        console.error(`Error syncing connection ${connection.id}:`, err)
        const errorMessage = err instanceof Error ? err.message : 'Sync failed'
        await supabase
          .from('calendar_connection')
          .update({ sync_error: errorMessage })
          .eq('id', connection.id)
        failed++
      }
    }

    return NextResponse.json({ synced, failed, skipped })
  } catch (error: unknown) {
    console.error('Cron sync-calendars error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Cron job failed'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
