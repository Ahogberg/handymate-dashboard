/**
 * Hanna — "Väck kundbasen" (Motor 2, Etapp 2.5). Manuellt triggat
 * engångssvep över HELA den historiska kundbasen (app/api/agreements/sweep/route.ts),
 * till skillnad från den dagliga cronen (lib/agents/hanna/avtal-forslag.ts)
 * som bara tittar på completed-projekt senaste 7 dagarna. Etablerade firmor
 * med hundratals gamla kunder får en batch avtalsförslag i kön direkt —
 * "Sovande pengar"-pitchen.
 *
 * Återanvänder EXAKT samma maskineri som cronen (katalog-hämtning,
 * AI-matchning+fallback+SMS-bygge, dedup-spärrarna, kö-kort-insert) —
 * importerat från lib/agents/hanna/avtal-forslag.ts, ingen copy-paste.
 * Enda skillnaden är VILKA kandidater som samlas in och HUR MÅNGA kort
 * som får skapas per körning.
 *
 * Kandidater: kunder med minst ETT avslutat projekt ELLER en accepterad
 * offert (oavsett ålder — det är hela poängen), en rad per kund (kundens
 * SENASTE aktivitet — projekt eller offert, vilken som är färskast).
 * Sorterade senaste aktivitet FÖRST (färskast minne hos kunden = högst
 * svarssannolikhet).
 *
 * Per kund gäller SAMMA uteslutningar som cronen (aktivt avtal, förslag
 * senaste 7 dagarna, avvisat senaste 30, saknar telefonnummer) — kundens
 * senaste projekt/offert (titel + offertrader) används som matchnings-
 * underlag mot katalogen, samma AI-väg med fallback.
 *
 * Batch-tak: max MAX_NEW_PER_SWEEP (10) NYA kort per körning. Befintliga
 * pending avtalsförslag räknas mot taket (se computeSweepBudget) — kön
 * får inte bli en vägg. Svepet kan köras igen senare för nästa batch;
 * dedup-spärrarna gör om-körning säker (7-dagars bred spärr utesluter
 * kunder som redan fick ett kort denna vecka).
 *
 * Fail-safe: fel på en enskild kandidat avbryter ALDRIG hela svepet
 * (samma mönster som cronens per-kandidat try/catch).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  countPendingAvtalForslagApprovals,
  getActiveAgreementCustomerIds,
  getDedupExcludedCustomerIds,
  getQuoteContextForMatching,
  insertAvtalForslagApproval,
  isMissingRelationError,
  loadActiveAgreementCatalog,
  matchAndBuildOffer,
} from './avtal-forslag'

// ─────────────────────────────────────────────────────────────────
// Konstanter
// ─────────────────────────────────────────────────────────────────

/** Max antal NYA kort ett svep får skapa i en körning — kön får inte bli
    en vägg. Befintliga pending avtalsförslag räknas mot samma tak. */
export const MAX_NEW_PER_SWEEP = 10

/** Soft cap per källquery (completed-projekt / accepterade offerter) —
    skyddar mot orimligt stora businessar; "hundratals" kunder är långt
    under detta. */
const SWEEP_CANDIDATE_ROW_LIMIT = 5000

/** Safety-valve för maxDuration=60s på API-routen: max antal kandidater
    som får en fullständig detalj-utvärdering (kundhämtning + ev.
    AI-anrop) per körning, oavsett hur många som filtreras bort billigt
    innan dess. Satt högt nog att nästan alltid nå batch-taket, lågt nog
    att aldrig riskera timeout. */
const MAX_CANDIDATE_DETAIL_EVALUATIONS = 40

/** Safety-valve för antal Haiku-anrop per körning — bounded runtime
    (~20 anrop × ~2s ≈ under 60s) även om matchningsgraden mot katalogen
    är låg för en stor del av den historiska kundbasen. */
const MAX_AI_EVALUATIONS_PER_SWEEP = 20

// ─────────────────────────────────────────────────────────────────
// Rena, testbara kärnfunktioner
// ─────────────────────────────────────────────────────────────────

/**
 * Hur många nya kort får skapas denna körning? Befintliga pending
 * avtalsförslag räknas mot taket (4 pending → 6 nya tillåts). Aldrig
 * negativt.
 */
export function computeSweepBudget(existingPendingCount: number): number {
  return Math.max(0, MAX_NEW_PER_SWEEP - existingPendingCount)
}

export interface RawActivityRow {
  customer_id: string
  /** ISO-sträng (timestamptz från Supabase) — strängjämförelse duger. */
  activity_at: string
  title: string
  source: 'project' | 'quote'
  project_id: string | null
  quote_id: string | null
}

/**
 * Slår ihop projekt- och offert-raderna till EN rad per kund — kundens
 * senaste aktivitet (projekt ELLER offert, vilken som är färskast) — och
 * sorterar fallande på den tidsstämpeln. Ren funktion, inga DB-anrop.
 */
export function pickLatestPerCustomer(rows: RawActivityRow[]): RawActivityRow[] {
  const byCustomer = new Map<string, RawActivityRow>()
  for (const row of rows) {
    const existing = byCustomer.get(row.customer_id)
    if (!existing || row.activity_at > existing.activity_at) {
      byCustomer.set(row.customer_id, row)
    }
  }
  return Array.from(byCustomer.values()).sort((a, b) => {
    if (a.activity_at === b.activity_at) return 0
    return a.activity_at < b.activity_at ? 1 : -1
  })
}

// ─────────────────────────────────────────────────────────────────
// DB-rader
// ─────────────────────────────────────────────────────────────────

interface CompletedProjectRow {
  project_id: string
  customer_id: string
  name: string | null
  completed_at: string
  quote_id: string | null
}

interface AcceptedQuoteRow {
  quote_id: string
  customer_id: string
  title: string | null
  accepted_at: string
}

interface CustomerRow {
  customer_id: string
  name: string | null
  phone_number: string | null
}

/**
 * Hämtar hela kandidatpoolen: kunder med minst ett avslutat projekt ELLER
 * en accepterad offert, en rad per kund (senaste aktiviteten), sorterat
 * senaste-först. Två breda queries (soft-cappade) + en ren sammanslagning.
 */
async function loadSweepCandidates(supabase: SupabaseClient, businessId: string): Promise<RawActivityRow[]> {
  const [projectsResult, quotesResult] = await Promise.all([
    supabase
      .from('project')
      .select('project_id, customer_id, name, completed_at, quote_id')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .not('customer_id', 'is', null)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(SWEEP_CANDIDATE_ROW_LIMIT),
    supabase
      .from('quotes')
      .select('quote_id, customer_id, title, accepted_at')
      .eq('business_id', businessId)
      .eq('status', 'accepted')
      .not('customer_id', 'is', null)
      .not('accepted_at', 'is', null)
      .order('accepted_at', { ascending: false })
      .limit(SWEEP_CANDIDATE_ROW_LIMIT),
  ])

  const rows: RawActivityRow[] = []

  if (projectsResult.error) {
    if (!isMissingRelationError(projectsResult.error)) throw projectsResult.error
  } else {
    for (const p of (projectsResult.data || []) as CompletedProjectRow[]) {
      rows.push({
        customer_id: p.customer_id,
        activity_at: p.completed_at,
        title: p.name || 'jobbet',
        source: 'project',
        project_id: p.project_id,
        quote_id: p.quote_id,
      })
    }
  }

  if (quotesResult.error) {
    if (!isMissingRelationError(quotesResult.error)) throw quotesResult.error
  } else {
    for (const q of (quotesResult.data || []) as AcceptedQuoteRow[]) {
      rows.push({
        customer_id: q.customer_id,
        activity_at: q.accepted_at,
        title: q.title || 'offerten',
        source: 'quote',
        project_id: null,
        quote_id: q.quote_id,
      })
    }
  }

  return pickLatestPerCustomer(rows)
}

// ─────────────────────────────────────────────────────────────────
// Public entry-point
// ─────────────────────────────────────────────────────────────────

export interface KundbasSweepResult {
  business_id: string
  /** Totalt antal kunder som matchar grundkriteriet (avslutat projekt
      eller accepterad offert), oavsett om de sedan uteslöts. */
  candidates_total: number
  /** Hur många av dem som faktiskt hann utvärderas denna körning
      (safety-valve — se MAX_CANDIDATE_DETAIL_EVALUATIONS). */
  candidates_evaluated: number
  created: number
  skipped_active_agreement: number
  skipped_recent: number
  skipped_no_phone: number
  skipped_no_match: number
  ai_calls: number
  ai_fallback_used: number
  cost_usd: number
  usage: { input_tokens: number; output_tokens: number }
  errors: number
  /** true om katalogen finns men är tom (0 aktiva typer) — UI:t ska då
      inte visa knappen alls (se API-routen), men flaggan finns kvar för
      ärlig felsökning om svepet ändå triggas. */
  no_catalog: boolean
  /** true om hela taket redan var upptaget av BEFINTLIGA pending-kort
      innan svepet ens började leta efter nya kandidater. */
  already_at_cap: boolean
  pending_before: number
}

function emptyResult(businessId: string): KundbasSweepResult {
  return {
    business_id: businessId,
    candidates_total: 0,
    candidates_evaluated: 0,
    created: 0,
    skipped_active_agreement: 0,
    skipped_recent: 0,
    skipped_no_phone: 0,
    skipped_no_match: 0,
    ai_calls: 0,
    ai_fallback_used: 0,
    cost_usd: 0,
    usage: { input_tokens: 0, output_tokens: 0 },
    errors: 0,
    no_catalog: false,
    already_at_cap: false,
    pending_before: 0,
  }
}

export async function runKundbasSweepForBusiness(
  supabase: SupabaseClient,
  businessId: string,
  businessName: string | null,
): Promise<KundbasSweepResult> {
  const result = emptyResult(businessId)
  const now = new Date()

  try {
    // ── 1. Katalogen — utan den finns inget att erbjuda ────────────
    const catalogResult = await loadActiveAgreementCatalog(supabase, businessId)
    if (!catalogResult.ok) {
      if (catalogResult.reason === 'empty') result.no_catalog = true
      return result
    }
    const { catalog, catalogForPrompt, catalogById } = catalogResult.bundle

    // ── 2. Batch-taket — befintliga pending räknas mot det ─────────
    const pendingBefore = await countPendingAvtalForslagApprovals(supabase, businessId)
    result.pending_before = pendingBefore
    const budget = computeSweepBudget(pendingBefore)
    if (budget === 0) {
      result.already_at_cap = true
      // Räkna ändå kandidatpoolen så svaret är ärligt (UI:t kan visa
      // "kön är redan full" istället för "inga kunder hittades").
      const candidates = await loadSweepCandidates(supabase, businessId)
      result.candidates_total = candidates.length
      return result
    }

    // ── 3. Kandidatpoolen: avslutat projekt ELLER accepterad offert ──
    const candidates = await loadSweepCandidates(supabase, businessId)
    result.candidates_total = candidates.length
    if (candidates.length === 0) return result

    // ── 4. Samma uteslutningar som cronen ───────────────────────────
    const activeAgreementCustomerIds = await getActiveAgreementCustomerIds(supabase, businessId)
    const excludeCustomerIds = await getDedupExcludedCustomerIds(supabase, businessId, now)

    // ── 5. Per kandidat, senaste aktivitet först ────────────────────
    let aiEvaluations = 0
    let detailEvaluations = 0

    for (const candidate of candidates) {
      if (result.created >= budget) break
      if (detailEvaluations >= MAX_CANDIDATE_DETAIL_EVALUATIONS) break

      try {
        if (activeAgreementCustomerIds.has(candidate.customer_id)) {
          result.skipped_active_agreement++
          continue
        }
        if (excludeCustomerIds.has(candidate.customer_id)) {
          result.skipped_recent++
          continue
        }

        detailEvaluations++

        const { data: customer, error: customerErr } = await supabase
          .from('customer')
          .select('customer_id, name, phone_number')
          .eq('customer_id', candidate.customer_id)
          .eq('business_id', businessId)
          .maybeSingle()

        if (customerErr) throw customerErr
        const customerRow = customer as CustomerRow | null
        if (!customerRow?.phone_number) {
          result.skipped_no_phone++
          continue
        }

        if (aiEvaluations >= MAX_AI_EVALUATIONS_PER_SWEEP) break

        const { itemDescriptions, jobType } = await getQuoteContextForMatching(supabase, businessId, candidate.quote_id)

        // ── Lager 2: AI-matchning (Haiku), fail-safe till keyword-fallback ──
        aiEvaluations++
        result.ai_calls++
        const outcome = await matchAndBuildOffer({
          candidateTitle: candidate.title,
          itemDescriptions,
          jobType,
          catalog,
          catalogForPrompt,
          catalogById,
          customerFirstName: customerRow.name,
          businessName,
        })
        result.cost_usd += outcome.cost_usd
        if (outcome.usage) {
          result.usage.input_tokens += outcome.usage.input_tokens
          result.usage.output_tokens += outcome.usage.output_tokens
        }
        if (outcome.usedFallback) result.ai_fallback_used++

        if (!outcome.matched) {
          result.skipped_no_match++
          continue
        }

        const { matchedTypeIds, smsText, primaryType } = outcome.matched

        const { error: insertErr } = await insertAvtalForslagApproval({
          supabase,
          businessId,
          customer: { customer_id: customerRow.customer_id, name: customerRow.name, phone_number: customerRow.phone_number },
          primaryType,
          matchedTypeIds,
          smsText,
          sourceLabel: `efter ${candidate.title}`,
          sourceRefs: { project_id: candidate.project_id, quote_id: candidate.quote_id },
          now,
        })

        if (insertErr) {
          console.error('[kundbas-svep] approval insert error:', {
            business_id: businessId,
            customer_id: candidate.customer_id,
            error: insertErr,
          })
          result.errors++
          continue
        }

        result.created++
      } catch (err) {
        console.error('[kundbas-svep] kandidat-fel:', {
          business_id: businessId,
          customer_id: candidate.customer_id,
          error: err instanceof Error ? err.message : String(err),
        })
        result.errors++
      }
    }

    result.candidates_evaluated = detailEvaluations
    return result
  } catch (err) {
    console.error('[kundbas-svep] business-fel:', businessId, err instanceof Error ? err.message : String(err))
    result.errors++
    return result
  }
}

// ─────────────────────────────────────────────────────────────────
// Svensk klarspråks-sammanfattning för UI:t (toast vid 0 skapade kort)
// ─────────────────────────────────────────────────────────────────

/**
 * Bygger en ärlig, mänsklig sammanfattning av VARFÖR svepet inte skapade
 * (fler) förslag. Ren funktion — testbar utan DB. Används av
 * app/api/agreements/sweep/route.ts respektive kundlistans toast.
 */
export function summarizeSweepResult(result: KundbasSweepResult): string {
  if (result.no_catalog) {
    return 'Du har ingen aktiv avtalstyp i katalogen ännu — lägg upp minst en under Inställningar först.'
  }
  if (result.already_at_cap) {
    return `Redan ${result.pending_before} avtalsförslag väntar på godkännande i kön — godkänn eller avvisa några innan nästa svep.`
  }
  if (result.candidates_total === 0) {
    return 'Inga kunder med avslutade projekt eller accepterade offerter hittades.'
  }

  const reasons: string[] = []
  if (result.skipped_active_agreement > 0) reasons.push(`${result.skipped_active_agreement} har redan ett aktivt avtal`)
  if (result.skipped_recent > 0) reasons.push(`${result.skipped_recent} kontaktades nyligen`)
  if (result.skipped_no_phone > 0) reasons.push(`${result.skipped_no_phone} saknar telefonnummer`)
  if (result.skipped_no_match > 0) reasons.push(`${result.skipped_no_match} matchade ingen tjänst i katalogen`)

  if (reasons.length === 0) {
    return 'Inga nya förslag just nu.'
  }
  return `Inga nya förslag just nu — ${reasons.join(', ')}.`
}
