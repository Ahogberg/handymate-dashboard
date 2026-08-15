/**
 * Next Best Action Engine — Company Goals-kontext (2026-08-15).
 *
 * Business Twin-backlog #11:s kvarvarande steg (docs/strategy/
 * BUSINESS_TWIN_IDEA_BACKLOG.md): `business_config.revenue_target_annual_sek`
 * (v128) visas idag bara i Månadsrapporten (MalBlock.tsx) och läses av
 * INGEN agent-logik. Den här filen ger Next Best Action-modellen samma
 * omsättningsmål som en BAKGRUNDSFAKTA — aldrig en egen prioriteringsregel
 * och aldrig en del av de två spärrarna i next-best-action.ts (MIN_CANDIDATES/
 * MIN_PRINCIPLES). Ett företag utan skrivna priority_rule-rader får
 * fortfarande INGEN rankning, oavsett om ett omsättningsmål är satt.
 *
 * Samma "en summa är inte en åsikt"-disciplin som resten av NBA-familjen:
 * procenttalet räknas här i egen kod, aldrig av modellen.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { svDateStr } from '@/lib/dates'

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function dayOfYear(todayIso: string): { year: number; day: number; daysInYear: number } {
  const [y, m, d] = todayIso.split('-').map(Number)
  const startOfYearMs = Date.UTC(y, 0, 1)
  const todayMs = Date.UTC(y, m - 1, d)
  const day = Math.floor((todayMs - startOfYearMs) / 86_400_000) + 1
  return { year: y, day, daysInYear: isLeapYear(y) ? 366 : 365 }
}

/**
 * Ren. Ingen I/O. `null` om inget mål är satt eller om målet inte är ett
 * positivt tal — ett osatt/ogiltigt mål ska ALDRIG visas som "mål: 0 kr"
 * (samma ärlighetsprincip som MalBlock.tsx redan följer).
 */
export function buildGoalContextLine(input: {
  revenueTargetAnnualSek: number | null
  invoicedYtdSek: number
  todayIso: string
}): string | null {
  const { revenueTargetAnnualSek, invoicedYtdSek, todayIso } = input
  if (revenueTargetAnnualSek == null || !(revenueTargetAnnualSek > 0)) return null

  const { year, day, daysInYear } = dayOfYear(todayIso)
  const paceTargetSek = revenueTargetAnnualSek * (day / daysInYear)
  const pacePct = paceTargetSek > 0 ? Math.round((invoicedYtdSek / paceTargetSek) * 100) : 0

  const målKr = Math.round(revenueTargetAnnualSek).toLocaleString('sv-SE')
  const hittillsKr = Math.round(invoicedYtdSek).toLocaleString('sv-SE')

  return `Årsmål ${year}: ${målKr} kr. Fakturerat hittills i år: ${hittillsKr} kr (${pacePct}% av förväntad takt vid dag ${day}/${daysInYear}).`
}

/**
 * IO: hämtar ägarens omsättningsmål + årets fakturerade summa (alla
 * statusar, samma semantik som lib/matte/monthly-review.ts:s
 * `invoiced_total` — fakturerat, inte nödvändigtvis betalt) och bygger
 * kontextraden. Fail-soft genomgående: varje fel (saknad rad, trasig
 * query) ger `null`, ALDRIG ett kastat fel — NBA-generering ska aldrig
 * stoppas av att målkontexten inte gick att hämta.
 */
export async function getGoalContext(
  supabase: SupabaseClient,
  businessId: string,
  now: Date,
): Promise<string | null> {
  const todayIso = svDateStr(now)
  const year = todayIso.slice(0, 4)

  const { data: config, error: configErr } = await supabase
    .from('business_config')
    .select('revenue_target_annual_sek')
    .eq('business_id', businessId)
    .single()
  if (configErr || !config?.revenue_target_annual_sek) return null

  const { data: invoices, error: invErr } = await supabase
    .from('invoice')
    .select('total')
    .eq('business_id', businessId)
    .gte('created_at', `${year}-01-01T00:00:00.000Z`)
  if (invErr) {
    console.error('[next-best-action-goals] YTD-fakturasumma misslyckades:', invErr.message)
    return null
  }

  const invoicedYtdSek = (invoices || []).reduce((s, i) => s + (Number(i.total) || 0), 0)

  return buildGoalContextLine({
    revenueTargetAnnualSek: Number(config.revenue_target_annual_sek),
    invoicedYtdSek,
    todayIso,
  })
}
