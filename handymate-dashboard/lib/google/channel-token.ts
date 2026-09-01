/**
 * Kanaltoken för Google Calendar-push (tenant-svepet 2026-09-01).
 *
 * Webhooken /api/webhooks/google-calendar läste tidigare bara
 * X-Goog-Channel-ID och slog upp den i calendar_watches. Kanal-id:t är
 * genererat av oss men delas med Google och hamnar i loggar; den som
 * kände till det kunde tvinga fram en full kalendersynk för ett företag
 * hur många gånger som helst (kvot- och token-slitage).
 *
 * Google stödjer ett hemligt `token` per kanal som skickas tillbaka i
 * X-Goog-Channel-Token på varje notis. Tokenet härleds deterministiskt ur
 * kanal-id:t med CRON_SECRET som nyckel — ingen ny kolumn, inget att
 * synka: registreringen och webhooken räknar fram samma värde.
 */

import { createHmac, timingSafeEqual } from 'crypto'

export function calendarChannelToken(
  channelId: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const key = env.CALENDAR_CHANNEL_SECRET || env.CRON_SECRET
  if (!key || !key.trim() || !channelId) return null
  return createHmac('sha256', key).update(`gcal-channel:${channelId}`).digest('base64url')
}

export function calendarChannelTokenMatches(
  channelId: string,
  presented: string | null | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const expected = calendarChannelToken(channelId, env)
  if (!expected || !presented) return false
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
