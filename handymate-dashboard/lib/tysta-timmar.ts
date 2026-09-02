/**
 * Tysta timmar — rena tidsfunktioner i svensk tid (Europe/Stockholm).
 *
 * Flyttade hit från lib/outbound/hub-gate.ts (2026-09-02) så både SMS-
 * grinden (hub-gate) och push-pausen (lib/notifications/tyst-tid.ts)
 * räknar på exakt samma klocka. Servern (Vercel) går i UTC — räkna ALDRIG
 * på Date#getHours() för ett svenskt klockslag.
 */

/** Ren: är klockslaget (minuter sedan midnatt) inom tysta timmar? Hanterar över midnatt (21:00–07:00). */
export function isWithinQuietHours(startStr: string, endStr: string, minutesNow: number): boolean {
  const parse = (s: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec((s || '').trim())
    if (!m) return null
    const h = Number(m[1]), min = Number(m[2])
    if (h > 23 || min > 59) return null
    return h * 60 + min
  }
  const start = parse(startStr), end = parse(endStr)
  if (start === null || end === null || start === end) return false
  if (start > end) return minutesNow >= start || minutesNow < end
  return minutesNow >= start && minutesNow < end
}

export function stockholmMinutesNow(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now)
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
  return (h % 24) * 60 + m
}
