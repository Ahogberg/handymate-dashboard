/**
 * Riktad mobilpush vid schemaändring — R4-D (tasks/resurs-masterplan.md).
 *
 * Två call-sites-familjer:
 * - PUT /api/bookings (R2:s tilldelningsväg) — booking.assigned_user_id
 *   ändras → notifyBookingAssignment.
 * - POST /api/schedule + PATCH /api/schedule/[id] — schedule_entry skapas
 *   eller omtilldelas för en annan person än den som gör ändringen →
 *   notifyScheduleAssignment.
 *
 * Samma mönster som lib/notifications/approval-push.ts: resolveTargetUserId
 * slår upp business_users.id → business_users.user_id (auth-uuid) så pushen
 * riktas mot RÄTT person, aldrig ett businessblast. Fire-and-forget —
 * call-sites anropar med `void notifyXxx(...)`, aldrig `await`, så en
 * push-fail eller en långsam Expo-request aldrig blockerar skrivvägen.
 * Interna fel loggas men kastas aldrig.
 *
 * Pushar ALDRIG när personen tilldelar sig själv — call-sites ansvarar för
 * att jämföra mot den handlande användarens id innan anrop (se kommentarer
 * vid varje call-site).
 */

import { getServerSupabase } from '@/lib/supabase'
import { resolveTargetUserId } from '@/lib/notifications/approval-push'
import { format } from 'date-fns'
import { sv } from 'date-fns/locale'

function dateLabel(iso: string): string {
  try {
    return format(new Date(iso), 'd MMM', { locale: sv })
  } catch {
    return ''
  }
}

function timeLabel(iso: string): string {
  try {
    return format(new Date(iso), 'HH:mm')
  } catch {
    return ''
  }
}

/**
 * Delad sändningskärna — slår upp auth-uuid och postar till det interna
 * /api/push/send (samma route som approval-push.ts använder). Sväljer alla
 * fel internt (loggar, kastar aldrig) så call-sites kan anropa fire-and-
 * forget med `void`.
 */
async function sendSchedulePush(
  businessId: string,
  businessUserId: string,
  title: string,
  body: string,
  url: string,
): Promise<void> {
  try {
    const targetUserId = await resolveTargetUserId(businessUserId)
    if (!targetUserId) {
      // Ingen kopplad auth-uuid (t.ex. medlem som aldrig loggat in) —
      // inget att skicka till, inte ett fel.
      return
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
    const res = await fetch(`${appUrl}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId,
        title,
        body,
        url,
        tag: 'schedule-assignment',
        target_user_id: targetUserId,
      }),
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.error('[schedule-push] /api/push/send failed:', {
        status: res.status,
        business_id: businessId,
        body: errBody.slice(0, 200),
      })
    }
  } catch (err) {
    console.error('[schedule-push] fetch error:', {
      business_id: businessId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Push till en tekniker som blivit tilldelad en BOKNING (kundjobb).
 * Anropas från PUT /api/bookings när assigned_user_id faktiskt ändras
 * (inte vid självtilldelning — call-site jämför mot handlande användare).
 */
export async function notifyBookingAssignment(params: {
  businessId: string
  businessUserId: string
  customerId?: string | null
  scheduledStart: string
}): Promise<void> {
  const { businessId, businessUserId, customerId, scheduledStart } = params

  let customerName: string | null = null
  if (customerId) {
    try {
      const supabase = getServerSupabase()
      const { data } = await supabase
        .from('customer')
        .select('name')
        .eq('customer_id', customerId)
        .maybeSingle()
      customerName = data?.name || null
    } catch {
      // Icke-blockerande — faller tillbaka till generisk text nedan.
    }
  }

  const label = customerName || 'en bokning'
  const body = `Du har tilldelats: ${label} ${dateLabel(scheduledStart)} ${timeLabel(scheduledStart)}`.trim()

  await sendSchedulePush(businessId, businessUserId, 'Ny bokning tilldelad', body, '/dashboard/calendar')
}

/**
 * Push till en anställd vars SCHEMA-POST (internt pass, resa, etc.) skapas
 * eller omtilldelas till dem. Anropas från POST /api/schedule och
 * PATCH /api/schedule/[id] — aldrig vid självtilldelning.
 */
export async function notifyScheduleAssignment(params: {
  businessId: string
  businessUserId: string
  title: string
  startDatetime: string
}): Promise<void> {
  const { businessId, businessUserId, title, startDatetime } = params
  const body = `Nytt pass: ${title} ${dateLabel(startDatetime)} ${timeLabel(startDatetime)}`.trim()

  await sendSchedulePush(businessId, businessUserId, 'Nytt pass', body, '/dashboard/schedule')
}
