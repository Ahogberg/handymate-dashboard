import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import {
  ensureValidToken,
  getCalendarEvents,
  createGoogleEvent,
} from '@/lib/google-calendar'

/**
 * POST /api/google/sync
 * Sync calendar events between Handymate and Google Calendar
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // Get calendar connection
    const { data: connection, error: connError } = await supabase
      .from('calendar_connection')
      .select('*')
      .eq('business_user_id', currentUser.id)
      .eq('provider', 'google')
      .single()

    if (connError || !connection) {
      return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 404 })
    }

    // Ensure valid token
    const tokenResult = await ensureValidToken(connection)
    if (!tokenResult) {
      return NextResponse.json({ error: 'Failed to refresh token' }, { status: 401 })
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

    // Date range: 30 days back to 90 days forward
    const timeMin = new Date()
    timeMin.setDate(timeMin.getDate() - 30)
    const timeMax = new Date()
    timeMax.setDate(timeMax.getDate() + 90)

    let imported = 0
    let exported = 0
    let updated = 0
    let errors = 0

    // ---- IMPORT FROM GOOGLE ----
    if (syncDirection === 'import' || syncDirection === 'both') {
      try {
        const googleEvents = await getCalendarEvents(accessToken, calendarId, timeMin, timeMax)
        const googleEventIds = new Set(googleEvents.map((e) => e.id))

        for (const gEvent of googleEvents) {
          try {
            // Check if schedule_entry with this google_event_id exists
            const { data: existing } = await supabase
              .from('schedule_entry')
              .select('id, title, start_datetime, end_datetime')
              .eq('business_id', business.business_id)
              .eq('google_event_id', gEvent.id)
              .single()

            if (!existing) {
              // Create new schedule_entry
              const id = `sch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
              const { error: insertError } = await supabase
                .from('schedule_entry')
                .insert({
                  id,
                  business_id: business.business_id,
                  business_user_id: currentUser.id,
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

              if (insertError) {
                console.error('Error importing event:', insertError)
                errors++
              } else {
                imported++
              }
            } else {
              // Update if title or times changed
              const startChanged = new Date(existing.start_datetime).getTime() !== gEvent.start.getTime()
              const endChanged = new Date(existing.end_datetime).getTime() !== gEvent.end.getTime()
              const titleChanged = existing.title !== gEvent.summary

              if (startChanged || endChanged || titleChanged) {
                const { error: updateError } = await supabase
                  .from('schedule_entry')
                  .update({
                    title: gEvent.summary,
                    start_datetime: gEvent.start.toISOString(),
                    end_datetime: gEvent.end.toISOString(),
                  })
                  .eq('id', existing.id)

                if (updateError) {
                  console.error('Error updating event:', updateError)
                  errors++
                } else {
                  updated++
                }
              }
            }
          } catch (err) {
            console.error('Error processing Google event:', err)
            errors++
          }
        }

        // Cancel schedule_entries whose Google events no longer exist
        const { data: externalEntries } = await supabase
          .from('schedule_entry')
          .select('id, google_event_id')
          .eq('business_id', business.business_id)
          .eq('business_user_id', currentUser.id)
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
      } catch (err) {
        console.error('Error during import from Google:', err)
        errors++
      }
    }

    // ---- EXPORT TO GOOGLE ----
    if (syncDirection === 'export' || syncDirection === 'both') {
      try {
        // Get schedule entries that are not external and haven't been synced to Google
        const { data: localEntries } = await supabase
          .from('schedule_entry')
          .select('*')
          .eq('business_id', business.business_id)
          .eq('business_user_id', currentUser.id)
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

              exported++
            } catch (err) {
              console.error('Error exporting event to Google:', err)
              errors++
            }
          }
        }
      } catch (err) {
        console.error('Error during export to Google:', err)
        errors++
      }
    }

    // Update last_sync_at
    await supabase
      .from('calendar_connection')
      .update({ last_sync_at: new Date().toISOString(), sync_error: null })
      .eq('id', connection.id)

    return NextResponse.json({ imported, exported, updated, errors })
  } catch (error: unknown) {
    console.error('Google sync error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Sync failed'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
