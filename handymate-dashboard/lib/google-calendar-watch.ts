/**
 * Google Calendar Watch — realtidssynk via push notifications.
 * Registrerar en watch channel på användarens kalender.
 * Google skickar POST till /api/webhooks/google-calendar vid ändringar.
 * Watch channels förfaller efter 7 dagar — förnyas via cron.
 */

import { google } from 'googleapis'
import { getGoogleAuthClient } from './google-calendar'
import { getServerSupabase } from './supabase'
import crypto from 'crypto'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
const WEBHOOK_URL = `${APP_URL}/api/webhooks/google-calendar`

// Google Calendar watch max expiration: 7 dagar
const WATCH_EXPIRATION_MS = 6 * 24 * 60 * 60 * 1000 // 6 dagar (margin)

/**
 * Registrera en watch channel för en business calendar connection.
 */
export async function registerCalendarWatch(
  businessId: string,
  connectionId: string,
  accessToken: string,
  refreshToken: string,
  calendarId: string
): Promise<{ success: boolean; channelId?: string; error?: string }> {
  try {
    const auth = getGoogleAuthClient({ access_token: accessToken, refresh_token: refreshToken })
    const calendar = google.calendar({ version: 'v3', auth })

    const channelId = `hm-${businessId}-${crypto.randomUUID().slice(0, 8)}`
    const expiration = Date.now() + WATCH_EXPIRATION_MS

    const response = await calendar.events.watch({
      calendarId: calendarId || 'primary',
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: WEBHOOK_URL,
        expiration: String(expiration),
      },
    })

    const resourceId = response.data.resourceId || ''
    const expirationTime = response.data.expiration
      ? new Date(parseInt(response.data.expiration))
      : new Date(expiration)

    // Spara i databasen
    const supabase = getServerSupabase()

    // Inaktivera gamla watches för denna connection
    await supabase
      .from('calendar_watches')
      .update({ is_active: false })
      .eq('calendar_connection_id', connectionId)
      .eq('is_active', true)

    // Skapa ny watch
    await supabase.from('calendar_watches').insert({
      business_id: businessId,
      calendar_connection_id: connectionId,
      channel_id: channelId,
      resource_id: resourceId,
      expires_at: expirationTime.toISOString(),
      is_active: true,
    })

    console.log(`[Calendar Watch] Registered: ${channelId} for ${businessId}, expires ${expirationTime.toISOString()}`)

    return { success: true, channelId }
  } catch (error: any) {
    console.error(`[Calendar Watch] Registration failed for ${businessId}:`, error.message)
    return { success: false, error: error.message }
  }
}

/**
 * Stoppa en watch channel.
 */
export async function stopCalendarWatch(
  accessToken: string,
  refreshToken: string,
  channelId: string,
  resourceId: string
): Promise<void> {
  try {
    const auth = getGoogleAuthClient({ access_token: accessToken, refresh_token: refreshToken })
    const calendar = google.calendar({ version: 'v3', auth })

    await calendar.channels.stop({
      requestBody: {
        id: channelId,
        resourceId,
      },
    })
  } catch (error: any) {
    // Ignorera — kanalen kan redan vara utgången
    console.warn(`[Calendar Watch] Stop failed (probably expired): ${error.message}`)
  }
}

/**
 * Förnya alla watches som snart förfaller (inom 24h).
 * Körs från sync-calendars cron.
 */
export async function renewExpiringWatches(): Promise<{
  renewed: number
  failed: number
  errors: string[]
}> {
  const supabase = getServerSupabase()
  const threshold = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  // Hitta watches som förfaller inom 24h
  const { data: expiring } = await supabase
    .from('calendar_watches')
    .select(`
      id, business_id, calendar_connection_id, channel_id, resource_id,
      connection:calendar_connection_id (
        id, access_token, refresh_token, calendar_id, sync_enabled
      )
    `)
    .eq('is_active', true)
    .lt('expires_at', threshold)
    .limit(20)

  if (!expiring || expiring.length === 0) {
    return { renewed: 0, failed: 0, errors: [] }
  }

  let renewed = 0
  let failed = 0
  const errors: string[] = []

  for (const watch of expiring) {
    const conn = watch.connection as any
    if (!conn?.sync_enabled || !conn?.access_token) {
      // Inaktivera watch om connection är borttagen/avaktiverad
      await supabase
        .from('calendar_watches')
        .update({ is_active: false })
        .eq('id', watch.id)
      continue
    }

    // Stoppa gammal watch
    await stopCalendarWatch(conn.access_token, conn.refresh_token, watch.channel_id, watch.resource_id)

    // Registrera ny
    const result = await registerCalendarWatch(
      watch.business_id,
      conn.id,
      conn.access_token,
      conn.refresh_token,
      conn.calendar_id || 'primary'
    )

    if (result.success) {
      renewed++
    } else {
      failed++
      errors.push(`${watch.business_id}: ${result.error}`)
    }
  }

  return { renewed, failed, errors }
}

/**
 * Registrera watch för alla aktiva connections som saknar en.
 * Körs en gång vid setup eller efter deploy.
 */
export async function ensureAllWatches(): Promise<{
  registered: number
  alreadyActive: number
  failed: number
}> {
  const supabase = getServerSupabase()

  // Hitta connections utan aktiv watch
  const { data: connections } = await supabase
    .from('calendar_connection')
    .select('id, business_id, access_token, refresh_token, calendar_id')
    .eq('sync_enabled', true)
    .limit(50)

  if (!connections || connections.length === 0) {
    return { registered: 0, alreadyActive: 0, failed: 0 }
  }

  let registered = 0
  let alreadyActive = 0
  let failed = 0

  for (const conn of connections) {
    // Kolla om aktiv watch redan finns
    const { data: existing } = await supabase
      .from('calendar_watches')
      .select('id')
      .eq('calendar_connection_id', conn.id)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (existing) {
      alreadyActive++
      continue
    }

    const result = await registerCalendarWatch(
      conn.business_id,
      conn.id,
      conn.access_token,
      conn.refresh_token,
      conn.calendar_id || 'primary'
    )

    if (result.success) {
      registered++
    } else {
      failed++
    }
  }

  return { registered, alreadyActive, failed }
}
