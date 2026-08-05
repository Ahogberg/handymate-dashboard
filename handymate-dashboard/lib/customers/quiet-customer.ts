/**
 * "Tyst kund"-primitiven (gap 6, tasks/vilande-pengar-masterplan.md VP3) —
 * EN definition av "kund som varit tyst", parametriserad tröskel.
 *
 * Systemet hade tre-fyra olika inline-beräkningar av samma sak:
 *   - hanna-outbound: 6 "månader" (6×30 dgr) mot customer.last_job_date
 *   - capacity-fill: 90 dgr mot customer.last_job_date (+ lifetime_value)
 *   - proactive-care: per-jobbtyp (12–60 mån) mot project.completed_at
 * Trösklarna är MEDVETET olika (dokumenterat beslut — de behålls) men
 * beräkningen förenas här: en "månad" är 30 dagar, gränsen är inklusiv
 * (exakt på tröskeldagen räknas som tyst — samma semantik som queryns
 * lte mot cutoff), och dagräkningen golvas med Math.floor.
 *
 * OBS källnyansen (kartlagd 2026-08-05): customer.last_job_date sätts av
 * LTV-motorn från senaste BETALDA fakturan (lib/customer-ltv.ts) — en kund
 * med avslutat men ofakturerat jobb har last_job_date NULL och är osynlig
 * för fetchQuietCustomers (precis som för dagens inline-queries — bevarat).
 * proactive-care mäter istället per PROJEKT via project.completed_at —
 * medvetet annan källa (livscykeln är projektbaserad), men samma
 * månads-/dagberäkning via funktionerna här.
 *
 * Rena funktioner facit-testas i tests/quiet-customer.spec.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const DAY_MS = 24 * 60 * 60 * 1000

/** En "månad" i alla tyst-kund-beräkningar = 30 dagar. */
export const QUIET_MONTH_DAYS = 30

/** hanna-outbounds tröskel: 6 mån = 180 dagar (bevarat 6 × 30). */
export const HANNA_OUTBOUND_QUIET_DAYS = 6 * QUIET_MONTH_DAYS

/** capacity-fills tröskel: 90 dagar (bevarad). */
export const CAPACITY_FILL_QUIET_DAYS = 90

/** Cutoff-tidsstämpel för en kandidatquery: last_job_date <= denna → tyst. */
export function quietCutoffIso(nowMs: number, thresholdDays: number): string {
  return new Date(nowMs - thresholdDays * DAY_MS).toISOString()
}

/**
 * Är kunden tyst? Inklusiv gräns — exakt tröskeldagen räknas som tyst
 * (samma semantik som lte-cutoffen i queryn). null/ogiltigt datum → false:
 * en kund utan bekräftat tidigare jobb kan inte vara en "tyst tidigare
 * kund" (samma som queryns .not('last_job_date','is',null)).
 */
export function isQuietCustomer(
  lastJobDateIso: string | null | undefined,
  nowMs: number,
  thresholdDays: number,
): boolean {
  if (!lastJobDateIso) return false
  const lastMs = new Date(lastJobDateIso).getTime()
  if (Number.isNaN(lastMs)) return false
  return lastMs <= nowMs - thresholdDays * DAY_MS
}

/** Hela dagar sedan senaste jobb (Math.floor). null vid saknat/ogiltigt datum. */
export function daysSinceLastJob(
  lastJobDateIso: string | null | undefined,
  nowMs: number,
): number | null {
  if (!lastJobDateIso) return null
  const lastMs = new Date(lastJobDateIso).getTime()
  if (Number.isNaN(lastMs)) return null
  return Math.floor((nowMs - lastMs) / DAY_MS)
}

/** Hela 30-dagarsmånader sedan senaste jobb. null vid saknat/ogiltigt datum. */
export function monthsSinceLastJob(
  lastJobDateIso: string | null | undefined,
  nowMs: number,
): number | null {
  const days = daysSinceLastJob(lastJobDateIso, nowMs)
  if (days === null) return null
  return Math.floor(days / QUIET_MONTH_DAYS)
}

export interface QuietCustomerRow {
  customer_id: string
  name: string | null
  phone_number: string | null
  last_job_date: string | null
  /** Med bara när includeLifetimeValue satts. */
  lifetime_value?: number | null
}

/**
 * Gemensam kandidatquery: bekräftade tidigare kunder (last_job_date satt),
 * tysta minst thresholdDays, med telefonnummer — mest inaktiva först.
 * Exakt de villkor hanna-outbound och capacity-fill hade inline.
 * Fail-soft: DB-fel loggas och ger tom lista — kandidatjakten får aldrig
 * fälla en cron.
 */
export async function fetchQuietCustomers(
  supabase: SupabaseClient,
  businessId: string,
  opts: {
    thresholdDays: number
    limit: number
    includeLifetimeValue?: boolean
    now?: Date
  },
): Promise<QuietCustomerRow[]> {
  const nowMs = (opts.now ?? new Date()).getTime()
  const select =
    'customer_id, name, phone_number, last_job_date' +
    (opts.includeLifetimeValue ? ', lifetime_value' : '')
  try {
    const { data, error } = await supabase
      .from('customer')
      .select(select)
      .eq('business_id', businessId)
      .not('last_job_date', 'is', null)
      .lte('last_job_date', quietCutoffIso(nowMs, opts.thresholdDays))
      .not('phone_number', 'is', null)
      .order('last_job_date', { ascending: true })
      .limit(opts.limit)
    if (error) {
      console.warn('[quiet-customer] kandidatquery misslyckades (tom lista):', error.message)
      return []
    }
    return (data || []) as unknown as QuietCustomerRow[]
  } catch (err: any) {
    console.warn('[quiet-customer] kandidatquery kastade (tom lista):', err?.message || err)
    return []
  }
}
