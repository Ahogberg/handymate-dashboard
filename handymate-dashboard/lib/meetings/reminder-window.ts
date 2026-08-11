/**
 * Väljer ut vilka bokningar som ska få en förmötespåminnelse-push för
 * Mötesassistenten (sql/v119_meeting_v2.sql: booking.meeting_reminder_pushed_at).
 *
 * Ren funktion, inget Supabase-beroende — cronen hämtar kandidaterna med en
 * bred DB-fråga och låter den här filtreringen (som är lätt att testa
 * deterministiskt) avgöra exakt vilka som ska påminnas just nu.
 *
 * Fönstret är [nu+10 min, nu+20 min) — en bokning ska bara plockas upp EN
 * gång oavsett hur ofta cronen kör (var 5:e/10:e minut), så fönstret måste
 * vara bredare än cron-intervallet men ändå smalt nog för att påminnelsen
 * ska kännas relevant ("om strax").
 */

export interface ReminderCandidate {
  booking_id: string
  business_id: string
  scheduled_start: string
  customer_id: string | null
  status: string | null
  meeting_reminder_pushed_at: string | null
}

export const PAMINNELSE_FONSTER_MIN = { fran: 10, till: 20 }

export function bokningarAttPaminna<T extends ReminderCandidate>(bookings: T[], now: Date): T[] {
  const franMs = now.getTime() + PAMINNELSE_FONSTER_MIN.fran * 60_000
  const tillMs = now.getTime() + PAMINNELSE_FONSTER_MIN.till * 60_000

  return bookings
    .filter((b) => {
      if (!b.customer_id) return false
      if (b.meeting_reminder_pushed_at) return false
      if (b.status === 'cancelled') return false

      const startMs = new Date(b.scheduled_start).getTime()
      if (Number.isNaN(startMs)) return false

      return startMs >= franMs && startMs < tillMs
    })
    .sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime())
}
