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
import { computeRevenuePace } from '@/lib/economy/revenue-pace'
import { firstFocusContextLine } from '@/lib/onboarding/first-focus'

/**
 * Ren. Ingen I/O. `null` om inget mål är satt eller om målet inte är ett
 * positivt tal — ett osatt/ogiltigt mål ska ALDRIG visas som "mål: 0 kr"
 * (samma ärlighetsprincip som MalBlock.tsx redan följer). Talen kommer
 * från den delade lib/economy/revenue-pace.ts — samma takt-siffra som en
 * människa ser i MalBlock.tsx, bara formaterad till en LLM-mening här.
 */
export function buildGoalContextLine(input: {
  revenueTargetAnnualSek: number | null
  invoicedYtdSek: number
  todayIso: string
}): string | null {
  const { revenueTargetAnnualSek, invoicedYtdSek, todayIso } = input
  const pace = computeRevenuePace({ revenueTargetAnnualSek, invoicedYtdSek, todayIso })
  if (!pace) return null

  const målKr = Math.round(revenueTargetAnnualSek as number).toLocaleString('sv-SE')
  const hittillsKr = Math.round(invoicedYtdSek).toLocaleString('sv-SE')

  return `Årsmål ${pace.year}: ${målKr} kr. Fakturerat hittills i år: ${hittillsKr} kr (${pace.pacePct}% av förväntad takt vid dag ${pace.day}/${pace.daysInYear}).`
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
    .select('revenue_target_annual_sek, onboarding_data')
    .eq('business_id', businessId)
    .single()
  if (configErr || !config) return null
  // Ägarens uttalade fokus från onboardingen (Lager 3 / B6, 2026-08-27) —
  // bakgrundsfakta på samma villkor som årsmålet: aldrig en regel, aldrig
  // en spärr. onboarding_data sparas med formulärets fältnamn (firstFocus).
  const od = (config.onboarding_data as Record<string, unknown> | null) || null
  const fokusRad = firstFocusContextLine(od?.firstFocus ?? od?.first_focus)
  if (!config.revenue_target_annual_sek) return fokusRad

  const { data: invoices, error: invErr } = await supabase
    .from('invoice')
    .select('total')
    .eq('business_id', businessId)
    .gte('created_at', `${year}-01-01T00:00:00.000Z`)
  if (invErr) {
    console.error('[next-best-action-goals] YTD-fakturasumma misslyckades:', invErr.message)
    return fokusRad
  }

  const invoicedYtdSek = (invoices || []).reduce((s, i) => s + (Number(i.total) || 0), 0)

  const malRad = buildGoalContextLine({
    revenueTargetAnnualSek: Number(config.revenue_target_annual_sek),
    invoicedYtdSek,
    todayIso,
  })
  return [malRad, fokusRad].filter((r): r is string => !!r).join(' ') || null
}
