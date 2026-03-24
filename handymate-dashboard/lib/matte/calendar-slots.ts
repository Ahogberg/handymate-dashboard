/**
 * V33 — Hitta lediga tider i Google Calendar för bokningsförslag.
 */

import { getCalendarEvents } from '@/lib/google-calendar'
import { getServerSupabase } from '@/lib/supabase'
import { ensureValidToken } from '@/lib/google-calendar'

export interface TimeSlot {
  start: string   // ISO timestamp
  end: string     // ISO timestamp
  label: string   // "måndag 14 april kl 09:00–11:00"
}

export async function getAvailableSlots(
  businessId: string,
  durationHours: number = 2,
): Promise<TimeSlot[]> {
  const supabase = getServerSupabase()

  // Hämta Google Calendar-koppling
  const { data: conn } = await supabase
    .from('calendar_connection')
    .select('id, access_token, refresh_token, token_expires_at, calendar_id, sync_enabled')
    .eq('business_id', businessId)
    .eq('provider', 'google')
    .eq('sync_enabled', true)
    .maybeSingle()

  if (!conn?.access_token) return []

  // Refresh token om det behövs
  let accessToken = conn.access_token
  try {
    const tokenResult = await ensureValidToken(conn as any)
    if (tokenResult?.access_token) {
      accessToken = tokenResult.access_token
      if (tokenResult.access_token !== conn.access_token) {
        await supabase
          .from('calendar_connection')
          .update({
            access_token: tokenResult.access_token,
            token_expires_at: new Date(tokenResult.expiry_date).toISOString(),
          })
          .eq('id', conn.id)
      }
    }
  } catch {
    // Fortsätt med befintlig token
  }

  // Sök 14 dagar framåt
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setDate(to.getDate() + 14)

  // Hämta befintliga händelser
  let busySlots: Array<{ start: Date; end: Date }> = []
  try {
    const events = await getCalendarEvents(
      accessToken,
      conn.calendar_id || 'primary',
      from,
      to
    )
    busySlots = events
      .filter(e => !e.allDay)
      .map(e => ({ start: e.start, end: e.end }))
  } catch (err) {
    console.error('[calendar-slots] Google Calendar error:', err)
    return []
  }

  // Hitta lediga luckor (mån-fre 07:00-17:00)
  const slots = findFreeSlots(from, to, busySlots, 7, 17, durationHours)

  return slots.slice(0, 3).map(slot => ({
    start: slot.start.toISOString(),
    end: slot.end.toISOString(),
    label: formatSwedishSlot(slot.start, slot.end),
  }))
}

function findFreeSlots(
  from: Date,
  to: Date,
  busy: Array<{ start: Date; end: Date }>,
  workStartHour: number,
  workEndHour: number,
  durationHours: number
): Array<{ start: Date; end: Date }> {
  const slots: Array<{ start: Date; end: Date }> = []
  const durationMs = durationHours * 60 * 60 * 1000

  const cursor = new Date(from)
  while (cursor < to && slots.length < 10) {
    const dayOfWeek = cursor.getDay()

    // Hoppa helger
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      cursor.setDate(cursor.getDate() + 1)
      continue
    }

    const dayStart = new Date(cursor)
    dayStart.setHours(workStartHour, 0, 0, 0)
    const dayEnd = new Date(cursor)
    dayEnd.setHours(workEndHour, 0, 0, 0)

    // Börja minst 2h från nu
    const earliest = new Date(Math.max(dayStart.getTime(), Date.now() + 2 * 60 * 60 * 1000))
    const slotStart = new Date(earliest)

    while (slotStart.getTime() + durationMs <= dayEnd.getTime()) {
      const slotEnd = new Date(slotStart.getTime() + durationMs)

      const overlaps = busy.some(b =>
        slotStart < b.end && slotEnd > b.start
      )

      if (!overlaps) {
        slots.push({ start: new Date(slotStart), end: new Date(slotEnd) })
        slotStart.setTime(slotEnd.getTime())
        continue
      }

      slotStart.setMinutes(slotStart.getMinutes() + 30)
    }

    cursor.setDate(cursor.getDate() + 1)
  }

  return slots
}

function formatSwedishSlot(start: Date, end: Date): string {
  const days = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag']
  const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

  const dayName = days[start.getDay()]
  const date = start.getDate()
  const month = months[start.getMonth()]
  const pad = (n: number) => String(n).padStart(2, '0')
  const startStr = `${pad(start.getHours())}:${pad(start.getMinutes())}`
  const endStr = `${pad(end.getHours())}:${pad(end.getMinutes())}`

  return `${dayName} ${date} ${month} kl ${startStr}–${endStr}`
}
