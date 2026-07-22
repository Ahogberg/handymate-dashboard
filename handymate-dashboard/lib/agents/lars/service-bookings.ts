/**
 * Lars — serviceavtalens seriedrift (Motor 2, Etapp 1, del 6).
 *
 * Daglig cron (app/api/cron/service-bookings/route.ts): active avtal med
 * next_visit_at inom 21 dagar och ingen obokad framtida seriebokning →
 * skapa en booking (kind='service', agreement_id) i en LÄMPLIG vecka.
 * Autonomt OK — detta är internt schemaläggande, inget externt utskick
 * (kundavisering sker via det befintliga booking-reminders-flödet).
 *
 * Kapacitetsmedveten placering: getWeekCapacity för målveckan ±1 vecka,
 * pickBestWeek väljer den tunnaste. Sedan computeAvailableSlots inom
 * arbetstid för första lediga dag/tid i den valda veckan. Misslyckas
 * allt: boka måldatumet kl 08 ändå (aldrig fastna) + flagga i notes.
 *
 * FAIL-SAFE mot v74 ej körd (se isMissingRelationError) — varje DB-fel som
 * ser ut som en saknad relation gör att businessen skippas tyst istället
 * för att kasta.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { svDateStr, svDateStrPlusDays } from '@/lib/dates'
import { getWeekCapacity, mondayOfWeek } from '@/lib/capacity/week-capacity'
import { computeAvailableSlots, stockholmLocalToISO, type WorkingHours } from '@/lib/bookings/availability'
import { addIntervalMonths, pickBestWeek, type WeekCapacityCandidate } from '@/lib/agreements/schedule'

const LOOKAHEAD_DAYS = 21
const EXCLUDED_BOOKING_STATUSES = ['cancelled', 'no_show']

export interface ServiceBookingsResult {
  agreements_checked: number
  bookings_created: number
  fallback_used: number
  skipped_already_booked: number
  errors: number
}

function emptyResult(): ServiceBookingsResult {
  return { agreements_checked: 0, bookings_created: 0, fallback_used: 0, skipped_already_booked: 0, errors: 0 }
}

function isMissingRelationError(error: any): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  const message = String(error?.message || '')
  return /does not exist|schema cache/i.test(message) && /relation|table|column/i.test(message)
}

/** Ankartidpunkt (UTC-middag) för kalenderdag-aritmetik — samma teknik som lib/capacity/week-capacity.ts. */
function anchor(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00Z`)
}

export async function runServiceBookings(supabase: SupabaseClient, businessId: string): Promise<ServiceBookingsResult> {
  const result = emptyResult()
  const now = new Date()
  const horizonISO = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 3600_000).toISOString()

  const { data: agreements, error: agrErr } = await supabase
    .from('service_agreement')
    .select('agreement_id, customer_id, title, interval_months, visit_duration_min, next_visit_at')
    .eq('business_id', businessId)
    .eq('status', 'active')
    .not('next_visit_at', 'is', null)
    .lte('next_visit_at', horizonISO)

  if (agrErr) {
    if (isMissingRelationError(agrErr)) return result
    console.error('[service-bookings] agreement fetch error:', businessId, agrErr.message)
    result.errors++
    return result
  }

  if (!agreements || agreements.length === 0) return result

  const { data: config } = await supabase
    .from('business_config')
    .select('working_hours')
    .eq('business_id', businessId)
    .maybeSingle()
  const workingHours = (config?.working_hours || null) as WorkingHours | null

  for (const agreement of agreements) {
    result.agreements_checked++
    try {
      // Redan en obokad, framtida seriebokning för avtalet? Hoppa — Lars
      // ska aldrig dubbelboka samma avtal.
      const { data: existingBookings, error: existingErr } = await supabase
        .from('booking')
        .select('booking_id')
        .eq('business_id', businessId)
        .eq('agreement_id', agreement.agreement_id)
        .gt('scheduled_start', now.toISOString())
        .not('status', 'in', '(cancelled,no_show)')
        .limit(1)

      if (existingErr) {
        if (isMissingRelationError(existingErr)) return result
        throw existingErr
      }
      if (existingBookings && existingBookings.length > 0) {
        result.skipped_already_booked++
        continue
      }

      const targetDateStr = svDateStr(new Date(agreement.next_visit_at as string))
      const targetWeekStart = mondayOfWeek(targetDateStr)
      const prevWeekStart = svDateStrPlusDays(-7, anchor(targetWeekStart))
      const nextWeekStart = svDateStrPlusDays(7, anchor(targetWeekStart))
      const candidateWeeks = [prevWeekStart, targetWeekStart, nextWeekStart]

      const capacities = await Promise.all(candidateWeeks.map(w => getWeekCapacity(supabase, businessId, w)))
      const candidates: WeekCapacityCandidate[] = capacities.map(c => ({ week_start: c.week_start, open_hours: c.open_hours }))
      const chosenWeekStart = pickBestWeek(candidates, targetWeekStart)

      let slot: { startISO: string; endISO: string } | null = null

      if (workingHours) {
        const weekEndExclusive = svDateStrPlusDays(7, anchor(chosenWeekStart))
        const { data: weekBookings } = await supabase
          .from('booking')
          .select('scheduled_start, scheduled_end, status')
          .eq('business_id', businessId)
          .gte('scheduled_start', chosenWeekStart)
          .lt('scheduled_start', weekEndExclusive)

        const activeBookings = (weekBookings || []).filter(
          (b: any) => !EXCLUDED_BOOKING_STATUSES.includes(b.status)
        )
        const todayStr = svDateStr(now)

        for (let dayOffset = 0; dayOffset < 7 && !slot; dayOffset++) {
          const dayStr = svDateStrPlusDays(dayOffset, anchor(chosenWeekStart))
          if (dayStr < todayStr) continue // aldrig i det förflutna

          const slots = computeAvailableSlots({
            hours: workingHours,
            dateStr: dayStr,
            durationMin: agreement.visit_duration_min || 60,
            bookings: activeBookings,
            now: now.getTime(),
          })
          if (slots.length > 0) {
            slot = { startISO: slots[0].startISO, endISO: slots[0].endISO }
          }
        }
      }

      let usedFallback = false
      if (!slot) {
        usedFallback = true
        const startISO = stockholmLocalToISO(targetDateStr, '08:00')
        const endISO = new Date(Date.parse(startISO) + (agreement.visit_duration_min || 60) * 60_000).toISOString()
        slot = { startISO, endISO }
      }

      const bookingId = 'book_' + Math.random().toString(36).substr(2, 9)
      const notes = usedFallback
        ? `${agreement.title} (serviceavtal — ingen ledig tid hittades, bokad kl 08 som fallback)`
        : `${agreement.title} (serviceavtal)`

      const { error: insertErr } = await supabase.from('booking').insert({
        booking_id: bookingId,
        business_id: businessId,
        customer_id: agreement.customer_id,
        agreement_id: agreement.agreement_id,
        kind: 'service',
        scheduled_start: slot.startISO,
        scheduled_end: slot.endISO,
        status: 'confirmed',
        notes,
        created_at: new Date().toISOString(),
      })

      if (insertErr) {
        if (isMissingRelationError(insertErr)) return result
        throw insertErr
      }

      if (usedFallback) result.fallback_used++
      result.bookings_created++

      // Nästa besök räknas fram från det FÖREGÅENDE next_visit_at (inte det
      // faktiskt bokade slottet) så intervallet aldrig glider vid ombokningar
      // eller kapacitetsplaceringar in i grannveckan.
      const newNextVisitDateStr = addIntervalMonths(targetDateStr, agreement.interval_months)
      const newNextVisitAt = stockholmLocalToISO(newNextVisitDateStr, '08:00')

      const { error: updateErr } = await supabase
        .from('service_agreement')
        .update({ next_visit_at: newNextVisitAt, updated_at: new Date().toISOString() })
        .eq('agreement_id', agreement.agreement_id)
        .eq('business_id', businessId)

      if (updateErr && !isMissingRelationError(updateErr)) {
        console.error('[service-bookings] next_visit_at update failed:', businessId, agreement.agreement_id, updateErr.message)
      }
    } catch (err: any) {
      console.error('[service-bookings] agreement error:', businessId, agreement.agreement_id, err?.message || String(err))
      result.errors++
    }
  }

  return result
}
