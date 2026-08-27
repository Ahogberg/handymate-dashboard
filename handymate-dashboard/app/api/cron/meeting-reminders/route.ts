/**
 * Cron: GET /api/cron/meeting-reminders
 *
 * Förmötespåminnelse för Mötesassistenten (sql/v119_meeting_v2.sql) — 15 min
 * innan en kundkopplad bokning börjar får den tilldelade hantverkaren en push:
 * "Möte om 15 min: {kundnamn}".
 *
 * Fönsterlogiken ([nu+10, nu+20) minuter) ligger i lib/meetings/reminder-window.ts
 * som en ren, testad funktion — DB-frågan här hämtar bara ett BREDARE fönster
 * (+5 till +25 min) rakt över alla tenants i EN fråga (inget per-business-loop,
 * samma mönster som gmail-poll). Anledningen till att SQL-fönstret är bredare
 * än det exakta fönstret: cronen kör var 5:e minut och vi vill aldrig missa en
 * bokning som t.ex. ligger precis på gränsen på grund av klockskillnader eller
 * en cron-körning som drar ut på tiden — den rena funktionen gör det exakta
 * urvalet deterministiskt och testbart, SQL-frågan är bara en grov förfiltrering.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { resolveTargetUserId } from '@/lib/notifications/approval-push'
import { bokningarAttPaminna, type ReminderCandidate } from '@/lib/meetings/reminder-window'
import { arTestNamn } from '@/lib/testdata'
import { internalPushHeaders } from '@/lib/notifications/push-internal'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface BookingRow extends ReminderCandidate {
  assigned_user_id: string | null
  customer: { name: string | null } | { name: string | null }[] | null
}

/** Supabase kan returnera relationen som objekt eller array beroende på FK-uppsättning. */
function customerName(customer: BookingRow['customer']): string | null {
  if (!customer) return null
  const row = Array.isArray(customer) ? customer[0] : customer
  return row?.name ?? null
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const now = new Date()
  const franSql = new Date(now.getTime() + 5 * 60_000).toISOString()
  const tillSql = new Date(now.getTime() + 25 * 60_000).toISOString()

  try {
    const { data: rows, error } = await supabase
      .from('booking')
      .select(
        'booking_id, business_id, scheduled_start, customer_id, status, meeting_reminder_pushed_at, assigned_user_id, customer:customer_id(name)'
      )
      .gte('scheduled_start', franSql)
      .lt('scheduled_start', tillSql)
      .is('meeting_reminder_pushed_at', null)
      .not('customer_id', 'is', null)
      .neq('status', 'cancelled')
      .limit(200)

    if (error) {
      console.error('[meeting-reminders] query failed:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const bookings = (rows || []) as unknown as BookingRow[]
    const kandidater = bokningarAttPaminna(bookings, now)

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
    let pushed = 0
    let errors = 0

    for (const booking of kandidater) {
      try {
        const rawName = customerName((booking as BookingRow).customer)
        // Testdata (E2E/Testkund) ska aldrig trigga en riktig push till en
        // hantverkares telefon.
        if (arTestNamn(rawName)) continue

        const name = rawName || 'kund'
        const time = new Date(booking.scheduled_start).toLocaleTimeString('sv-SE', {
          hour: '2-digit',
          minute: '2-digit',
        })

        const targetUserId = await resolveTargetUserId(
          (booking as BookingRow).assigned_user_id
        )

        const res = await fetch(`${appUrl}/api/push/send`, {
          method: 'POST',
          headers: internalPushHeaders(),
          body: JSON.stringify({
            business_id: booking.business_id,
            title: 'Möte om 15 min',
            body: `${name} kl ${time} — öppna mötesassistenten`,
            url: '/dashboard/inkorg',
            tag: 'meeting-reminder',
            ...(targetUserId ? { target_user_id: targetUserId } : {}),
          }),
        })

        if (res.ok) {
          pushed++
        } else {
          const errBody = await res.text().catch(() => '')
          console.error('[meeting-reminders] /api/push/send failed:', {
            status: res.status,
            booking_id: booking.booking_id,
            body: errBody.slice(0, 200),
          })
          errors++
        }
      } catch (err) {
        console.error('[meeting-reminders] push attempt threw:', {
          booking_id: booking.booking_id,
          error: err instanceof Error ? err.message : String(err),
        })
        errors++
      }

      // Markera ALLTID som skickat efter försöket — även om pushen failade.
      // En engångsbokning ska bara plockas upp EN gång; om vi lämnar
      // pushed_at NULL vid fel skulle samma bokning försöka pushas igen
      // varje 5:e minut ända fram till mötestid (hellre en missad
      // påminnelse än en spam-storm av dubbelpushar).
      const { error: updateError } = await supabase
        .from('booking')
        .update({ meeting_reminder_pushed_at: new Date().toISOString() })
        .eq('booking_id', booking.booking_id)

      if (updateError) {
        console.error('[meeting-reminders] failed to mark pushed_at:', {
          booking_id: booking.booking_id,
          error: updateError.message,
        })
      }
    }

    return NextResponse.json({ checked: bookings.length, pushed, errors })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[meeting-reminders] Fatal error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
