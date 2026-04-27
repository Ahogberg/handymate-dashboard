/**
 * Google Calendar sync för bookings.
 *
 * Inkapslar token-hantering och CRUD mot Google Calendar API.
 * Alla funktioner är non-blocking — fel loggas men kastar inte vidare,
 * så booking-flödet fortsätter även om Google-sync misslyckas.
 */

import { ensureValidToken, createGoogleEvent, updateGoogleEvent, deleteGoogleEvent } from '@/lib/google-calendar'
import type { SupabaseClient } from '@supabase/supabase-js'

interface CalendarConnection {
  id: string
  access_token: string
  refresh_token: string
  token_expires_at: string | null
  calendar_id: string
  sync_enabled: boolean
}

/**
 * Hämtar Google Calendar-koppling för ett business + säkerställer giltig token.
 * Försöker via business_users → calendar_connection.business_user_id först,
 * fallback till calendar_connection.business_id direkt.
 *
 * @returns null om ingen koppling finns eller token-refresh misslyckats
 */
export async function getCalendarConnectionForBusiness(
  supabase: SupabaseClient,
  businessId: string,
  businessUserId: string | null
): Promise<CalendarConnection | null> {
  let conn: CalendarConnection | null = null

  // 1. Försök via business_users först
  if (businessUserId) {
    const { data: businessUser } = await supabase
      .from('business_users')
      .select('id')
      .eq('business_id', businessId)
      .eq('user_id', businessUserId)
      .eq('is_active', true)
      .maybeSingle()

    if (businessUser) {
      const { data } = await supabase
        .from('calendar_connection')
        .select('id, access_token, refresh_token, token_expires_at, calendar_id, sync_enabled')
        .eq('business_user_id', businessUser.id)
        .eq('provider', 'google')
        .maybeSingle()
      if (data) conn = data as CalendarConnection
    }
  }

  // 2. Fallback: koppla direkt på business_id
  if (!conn) {
    const { data } = await supabase
      .from('calendar_connection')
      .select('id, access_token, refresh_token, token_expires_at, calendar_id, sync_enabled')
      .eq('business_id', businessId)
      .eq('provider', 'google')
      .maybeSingle()
    if (data) conn = data as CalendarConnection
  }

  if (!conn || !conn.sync_enabled) return null

  // 3. Säkerställ giltig token
  try {
    const refreshed = await ensureValidToken(conn)
    if (!refreshed) return null

    // Om token blev uppdaterad — spara tillbaka
    if (refreshed.access_token !== conn.access_token) {
      await supabase
        .from('calendar_connection')
        .update({
          access_token: refreshed.access_token,
          token_expires_at: new Date(refreshed.expiry_date).toISOString(),
        })
        .eq('id', conn.id)
      conn.access_token = refreshed.access_token
    }

    return conn
  } catch (err) {
    console.error('[google-calendar-sync] token refresh failed:', err)
    return null
  }
}

interface BookingForSync {
  booking_id: string
  scheduled_start: string
  scheduled_end: string | null
  notes: string | null
  customer_name?: string | null
}

/**
 * Skapa ett Google Calendar-event för en bokning.
 * Returnerar { eventId, calendarId } eller null om sync inte kunde göras.
 */
export async function syncBookingToCalendar(
  supabase: SupabaseClient,
  businessId: string,
  businessUserId: string | null,
  booking: BookingForSync
): Promise<{ eventId: string; calendarId: string } | null> {
  const conn = await getCalendarConnectionForBusiness(supabase, businessId, businessUserId)
  if (!conn) return null

  try {
    const start = new Date(booking.scheduled_start)
    // Default 1h om scheduled_end saknas
    const end = booking.scheduled_end
      ? new Date(booking.scheduled_end)
      : new Date(start.getTime() + 60 * 60 * 1000)

    const summary = booking.customer_name
      ? `${booking.customer_name}${booking.notes ? ' — ' + booking.notes.split(' — ')[0] : ''}`
      : (booking.notes || 'Bokning')

    const description = [
      booking.notes,
      `Bokning: ${booking.booking_id}`,
      'Synkad från Handymate',
    ].filter(Boolean).join('\n\n')

    const eventId = await createGoogleEvent(conn.access_token, conn.calendar_id, {
      summary,
      description,
      start,
      end,
    })

    return { eventId, calendarId: conn.calendar_id }
  } catch (err) {
    console.error('[google-calendar-sync] createEvent failed:', err)
    return null
  }
}

/**
 * Uppdatera ett befintligt Google Calendar-event för en bokning.
 */
export async function updateBookingInCalendar(
  supabase: SupabaseClient,
  businessId: string,
  businessUserId: string | null,
  eventId: string,
  calendarId: string,
  changes: {
    scheduled_start?: string
    scheduled_end?: string | null
    notes?: string | null
    customer_name?: string | null
  }
): Promise<boolean> {
  const conn = await getCalendarConnectionForBusiness(supabase, businessId, businessUserId)
  if (!conn) return false

  try {
    const update: {
      summary?: string
      description?: string
      start?: Date
      end?: Date
    } = {}

    if (changes.notes !== undefined || changes.customer_name !== undefined) {
      update.summary = changes.customer_name
        ? `${changes.customer_name}${changes.notes ? ' — ' + changes.notes.split(' — ')[0] : ''}`
        : (changes.notes || 'Bokning')
      update.description = [
        changes.notes,
        'Synkad från Handymate',
      ].filter(Boolean).join('\n\n')
    }

    if (changes.scheduled_start) {
      update.start = new Date(changes.scheduled_start)
      update.end = changes.scheduled_end
        ? new Date(changes.scheduled_end)
        : new Date(update.start.getTime() + 60 * 60 * 1000)
    }

    await updateGoogleEvent(conn.access_token, calendarId, eventId, update)
    return true
  } catch (err) {
    console.error('[google-calendar-sync] updateEvent failed:', err)
    return false
  }
}

/**
 * Ta bort ett Google Calendar-event som hör till en bokning.
 */
export async function deleteBookingFromCalendar(
  supabase: SupabaseClient,
  businessId: string,
  businessUserId: string | null,
  eventId: string,
  calendarId: string
): Promise<boolean> {
  const conn = await getCalendarConnectionForBusiness(supabase, businessId, businessUserId)
  if (!conn) return false

  try {
    await deleteGoogleEvent(conn.access_token, calendarId, eventId)
    return true
  } catch (err) {
    console.error('[google-calendar-sync] deleteEvent failed:', err)
    return false
  }
}
