/**
 * Hanna — förslagsmaskineriet för serviceavtal (Motor 2, Etapp 2, lager 2).
 *
 * Daglig cron (app/api/cron/avtal-forslag/route.ts): completed-projekt
 * senaste 7 dagarna (±12h-fönster, samma mönster som review-requests) vars
 * kund saknar aktivt service_agreement och inte nyligen kontaktats/avvisat
 * → Claude Haiku läser projekttitel + offertradsbeskrivningar och väljer
 * 0–2 bäst matchande katalogposter ur businessens service_agreement_type
 * samt skriver ETT personligt erbjudande-SMS. AI:n väljer och personaliserar
 * — hittar ALDRIG på pris/intervall (tre-lagers-principen, se
 * tasks/motor2-serviceavtal-spec.md).
 *
 * Fallback utan LLM (API-fel/ingen nyckel/inget svar): match_keys-matchning
 * mot projekttitel + kopplad offerts job_type, plus ett deterministiskt
 * mall-SMS. En AI som SVARAR men medvetet väljer 0 matchningar respekteras
 * som det — det är bara ETT UTEBLIVET SVAR (API-fel, saknad nyckel, trasig
 * JSON) som utlöser fallback-vägen.
 *
 * Kortet skapas som approval_type 'send_sms' (återanvänder befintlig
 * exekvering rakt av, samma mönster som review-requests/capacity-fill) —
 * godkänn skickar erbjudande-SMS:et. Kortet bär agreement_type_ids i
 * payloaden så hantverkaren ser exakt vad som erbjuds.
 *
 * Dedup (två lager):
 *   1. Bred 7-dagars-spärr: kunden får inte ha fått NÅGOT förslag (valfri
 *      approval_type) senaste 7 dagarna — samma andemening som
 *      lib/agents/hanna/capacity-fill.ts.
 *   2. Smal 30-dagars-spärr: kunden får inte ha AVVISAT (status='rejected')
 *      ett tidigare avtalsförslag (payload.trigger==='avtal_forslag')
 *      senaste 30 dagarna — ett nej ska respekteras längre än 7 dagar.
 *
 * Cost-guard: caller (route) kör checkCostGuards/logAgentRun per business
 * (agent-observations-mönstret) — denna fil vet inget om paus/cost-cap.
 *
 * DELAT med engångssvepet (lib/agents/hanna/kundbas-svep.ts, Etapp 2.5):
 * katalog-hämtning (loadActiveAgreementCatalog), kunder med aktivt avtal
 * (getActiveAgreementCustomerIds), dedup-spärrarna (getDedupExcludedCustomerIds),
 * AI-matchning+fallback+SMS-bygge (matchAndBuildOffer), offertkontext
 * (getQuoteContextForMatching) och kö-kort-insert (insertAvtalForslagApproval)
 * exporteras härifrån och används OFÖRÄNDRAT av svepet — ingen copy-paste,
 * ingen avvikelse i cronens beteende.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getClaudeModel } from '@/lib/ai/get-model'
import { normalizeSwedishPhone } from '@/lib/phone-normalize'
import { extractFirstName } from '@/lib/agents/daniel/unopened-quotes'
import { priceInclVatPerVisit, type PriceItemLike } from '@/lib/agreements/pricing'

// ─────────────────────────────────────────────────────────────────
// Konstanter
// ─────────────────────────────────────────────────────────────────

const CANDIDATE_WINDOW_DAYS = 7
const CANDIDATE_WINDOW_JITTER_HOURS = 12
const BROAD_DEDUP_WINDOW_DAYS = 7
const REJECTED_DEDUP_WINDOW_DAYS = 30
const MAX_QUOTE_ITEM_LINES = 15
export const AVTAL_FORSLAG_TRIGGER = 'avtal_forslag'
export const AVTAL_FORSLAG_SMS_MAX_LENGTH = 300
export const APPROVAL_EXPIRES_DAYS = 14

// Haiku-priser (per skill-katalogen 2026-07): $1/1M input, $5/1M output.
const HAIKU_INPUT_PRICE_PER_M = 1.0
const HAIKU_OUTPUT_PRICE_PER_M = 5.0

// ─────────────────────────────────────────────────────────────────
// Rena typer + hjälpfunktioner — testbara utan DB (tests/serviceavtal.spec.ts)
// ─────────────────────────────────────────────────────────────────

export interface CatalogMatchEntry {
  type_id: string
  name: string
  description: string | null
  interval_months: number
  match_keys: string[] | null
  price_items: PriceItemLike[] | null
}

export interface HaikuMatchResult {
  matches: string[]
  sms: string
}

/**
 * Fallback-matchning UTAN LLM: match_keys mot fritext (projekttitel +
 * ev. kopplad offerts job_type), case-insensitive innehåll. Returnerar
 * max 2 type_id, i katalogordning.
 */
export function matchAgreementTypesByKeywords(
  searchText: string,
  catalog: Array<Pick<CatalogMatchEntry, 'type_id' | 'match_keys'>>,
): string[] {
  const normalized = (searchText || '').toLowerCase()
  if (!normalized.trim()) return []

  const matches: string[] = []
  for (const entry of catalog) {
    const keys = entry.match_keys || []
    const hit = keys.some(
      (k) => typeof k === 'string' && k.trim().length > 0 && normalized.includes(k.trim().toLowerCase()),
    )
    if (hit) {
      matches.push(entry.type_id)
      if (matches.length >= 2) break
    }
  }
  return matches
}

/**
 * Deterministiskt mall-SMS när Haiku inte är tillgänglig — exakt formen
 * ur specen: "Hej {förnamn}! Nu när {projekttitel} är klart: vi erbjuder
 * {typnamn} var {intervall}:e månad ({pris} kr/besök). Svara JA så lägger
 * vi upp det. /{företagsnamn}". Nämner bara DEN BÄST matchande typen
 * (singular mall) även om upp till två type_id skickas med i payloaden.
 */
export function buildFallbackAvtalSms(opts: {
  customerFirstName: string | null | undefined
  projectTitle: string
  typeName: string
  intervalMonths: number
  priceInclVat: number
  businessName: string | null | undefined
}): string {
  const firstName = extractFirstName(opts.customerFirstName)
  const greeting = firstName ? `Hej ${firstName}!` : 'Hej!'
  const businessName = (opts.businessName || '').trim() || 'oss'
  const projectTitle = opts.projectTitle || 'jobbet'

  const full =
    `${greeting} Nu när ${projectTitle} är klart: vi erbjuder ${opts.typeName} ` +
    `var ${opts.intervalMonths}:e månad (${opts.priceInclVat} kr/besök). ` +
    `Svara JA så lägger vi upp det. /${businessName}`

  return truncateSms(full)
}

/** Defensiv trunkering — mallen är normalt under gränsen, men extremt
    långa typnamn/projekttitlar ska aldrig krascha SMS-utskicket. */
function truncateSms(text: string): string {
  if (text.length <= AVTAL_FORSLAG_SMS_MAX_LENGTH) return text
  return text.slice(0, AVTAL_FORSLAG_SMS_MAX_LENGTH - 1).trimEnd() + '…'
}

export interface CatalogEntryForPrompt {
  type_id: string
  name: string
  description: string | null
  interval_months: number
  priceInclVat: number
}

/**
 * Bygger user-messaget till Haiku. Ren funktion — testbar utan API-anrop.
 * Innehåller ALDRIG instruktioner om att hitta på pris/intervall; katalog-
 * raderna är de enda tillåtna värdena (validering sker separat i
 * parseAndValidateHaikuResponse).
 */
export function buildHaikuUserMessage(opts: {
  projectTitle: string
  itemDescriptions: string[]
  catalog: CatalogEntryForPrompt[]
  customerFirstName: string | null | undefined
  businessName: string | null | undefined
}): string {
  const itemLines =
    opts.itemDescriptions.length > 0
      ? opts.itemDescriptions
          .slice(0, MAX_QUOTE_ITEM_LINES)
          .map((d) => `- ${d}`)
          .join('\n')
      : '(inga offertrader tillgängliga)'

  const catalogLines = opts.catalog
    .map(
      (c) =>
        `- type_id: ${c.type_id} | namn: ${c.name} | beskrivning: ${c.description || '-'} | ` +
        `intervall: var ${c.interval_months}:e månad | pris: ${c.priceInclVat} kr/besök`,
    )
    .join('\n')

  const customerLabel = extractFirstName(opts.customerFirstName) || 'kunden'
  const businessName = (opts.businessName || '').trim() || 'företaget'

  return `Du är Hanna, säljassistent hos ett svenskt hantverksföretag. Ett jobb hos en kund är precis avslutat. Din uppgift: välj 0–2 bäst matchande serviceavtal ur katalogen nedan och skriv ETT personligt erbjudande-SMS till kunden.

VIKTIGA REGLER:
- Du får ALDRIG hitta på eller ändra pris eller intervall — använd bara katalogens egna värden ordagrant.
- Om inget i katalogen passar det avslutade jobbet väl: låt "matches" vara en tom lista.
- SMS:et: max 300 tecken, varm men rak svensk ton, ska nämna tjänsten och intervallet, uppmana kunden att svara JA, och avsluta med företagsnamnet.

Avslutat jobb:
Titel: ${opts.projectTitle}
Offertrader:
${itemLines}

Serviceavtalskatalog (välj ENDAST type_id från denna lista):
${catalogLines}

Kund: ${customerLabel}
Företag: ${businessName}

Svara ENDAST med giltig JSON, exakt detta format och ingen annan text:
{"matches": ["type_id"], "sms": "SMS-text här"}`
}

/**
 * Validera + normalisera Haikus JSON-svar. Kastar bort ogiltiga type_id
 * (finns inte i katalogen) istället för att underkänna hela svaret.
 * Returnerar null om svaret inte går att tolka som giltig JSON med rätt
 * form — det UTLÖSER fallback-vägen hos anroparen.
 */
export function parseAndValidateHaikuResponse(
  rawText: string | null | undefined,
  validTypeIds: string[],
): HaikuMatchResult | null {
  if (!rawText) return null
  const match = rawText.match(/\{[\s\S]*\}/)
  if (!match) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>
  if (typeof obj.sms !== 'string' || !obj.sms.trim()) return null
  if (!Array.isArray(obj.matches)) return null

  const validSet = new Set(validTypeIds)
  const matches = obj.matches
    .filter((id): id is string => typeof id === 'string' && validSet.has(id))
    .slice(0, 2)

  return { matches, sms: truncateSms(obj.sms.trim()) }
}

// ─────────────────────────────────────────────────────────────────
// Haiku-anrop — kapslar in Anthropic-SDK:t, aldrig kastar (fångar internt)
// ─────────────────────────────────────────────────────────────────

export interface HaikuCallOutcome {
  result: HaikuMatchResult | null
  usage: { input_tokens: number; output_tokens: number } | null
  cost_usd: number
}

export async function matchViaHaiku(opts: {
  projectTitle: string
  itemDescriptions: string[]
  catalog: CatalogEntryForPrompt[]
  customerFirstName: string | null | undefined
  businessName: string | null | undefined
}): Promise<HaikuCallOutcome> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[avtal-forslag] ANTHROPIC_API_KEY saknas — använder fallback-matchning')
    return { result: null, usage: null, cost_usd: 0 }
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const userMessage = buildHaikuUserMessage(opts)

    const response = await anthropic.messages.create({
      model: getClaudeModel('extraction'),
      max_tokens: 500,
      messages: [{ role: 'user', content: userMessage }],
    })

    const block = response.content?.[0]
    const text = block && block.type === 'text' ? block.text : ''

    const usageRaw = (response as { usage?: { input_tokens?: number; output_tokens?: number } }).usage
    const usage = usageRaw
      ? { input_tokens: usageRaw.input_tokens || 0, output_tokens: usageRaw.output_tokens || 0 }
      : null
    const costUsd = usage
      ? (usage.input_tokens / 1_000_000) * HAIKU_INPUT_PRICE_PER_M +
        (usage.output_tokens / 1_000_000) * HAIKU_OUTPUT_PRICE_PER_M
      : 0

    const validTypeIds = opts.catalog.map((c) => c.type_id)
    const result = parseAndValidateHaikuResponse(text, validTypeIds)

    return { result, usage, cost_usd: costUsd }
  } catch (err) {
    console.error('[avtal-forslag] Haiku-anrop misslyckades (fallback används):', err instanceof Error ? err.message : String(err))
    return { result: null, usage: null, cost_usd: 0 }
  }
}

// ─────────────────────────────────────────────────────────────────
// DB-rader
// ─────────────────────────────────────────────────────────────────

interface ProjectRow {
  project_id: string
  name: string | null
  customer_id: string | null
  completed_at: string
  quote_id: string | null
}

interface CustomerRow {
  customer_id: string
  name: string | null
  phone_number: string | null
}

// ─────────────────────────────────────────────────────────────────
// Delat maskineri — används av BÅDE cronen (nedan) och engångssvepet
// (lib/agents/hanna/kundbas-svep.ts). Extraherat 1:1 ur cronens tidigare
// inline-logik — ingen beteendeändring, bara namngiven och återanvändbar.
// ─────────────────────────────────────────────────────────────────

export function isMissingRelationError(error: unknown): boolean {
  if (!error) return false
  const e = error as { code?: string; message?: string }
  if (e.code === '42P01') return true
  const message = String(e.message || '')
  return /does not exist|schema cache/i.test(message) && /relation|table|column/i.test(message)
}

export interface CatalogBundle {
  catalog: CatalogMatchEntry[]
  catalogForPrompt: CatalogEntryForPrompt[]
  catalogById: Map<string, CatalogMatchEntry>
}

export type CatalogLoadResult =
  | { ok: true; bundle: CatalogBundle }
  | { ok: false; reason: 'missing_relation' | 'empty' }

/**
 * Hämtar businessens aktiva service_agreement_type-katalog (lager 1) och
 * förbereder både prompt-formen (pris inkl. moms) och en type_id-lookup.
 * Två sätt att inte ha en katalog att jobba med, hålls isär åt callern
 * precis som cronen alltid gjort: 'missing_relation' (v74 inte körd —
 * tyst no-op) vs 'empty' (relationen finns, 0 aktiva rader — räknas som
 * skipped.no_catalog).
 */
export async function loadActiveAgreementCatalog(
  supabase: SupabaseClient,
  businessId: string,
): Promise<CatalogLoadResult> {
  const { data: catalogData, error: catalogErr } = await supabase
    .from('service_agreement_type')
    .select('type_id, name, description, interval_months, match_keys, price_items')
    .eq('business_id', businessId)
    .eq('is_active', true)

  if (catalogErr) {
    if (isMissingRelationError(catalogErr)) return { ok: false, reason: 'missing_relation' }
    throw catalogErr
  }

  const catalog = (catalogData || []) as CatalogMatchEntry[]
  if (catalog.length === 0) return { ok: false, reason: 'empty' }

  const catalogForPrompt: CatalogEntryForPrompt[] = catalog.map((c) => ({
    type_id: c.type_id,
    name: c.name,
    description: c.description,
    interval_months: c.interval_months,
    priceInclVat: priceInclVatPerVisit(c.price_items),
  }))
  const catalogById = new Map(catalog.map((c) => [c.type_id, c]))

  return { ok: true, bundle: { catalog, catalogForPrompt, catalogById } }
}

/** Kunder med ett AKTIVT service_agreement — uteslut helt, oavsett trigger. */
export async function getActiveAgreementCustomerIds(
  supabase: SupabaseClient,
  businessId: string,
): Promise<Set<string>> {
  const { data: activeAgreements, error: agrErr } = await supabase
    .from('service_agreement')
    .select('customer_id')
    .eq('business_id', businessId)
    .eq('status', 'active')

  if (agrErr && !isMissingRelationError(agrErr)) throw agrErr
  return new Set(((activeAgreements || []) as Array<{ customer_id: string }>).map((a) => a.customer_id))
}

/**
 * Dedup-spärrarna (två lager, se filkommentaren): bred 7-dagars-spärr
 * (vilket förslag som helst nyligen) + smal 30-dagars-spärr (avvisat
 * avtalsförslag). Ren mängd av customer_id att utesluta.
 */
export async function getDedupExcludedCustomerIds(
  supabase: SupabaseClient,
  businessId: string,
  now: Date,
): Promise<Set<string>> {
  const rejectedWindowStart = new Date(now.getTime() - REJECTED_DEDUP_WINDOW_DAYS * 86400000).toISOString()
  const broadWindowStart = new Date(now.getTime() - BROAD_DEDUP_WINDOW_DAYS * 86400000).toISOString()

  const { data: recentApprovals } = await supabase
    .from('pending_approvals')
    .select('payload, status, created_at')
    .eq('business_id', businessId)
    .gte('created_at', rejectedWindowStart)
    .limit(1000)

  const excludeCustomerIds = new Set<string>()
  for (const row of (recentApprovals || []) as Array<{ payload: unknown; status: string; created_at: string }>) {
    const payload = (row.payload || {}) as Record<string, unknown>
    const customerId = payload.customer_id ? String(payload.customer_id) : null
    if (!customerId) continue

    // Lager 1: bred 7-dagars-spärr — vilket förslag som helst nyligen.
    if (row.created_at >= broadWindowStart) {
      excludeCustomerIds.add(customerId)
      continue
    }

    // Lager 2: smal 30-dagars-spärr — bara AVVISADE avtalsförslag.
    if (row.status === 'rejected' && payload.trigger === AVTAL_FORSLAG_TRIGGER) {
      excludeCustomerIds.add(customerId)
    }
  }

  return excludeCustomerIds
}

/** Antal pending kö-kort med trigger 'avtal_forslag' — svepets batch-tak
    räknar dessa mot taket (se lib/agents/hanna/kundbas-svep.ts). */
export async function countPendingAvtalForslagApprovals(
  supabase: SupabaseClient,
  businessId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('pending_approvals')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('status', 'pending')
    .contains('payload', { trigger: AVTAL_FORSLAG_TRIGGER })

  if (error) {
    if (isMissingRelationError(error)) return 0
    throw error
  }
  return count || 0
}

export interface MatchAndBuildOfferParams {
  /** Projekttitel (cron) eller offert-/projekttitel (svepet) — texten som
      visas för AI:n och nämns i fallback-SMS:et. */
  candidateTitle: string
  itemDescriptions: string[]
  jobType: string | null
  catalog: CatalogMatchEntry[]
  catalogForPrompt: CatalogEntryForPrompt[]
  catalogById: Map<string, CatalogMatchEntry>
  customerFirstName: string | null | undefined
  businessName: string | null | undefined
}

export interface MatchAndBuildOfferOutcome {
  matched: {
    matchedTypeIds: string[]
    smsText: string
    primaryType: CatalogMatchEntry
  } | null
  /** true om Haiku inte svarade giltigt och keyword-fallbacken kördes —
      räknas mot ai_fallback_used OAVSETT om fallbacken hittade en match. */
  usedFallback: boolean
  cost_usd: number
  usage: { input_tokens: number; output_tokens: number } | null
}

/**
 * Lager 2: AI-matchning (Haiku) mot katalogen, fail-safe till keyword-
 * fallback + deterministiskt mall-SMS. Ren orkestrering — inga DB-anrop,
 * inga sidoeffekter. Delad mellan cron och svep så matchningslogiken
 * ALDRIG kan divergera mellan de två vägarna.
 */
export async function matchAndBuildOffer(params: MatchAndBuildOfferParams): Promise<MatchAndBuildOfferOutcome> {
  const haikuOutcome = await matchViaHaiku({
    projectTitle: params.candidateTitle,
    itemDescriptions: params.itemDescriptions,
    catalog: params.catalogForPrompt,
    customerFirstName: params.customerFirstName,
    businessName: params.businessName,
  })

  let matchedTypeIds: string[]
  let smsText: string | null
  let usedFallback = false

  if (haikuOutcome.result !== null) {
    matchedTypeIds = haikuOutcome.result.matches
    smsText = haikuOutcome.result.sms
  } else {
    usedFallback = true
    const searchText = `${params.candidateTitle} ${params.jobType || ''}`.trim()
    matchedTypeIds = matchAgreementTypesByKeywords(searchText, params.catalog)
    smsText = null // byggs nedan från första matchen
  }

  if (matchedTypeIds.length === 0) {
    return { matched: null, usedFallback, cost_usd: haikuOutcome.cost_usd, usage: haikuOutcome.usage }
  }

  const primaryType = params.catalogById.get(matchedTypeIds[0])
  if (!primaryType) {
    // Bör inte kunna hända (validerat mot katalogen ovan) — fail-safe.
    return { matched: null, usedFallback, cost_usd: haikuOutcome.cost_usd, usage: haikuOutcome.usage }
  }

  if (!smsText) {
    smsText = buildFallbackAvtalSms({
      customerFirstName: params.customerFirstName,
      projectTitle: params.candidateTitle,
      typeName: primaryType.name,
      intervalMonths: primaryType.interval_months,
      priceInclVat: priceInclVatPerVisit(primaryType.price_items),
      businessName: params.businessName,
    })
  }

  return {
    matched: { matchedTypeIds, smsText, primaryType },
    usedFallback,
    cost_usd: haikuOutcome.cost_usd,
    usage: haikuOutcome.usage,
  }
}

export interface InsertAvtalForslagApprovalParams {
  supabase: SupabaseClient
  businessId: string
  customer: { customer_id: string; name: string | null; phone_number: string }
  primaryType: CatalogMatchEntry
  matchedTypeIds: string[]
  smsText: string
  /** T.ex. "efter värmepumpsbyte" — sätts ihop till beskrivningen
      "{typnamn} {sourceLabel}", exakt cronens tidigare textform. */
  sourceLabel: string
  sourceRefs: { project_id?: string | null; quote_id?: string | null }
  now: Date
}

/**
 * Skapar kö-kortet (approval_type 'send_sms', samma form som
 * review-requests/capacity-fill). Delad mellan cron och svep — payloaden
 * är identisk oavsett vilken väg som skapade kortet (bara project_id/
 * quote_id skiljer beroende på källa).
 */
export async function insertAvtalForslagApproval(
  params: InsertAvtalForslagApprovalParams,
): Promise<{ error: string | null }> {
  const expiresAt = new Date(params.now.getTime() + APPROVAL_EXPIRES_DAYS * 86400000)
  const customerLabel = params.customer.name || 'kunden'
  const toPhone = normalizeSwedishPhone(params.customer.phone_number)

  const payload: Record<string, unknown> = {
    to: toPhone,
    message: params.smsText,
    customer_id: params.customer.customer_id,
    customer_name: params.customer.name,
    routed_agent: 'hanna',
    trigger: AVTAL_FORSLAG_TRIGGER,
    agreement_type_ids: params.matchedTypeIds,
  }
  if (params.sourceRefs.project_id) payload.project_id = params.sourceRefs.project_id
  if (params.sourceRefs.quote_id) payload.quote_id = params.sourceRefs.quote_id

  const { error } = await params.supabase.from('pending_approvals').insert({
    business_id: params.businessId,
    approval_type: 'send_sms',
    title: `🔧 Serviceavtal — ${customerLabel}`,
    description: `${params.primaryType.name} ${params.sourceLabel}`,
    status: 'pending',
    risk_level: 'low',
    expires_at: expiresAt.toISOString(),
    payload,
  })

  return { error: error?.message || null }
}

// ─────────────────────────────────────────────────────────────────
// Public entry-point
// ─────────────────────────────────────────────────────────────────

export interface AvtalForslagResult {
  business_id: string
  candidates_scanned: number
  approvals_created: number
  ai_calls: number
  ai_fallback_used: number
  cost_usd: number
  usage: { input_tokens: number; output_tokens: number }
  skipped: {
    no_catalog: number
    no_customer: number
    has_active_agreement: number
    recent_contact: number
    no_phone: number
    already_pending: number
    no_match: number
  }
  errors: number
}

function emptyResult(businessId: string): AvtalForslagResult {
  return {
    business_id: businessId,
    candidates_scanned: 0,
    approvals_created: 0,
    ai_calls: 0,
    ai_fallback_used: 0,
    cost_usd: 0,
    usage: { input_tokens: 0, output_tokens: 0 },
    skipped: {
      no_catalog: 0,
      no_customer: 0,
      has_active_agreement: 0,
      recent_contact: 0,
      no_phone: 0,
      already_pending: 0,
      no_match: 0,
    },
    errors: 0,
  }
}

/**
 * Hämta offertradsbeskrivningar (max 15, sort_order) + offertens job_type
 * via ett projekts (eller svepets) quote_id. Fail-safe: fel/saknad offert
 * ger tom kontext — kandidaten matchas då bara på titeln. Delad mellan
 * cron och svep (se filkommentaren).
 */
export async function getQuoteContextForMatching(
  supabase: SupabaseClient,
  businessId: string,
  quoteId: string | null,
): Promise<{ itemDescriptions: string[]; jobType: string | null }> {
  if (!quoteId) return { itemDescriptions: [], jobType: null }

  try {
    const [{ data: quote }, { data: itemRows }] = await Promise.all([
      supabase.from('quotes').select('job_type, items').eq('quote_id', quoteId).eq('business_id', businessId).maybeSingle(),
      supabase
        .from('quote_items')
        .select('description')
        .eq('quote_id', quoteId)
        .order('sort_order', { ascending: true })
        .limit(MAX_QUOTE_ITEM_LINES),
    ])

    let itemDescriptions = ((itemRows || []) as Array<{ description: string | null }>)
      .map((r) => (r.description || '').trim())
      .filter(Boolean)

    // Legacy-offerter saknar quote_items-rader — JSONB-fallback (samma
    // mönster som lib/projects/get-quote-context.ts).
    if (itemDescriptions.length === 0 && Array.isArray(quote?.items)) {
      itemDescriptions = (quote!.items as Array<{ description?: string; name?: string }>)
        .slice(0, MAX_QUOTE_ITEM_LINES)
        .map((j) => (j.description || j.name || '').trim())
        .filter(Boolean)
    }

    return { itemDescriptions, jobType: (quote?.job_type as string | null) || null }
  } catch (err) {
    console.error('[avtal-forslag] quote-kontext misslyckades (icke-blockerande):', err instanceof Error ? err.message : String(err))
    return { itemDescriptions: [], jobType: null }
  }
}

export async function runAvtalForslagForBusiness(
  supabase: SupabaseClient,
  businessId: string,
  businessName: string | null,
): Promise<AvtalForslagResult> {
  const result = emptyResult(businessId)
  const now = new Date()

  try {
    // ── 1. Katalogen — utan den finns inget att erbjuda ────────────
    const catalogResult = await loadActiveAgreementCatalog(supabase, businessId)
    if (!catalogResult.ok) {
      if (catalogResult.reason === 'empty') result.skipped.no_catalog = 1
      return result
    }
    const { catalog, catalogForPrompt, catalogById } = catalogResult.bundle

    // ── 2. Kandidat-projekt: completed senaste 7 dagarna ±12h ──────
    const windowAnchor = new Date(now.getTime() - CANDIDATE_WINDOW_DAYS * 86400000)
    const windowStart = new Date(windowAnchor.getTime() - CANDIDATE_WINDOW_JITTER_HOURS * 3600000)
    const windowEnd = new Date(windowAnchor.getTime() + CANDIDATE_WINDOW_JITTER_HOURS * 3600000)

    const { data: projectsData, error: projectsErr } = await supabase
      .from('project')
      .select('project_id, name, customer_id, completed_at, quote_id')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .gte('completed_at', windowStart.toISOString())
      .lte('completed_at', windowEnd.toISOString())

    if (projectsErr) {
      if (isMissingRelationError(projectsErr)) return result
      throw projectsErr
    }

    const projects = (projectsData || []) as ProjectRow[]
    result.candidates_scanned = projects.length
    if (projects.length === 0) return result

    // ── 3. Kunder med aktivt avtal — uteslut helt ───────────────────
    const activeAgreementCustomerIds = await getActiveAgreementCustomerIds(supabase, businessId)

    // ── 4. Dedup — bred 7d (alla förslag) + smal 30d (avvisade avtal) ──
    const excludeCustomerIds = await getDedupExcludedCustomerIds(supabase, businessId, now)

    // ── 5. Per kandidat-projekt ──────────────────────────────────────
    for (const project of projects) {
      try {
        if (!project.customer_id) {
          result.skipped.no_customer++
          continue
        }
        if (activeAgreementCustomerIds.has(project.customer_id)) {
          result.skipped.has_active_agreement++
          continue
        }
        if (excludeCustomerIds.has(project.customer_id)) {
          result.skipped.recent_contact++
          continue
        }

        const { data: customer, error: customerErr } = await supabase
          .from('customer')
          .select('customer_id, name, phone_number')
          .eq('customer_id', project.customer_id)
          .eq('business_id', businessId)
          .maybeSingle()

        if (customerErr) throw customerErr
        const customerRow = customer as CustomerRow | null
        if (!customerRow?.phone_number) {
          result.skipped.no_phone++
          continue
        }

        // Idempotens — redan ett pending förslag för DETTA projekt?
        const { data: existingApproval } = await supabase
          .from('pending_approvals')
          .select('id')
          .eq('business_id', businessId)
          .eq('approval_type', 'send_sms')
          .eq('status', 'pending')
          .contains('payload', { project_id: project.project_id })
          .limit(1)

        if ((existingApproval || []).length > 0) {
          result.skipped.already_pending++
          continue
        }

        const projectTitle = project.name || 'jobbet'
        const { itemDescriptions, jobType } = await getQuoteContextForMatching(supabase, businessId, project.quote_id)

        // ── Lager 2: AI-matchning (Haiku), fail-safe till keyword-fallback ──
        result.ai_calls++
        const outcome = await matchAndBuildOffer({
          candidateTitle: projectTitle,
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
          result.skipped.no_match++
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
          sourceLabel: `efter ${projectTitle}`,
          sourceRefs: { project_id: project.project_id },
          now,
        })

        if (insertErr) {
          console.error('[avtal-forslag] approval insert error:', {
            business_id: businessId,
            project_id: project.project_id,
            error: insertErr,
          })
          result.errors++
          continue
        }

        result.approvals_created++
      } catch (err) {
        console.error('[avtal-forslag] kandidat-fel:', {
          business_id: businessId,
          project_id: project.project_id,
          error: err instanceof Error ? err.message : String(err),
        })
        result.errors++
      }
    }

    return result
  } catch (err) {
    console.error('[avtal-forslag] business-fel:', businessId, err instanceof Error ? err.message : String(err))
    result.errors++
    return result
  }
}
