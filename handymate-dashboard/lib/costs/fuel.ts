/**
 * Bränsle-mätaren — kundvänd, inte COGS (2026-08-14).
 *
 * ═══ KUNDVÄND, INTE ADMIN ═══
 *
 * Läser samma källa som COGS-mätaren (cost_event), men rapporterar procent
 * av en KUNDBUDGET, inte vår marginal. Den här filen får ALDRIG blandas med
 * app/api/admin/metrics — se ägarskapsgränsen i tests/cogs-matare.spec.ts,
 * "COGS ligger bakom adminspärren, inte på kundens sida". Nya klient-
 * komponenter som konsumerar den här filens utdata döper fälten
 * usedOre/budgetOre/remainingPercent/bucketPercent — ALDRIG costOre/
 * cost_ore/cogs — annars fäller de facit-testet i
 * tests/bransle-matare.spec.ts trots att räknelogiken bor här.
 *
 * ═══ RULLANDE 30-DAGARSFÖNSTER, INTE KALENDERMÅNAD ═══
 *
 * Andreas-beslut (2026-08-14): "baserat på senaste 30 dagarna" i
 * designtexten är bokstavligt — ett annat fönster än getTenantCogs/
 * getAllTenantCogs i report.ts (som är kalendermånad, för admin-rapporten).
 * Två olika tidsfönster på samma tabell är avsiktligt: kundens mätare ska
 * svara på "hur går det just nu", inte "hur gick förra kalendermånaden".
 *
 * ═══ PÅFYLLNING ÄR FÖNSTER-NATIV ═══
 *
 * En Stripe-köpt påfyllning (fuel_ledger) läggs till planens basbudget OM
 * köpet skedde inom samma rullande 30-dagarsfönster som förbrukningen mäts
 * över. En påfyllning från dag 31 tillbaka åldras alltså ur budgeten
 * samtidigt som förbrukningen den finansierade åldras ur täljaren — de
 * försvinner tillsammans, inte var för sig. Det är en medveten förenkling
 * för v1 (ingen ledger-saldo-bokföring): eftersom 0 %-läget är rent
 * informativt (Andreas-beslut — ingen koppling till agents_globally_paused/
 * agent_cost_cap_usd_daily i denna version) finns ingen ekonomisk skada av
 * att en gammal påfyllning slutar synas i mätaren — bara en visuell
 * avrundning.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { MEASUREMENT_STARTED_AT } from './report'

export const FUEL_WINDOW_DAYS = 30

/** 15 %-budget/mån, tasks/cost-cap-analysis.md §6. Öre, heltal. */
export const FUEL_PLAN_BUDGET_ORE: Record<string, number> = {
  starter: 37_400,
  professional: 90_000,
  business: 180_000,
}
/** 'enterprise' och okända planer: inget produktbeslut finns ännu — faller
 *  till Storfirman-nivån (mest generöst, minst risk att skrämma en stor
 *  kund med en missvisande låg mätare). */
const FUEL_DEFAULT_BUDGET_ORE = FUEL_PLAN_BUDGET_ORE.business

export function fuelBudgetOreForPlan(plan: string | null | undefined): number {
  if (plan && FUEL_PLAN_BUDGET_ORE[plan] != null) return FUEL_PLAN_BUDGET_ORE[plan]
  return FUEL_DEFAULT_BUDGET_ORE
}

export type FuelBucket = 'calls_sms' | 'quotes_analysis' | 'night_work'

export const FUEL_BUCKET_LABEL: Record<FuelBucket, string> = {
  calls_sms: 'Samtal & SMS',
  quotes_analysis: 'Offerter & analyser',
  night_work: 'Teamets nattarbete',
}

/**
 * Heuristik (inte en exakt kostnadsallokering — Bränslet är en känsla, inte
 * en revisionssiffra):
 *   calls_sms         — allt som är ljud/text riktat mot en kund eller
 *                        prospekt: samtal, SMS (generering och sändning),
 *                        möten, kundwidgeten, utskicksbrev.
 *   quotes_analysis    — offert-AI, bild-/dataanalys, chattassistans som
 *                        INTE är telefoni/SMS (Matte, Jobbkompisen-foto,
 *                        onboarding, leadsanalys, hemsidesförslag).
 *   night_work         — schemalagt/autonomt bakgrundsarbete: cronar,
 *                        minnesextraktion, rankning — inget en kund ser
 *                        hända i stunden.
 *
 * UNDANTAG att känna till: 'agent_run' bär BÅDA live-agentkörningar
 * (inkommande samtal/SMS via app/api/agent/trigger) OCH nattens
 * observation-cronar (karin/daniel/lars/hanna via cost-guard.ts) under
 * SAMMA ref_type — går inte att skilja utan att läsa meta/trigger_type,
 * vilket är en större ombyggnad än den här funktionen. Placerad under
 * night_work eftersom volymen domineras av cronar (958 körningar mot 6
 * incoming_sms-körningar, tasks/cost-cap-analysis.md §1.1) även om en
 * enskild live-körning kostar mer. Flaggat här så nästa person som läser
 * en missvisande bucket-fördelning vet varför.
 *
 * 'probe' (adminspärrade hälsosonden, app/api/admin/cost-probe) skrivs
 * aldrig med resource i RESOURCES nedan så den når aldrig hit i praktiken —
 * mappad ändå så facit-testets uttömmande skanning inte varnar i onödan.
 */
const REF_TYPE_BUCKET: Record<string, FuelBucket> = {
  // ── Samtal & SMS ──────────────────────────────────────────────────────
  call_recording: 'calls_sms',
  voice_process: 'calls_sms',
  sms_log: 'calls_sms',
  seasonal_campaign_sms: 'calls_sms',
  proactive_care_sms: 'calls_sms',
  quote_nudge_sms: 'calls_sms',
  autopilot_customer_sms: 'calls_sms',
  campaign_generate_text: 'calls_sms',
  neighbour_letter: 'calls_sms',
  outbound_letter: 'calls_sms',
  jobbuddy_voice: 'calls_sms',
  matte_transcribe: 'calls_sms',
  quote_transcribe_voice: 'calls_sms',
  meeting_segment: 'calls_sms',
  widget_conversation: 'calls_sms',

  // ── Offerter & analyser ───────────────────────────────────────────────
  quote_ai_generate: 'quotes_analysis',
  quote_ai_generate_legacy: 'quotes_analysis',
  quote_ai_image_analyze: 'quotes_analysis',
  storefront_generate: 'quotes_analysis',
  communication_ai_evaluation: 'quotes_analysis',
  pricing_job_classification: 'quotes_analysis',
  gmail_lead_is_likely: 'quotes_analysis',
  gmail_lead_parse: 'quotes_analysis',
  monthly_review_analysis: 'quotes_analysis',
  egenkontroll_foto: 'quotes_analysis',
  jobbuddy_photo: 'quotes_analysis',
  ai_copilot: 'quotes_analysis',
  matte_chat_turn: 'quotes_analysis',
  matte_intent_agent: 'quotes_analysis',
  onboarding_chat: 'quotes_analysis',
  onboarding_scrape_website: 'quotes_analysis',

  // ── Teamets nattarbete ────────────────────────────────────────────────
  agent_run: 'night_work',
  agent_context_nightly: 'night_work',
  business_preferences_nightly: 'night_work',
  next_best_action_ranking: 'night_work',
  agent_memory: 'night_work',
  thread_summary: 'night_work',
  generate_insights_cron: 'night_work',

  // ── Diagnostik (når aldrig hit i praktiken, se docstring) ──────────────
  probe: 'night_work',
}

/** Aldrig en tyst odefinierad bucket: kända värden mappas explicit ovan,
 *  ett NYTT/okänt värde loggas och faller till night_work (det minst
 *  alarmerande felet — bättre att underdriva "Samtal & SMS" än att tyst
 *  tappa öre ur totalen). tests/bransle-matare.spec.ts kontrollerar att
 *  listan ovan täcker ALLA ref_type som faktiskt förekommer i koden, så
 *  den här fallbacken ska aldrig triggas i praktiken. */
export function bucketForRefType(refType: string | null | undefined): FuelBucket {
  if (!refType) return 'night_work'
  const bucket = REF_TYPE_BUCKET[refType]
  if (!bucket) {
    console.warn(`[fuel] okänd ref_type utan bucket-mappning: ${refType}`)
    return 'night_work'
  }
  return bucket
}

const RESOURCES = ['sms', 'call_out', 'whisper', 'llm']

export interface FuelCostRow {
  resource: string
  cost_ore: number
  ref_type: string | null
  created_at: string
}

export interface FuelLevel {
  usedOre: number
  budgetOre: number
  /** 0..1+, kan överstiga 1 vid överförbrukning. */
  usedRatio: number
  /** 0..100, ALLTID klampad — det som ritas i mätaren. */
  remainingPercent: number
  /** null = ingen förbrukning ännu (oändligt räcker). */
  weeksRemaining: number | null
  buckets: Array<{ key: FuelBucket; label: string; percent: number }>
  /** 30 tal, äldst→nyast, daglig kostnad i öre. */
  history: number[]
  /** Index i history att highlighta, eller null om ingen tydlig topp. */
  highlightIndex: number | null
  state: 'normal' | 'low' | 'critical'
}

export function computeFuelLevel(params: {
  rows: FuelCostRow[]
  planBudgetOre: number
  topupOreInWindow: number
  windowStart: Date
  windowEnd: Date
}): FuelLevel {
  const { rows, planBudgetOre, topupOreInWindow, windowStart, windowEnd } = params
  const budgetOre = planBudgetOre + topupOreInWindow

  const relevanta = rows.filter(r => RESOURCES.includes(r.resource))
  const usedOre = relevanta.reduce((s, r) => s + (r.cost_ore || 0), 0)
  const usedRatio = budgetOre > 0 ? usedOre / budgetOre : 0
  const remainingPercent = Math.max(0, Math.min(100, Math.round((1 - usedRatio) * 100)))

  // Buckets — relativ andel av FÖRBRUKNINGEN, inte av budgeten.
  const bucketOre: Record<FuelBucket, number> = { calls_sms: 0, quotes_analysis: 0, night_work: 0 }
  for (const r of relevanta) bucketOre[bucketForRefType(r.ref_type)] += r.cost_ore || 0
  const buckets = (Object.keys(bucketOre) as FuelBucket[]).map(key => ({
    key,
    label: FUEL_BUCKET_LABEL[key],
    percent: usedOre > 0 ? Math.round((bucketOre[key] / usedOre) * 100) : 0,
  }))

  // Dagliga staplar, äldst→nyast. Fönstret är inte längre alltid exakt 30
  // dagar (kan vara ankrat till en förnyelsedag, ~28-31 dagar beroende på
  // månad) — dayCount räknas ur det FAKTISKA fönstret så ingen dag tyst
  // faller utanför arrayen. Klampat till [1, 31]: en Stripe-månadsperiod
  // blir aldrig längre, och ett nyss startat konto (fönster < 1 dag) ska
  // ändå få minst en stapel.
  const windowDays = Math.max(1, Math.min(31, Math.round((windowEnd.getTime() - windowStart.getTime()) / 86_400_000)))
  const dayCount = windowDays
  const history = new Array(dayCount).fill(0)
  for (const r of relevanta) {
    const idx = Math.floor((new Date(r.created_at).getTime() - windowStart.getTime()) / 86_400_000)
    if (idx >= 0 && idx < dayCount) history[idx] += r.cost_ore || 0
  }

  // Highlight: dagens topp om den är minst 2x snittet av resten.
  let highlightIndex: number | null = null
  const maxVal = Math.max(...history)
  if (maxVal > 0) {
    const maxIdx = history.indexOf(maxVal)
    const rest = history.filter((_, i) => i !== maxIdx)
    const restAvg = rest.length ? rest.reduce((s, v) => s + v, 0) / rest.length : 0
    if (maxVal >= restAvg * 2) highlightIndex = maxIdx
  }

  // Veckor kvar: snittförbrukning/dag i fönstret, projicerat mot resterande budget.
  const avgDailyOre = usedOre / windowDays
  const remainingOre = Math.max(0, budgetOre - usedOre)
  const weeksRemaining = avgDailyOre > 0 ? Math.round(remainingOre / avgDailyOre / 7) : null

  const state: FuelLevel['state'] =
    remainingPercent <= 10 ? 'critical' : remainingPercent <= 30 ? 'low' : 'normal'

  return { usedOre, budgetOre, usedRatio, remainingPercent, weeksRemaining, buckets, history, highlightIndex, state }
}

/**
 * Fönstrets startpunkt: ANKRAT till senaste förnyelsedatumet
 * (business_config.billing_period_start, skrivet av Stripe-webhooken vid
 * varje customer.subscription.updated/checkout.session.completed) om det
 * finns och inte ligger i framtiden — Andreas-beslut 2026-08-14: "rullande
 * 30" ska betyda "från köp-/förnyelsedatumet varje månad", inte ett
 * fritt glidande 30-dagarsfönster från just nu. En Stripe-månadsperiod är
 * i praktiken alltid ~30 dagar, så mätaren nollställs när kunden faktiskt
 * betalar — samma mentala modell som att tanka en bil, inte ett fönster
 * som aldrig riktigt återställs.
 *
 * Fallback till ett rent glidande 30-dagarsfönster när ingen
 * billing_period_start finns (t.ex. trial utan aktiv Stripe-prenumeration
 * ännu) — mätaren ska fungera innan första betalningen också.
 *
 * Golvet mot MEASUREMENT_STARTED_AT gör att ett fönster som sträcker sig
 * längre bak än mätstarten bara ger fler tomma dagar — ofarligt här (till
 * skillnad från COGS-admin-rapporten) eftersom "0 kr förbrukat" är sant
 * både vid mätfrånvaro och vid genuint nollanvändning, och Bränslet aldrig
 * används för marginalbeslut.
 */
export function resolveFuelWindowStart(now: Date, billingPeriodStart: string | null | undefined): Date {
  const measurementStart = new Date(MEASUREMENT_STARTED_AT)
  const anchored = billingPeriodStart ? new Date(billingPeriodStart) : null
  const anchoredValid = anchored && !isNaN(anchored.getTime()) && anchored <= now

  const windowStart = anchoredValid
    ? anchored!
    : new Date(now.getTime() - FUEL_WINDOW_DAYS * 86_400_000)

  return windowStart < measurementStart ? measurementStart : windowStart
}

export async function getFuelLevel(
  supabase: SupabaseClient,
  businessId: string,
  plan: string | null,
  billingPeriodStart?: string | null,
): Promise<FuelLevel> {
  const now = new Date()
  const windowStart = resolveFuelWindowStart(now, billingPeriodStart)

  const [{ data: events, error: eventsError }, { data: topups, error: topupError }] = await Promise.all([
    supabase
      .from('cost_event')
      .select('resource, cost_ore, ref_type, created_at')
      .eq('business_id', businessId)
      .gte('created_at', windowStart.toISOString())
      .lte('created_at', now.toISOString()),
    supabase
      .from('fuel_ledger')
      .select('amount_ore, created_at')
      .eq('business_id', businessId)
      .gte('created_at', windowStart.toISOString())
      .lte('created_at', now.toISOString()),
  ])

  if (eventsError) throw new Error(`Bränsledata kunde inte läsas: ${eventsError.message}`)
  if (topupError) throw new Error(`Påfyllningshistorik kunde inte läsas: ${topupError.message}`)

  const topupOreInWindow = (topups || []).reduce((s, t) => s + (t.amount_ore || 0), 0)

  return computeFuelLevel({
    rows: (events || []) as FuelCostRow[],
    planBudgetOre: fuelBudgetOreForPlan(plan),
    topupOreInWindow,
    windowStart,
    windowEnd: now,
  })
}
