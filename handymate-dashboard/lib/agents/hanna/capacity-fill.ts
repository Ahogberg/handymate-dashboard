/**
 * Hanna — "tunn vecka"-trigger (kapacitetsfyllnad).
 *
 * Bygger vidare på Kapacitet-primitiv v1 (lib/capacity/week-capacity.ts):
 * när NÄSTA veckas bokade kapacitet är låg (thin_week) föreslår Hanna —
 * som en KÖAD pending_approval, ALDRIG autonomt — SMS till kandidater ur
 * hantverkarens EGEN CRM ("vi har tider nästa vecka"). Fyll den egna
 * kalendern innan pengar spenderas på annonsplattformar.
 *
 * Kandidat-prioritering (max 3/körning, cronen körs 1x/vecka):
 *   1. Obesvarade offerter (status sent/opened, >7 dagar sedan skickad,
 *      kund med telefon) — högst värde först. En kund som redan bett om
 *      en offert är varmare än en gammal kund vi bara gissar är intresserad.
 *   2. Om färre än 3: tidigare kunder (last_job_date >90 dagar sedan,
 *      telefon) — LTV-viktad (VÅG 1d, value-chain-plan.md): högst
 *      lifetime_value först, mest inaktiva som tie-break (se
 *      rankPastCustomerCandidates nedan). Mest värt att fylla veckan med en
 *      kund som spenderat mycket hos oss förut. Per-kandidat senaste
 *      job_type hämtas separat för personlig ton.
 *
 * Datadisciplin — VIKTIGT: föreslår ENDAST när kapaciteten kommer från en
 * verklig inställning (capacity.configured / source==='settings'). En
 * gissad kapacitet (source==='fallback', 40h × aktiva teammedlemmar) är
 * för osäker grund för att skicka SMS till kunder på — se
 * lib/capacity/week-capacity.ts.
 *
 * Dedup: hoppar kunder som redan har ETT förslag (vilket approval_type
 * som helst — samma bredd som Daniels konflikt-avoidance i
 * lib/agents/daniel/observation-prompt.ts ~373-404) senaste 7 dagarna.
 *
 * Meddelandet byggs deterministiskt (buildCapacityFillMessage), inte av
 * en LLM — samma motivering som buildUnopenedNudgeMessage i
 * lib/agents/daniel/unopened-quotes.ts: en mall-imitation av en LLM
 * driftar över tid, en testad helper är truth-source.
 *
 * Per-person-medveten (R5, tasks/resurs-masterplan.md): allt ovan är
 * OFÖRÄNDRAT — business-aggregatet (getWeekCapacity/computeWeekCapacity)
 * avgör fortfarande ensamt OM och NÄR ett förslag skapas. Det som är NYTT
 * är en per-medlem-beläggningsbild för samma vecka (computeNextWeekPerson-
 * Breakdown, identifyThinPeople, formatPersonUtilizationBreakdown, se
 * längre ner i filen) som ADDERAS till varje skapat förslags description/
 * payload — så owner/admin ser VEM som har luckor, inte bara att veckan
 * totalt sett är tunn.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { svDateStr, svDateStrPlusDays } from '@/lib/dates'
import { getWeekCapacity, mondayOfWeek, THIN_WEEK_UTILIZATION_THRESHOLD } from '@/lib/capacity/week-capacity'
import { daysSinceSent, extractFirstName } from '@/lib/agents/daniel/unopened-quotes'
import { fetchPersonDays } from '@/lib/schedule/person-day'
import { computePersonWeekUtilization } from '@/lib/schedule/utilization'
import { computeFreeCapacity } from '@/lib/capacity/free-capacity'
import { canContactCustomer } from '@/lib/outbound/frequency-guard'

// ─────────────────────────────────────────────────────────────────
// Konstanter
// ─────────────────────────────────────────────────────────────────

/** Offerter äldre än detta (dagar sedan sent_at) utan svar räknas som kandidater. */
export const UNSOLD_QUOTE_MIN_DAYS = 7
/** Kunder inaktiva minst detta antal dagar räknas som "tidigare kund" att väcka. */
export const PAST_CUSTOMER_INACTIVE_DAYS = 90
/** Max antal förslag per företag och körning. */
export const MAX_CANDIDATES_PER_BUSINESS = 3
/** Hoppa kund som redan fått NÅGOT förslag senaste N dagarna (dedup). */
const DEDUP_WINDOW_DAYS = 7
const QUOTE_POOL = 20
const CUSTOMER_POOL = 20

const UNSOLD_QUOTE_STATUSES = new Set(['sent', 'opened'])

// ─────────────────────────────────────────────────────────────────
// SMS-meddelande — deterministiskt, exporterat, testbart
// ─────────────────────────────────────────────────────────────────

export const CAPACITY_FILL_SMS_MAX_LENGTH = 160

export interface CapacityFillMessageOpts {
  customerFirstName: string | null | undefined
  contactFirstName: string | null | undefined
  /** T.ex. offert-titel eller senaste jobbtyp — gör utskicket personligt. Null/undefined = generiskt. */
  serviceHint?: string | null
}

/**
 * Bygg SMS-text för kapacitetsfyllnad-förslaget ("vi har tider nästa vecka").
 *
 * Regler (facit-testade i tests/kapacitet-fyllnad.spec.ts):
 *   - Nämner ALDRIG en specifik veckodag — bara "nästa vecka". Kapaciteten
 *     kan fyllas innan kunden hinner svara; en veckodag i SMS:et vore en
 *     utfästelse vi inte kan hålla.
 *   - Lovar ALDRIG pris/rabatt — det här är ett samtals-öppnare, inte en
 *     offert. Prissättning sker som vanligt efter kontakt.
 *   - Vänlig, personlig, kort ton — samma andemening som
 *     buildUnopenedNudgeMessage i lib/agents/daniel/unopened-quotes.ts.
 *
 * Trunkering vid >160 tecken speglar samma strategi som
 * buildUnopenedNudgeMessage: behåll hälsning + signatur, klipp brödtexten.
 */
export function buildCapacityFillMessage(opts: CapacityFillMessageOpts): string {
  const customer = extractFirstName(opts.customerFirstName)
  const contact = extractFirstName(opts.contactFirstName)
  const serviceHint = (opts.serviceHint || '').trim()

  const greeting = customer ? `Hej ${customer}!` : 'Hej!'
  const body = serviceHint
    ? `Vi har lediga tider nästa vecka — perfekt om du vill gå vidare med ${serviceHint}. Hör av dig om det passar!`
    : `Vi har lediga tider nästa vecka. Hör av dig om du behöver hjälp med något!`
  const signature = contact ? ` Mvh ${contact}` : ''

  const full = `${greeting} ${body}${signature}`
  if (full.length <= CAPACITY_FILL_SMS_MAX_LENGTH) return full

  const overhead = greeting.length + 1 + signature.length + 1 // " " + "…"
  const bodyBudget = CAPACITY_FILL_SMS_MAX_LENGTH - overhead
  if (bodyBudget <= 0) {
    return `${greeting} ${body}`.slice(0, CAPACITY_FILL_SMS_MAX_LENGTH)
  }
  return `${greeting} ${body.slice(0, bodyBudget)}…${signature}`
}

// ─────────────────────────────────────────────────────────────────
// Kandidat-typer + rena hjälpfunktioner (testbara utan DB)
// ─────────────────────────────────────────────────────────────────

export interface UnsoldQuoteCandidate {
  quote_id: string
  customer_id: string
  customer_name: string
  customer_phone_e164: string
  title: string | null
  total_kr: number
  days_since_sent: number
}

export interface PastCustomerCandidate {
  customer_id: string
  customer_name: string
  customer_phone_e164: string
  job_type: string | null
  days_since_last_job: number
  /** kundens totala fakturerade belopp (customer.lifetime_value, se sql/v20_customer_ltv.sql) — 0 om okänt. */
  lifetime_value: number
}

export type CapacityFillCandidate =
  | ({ source: 'unsold_quote' } & UnsoldQuoteCandidate)
  | ({ source: 'past_customer' } & PastCustomerCandidate)

/** Minimal shape som isUnsoldQuoteActionable-predikatet behöver. */
export interface UnsoldQuoteRaw {
  status: string
  sent_at: string | null
}

/**
 * Predikat: är offerten en obesvarad-kandidat för kapacitetsfyllnad?
 * status sent/opened (kunden har inte tackat nej OCH inte redan accepterat)
 * OCH minst UNSOLD_QUOTE_MIN_DAYS dagar sedan den skickades — ger kunden
 * rimlig betänketid innan vi hör av oss igen med ett nytt ärende.
 */
export function isUnsoldQuoteActionable(quote: UnsoldQuoteRaw, now: number = Date.now()): boolean {
  if (!UNSOLD_QUOTE_STATUSES.has(quote.status)) return false
  const days = daysSinceSent(quote.sent_at, now)
  if (days === null) return false
  return days > UNSOLD_QUOTE_MIN_DAYS
}

/** Högst värde först — mest värt att fylla den lediga veckan med. */
export function rankUnsoldQuoteCandidates<T extends { total_kr: number }>(candidates: T[]): T[] {
  return [...candidates].sort((a, b) => b.total_kr - a.total_kr)
}

/**
 * LTV-viktad rangordning (VÅG 1d, value-chain-plan.md). Tidigare sorterades
 * bara på days_since_last_job — det fyller lediga tider men prioriterar inte
 * de mest värdefulla kunderna. Primärt: högst lifetime_value (customer.
 * lifetime_value, se sql/v20_customer_ltv.sql) — mest värt att fylla veckan
 * med en kund som spenderat mycket hos oss förut. Sekundärt (tie-break vid
 * lika/okänt LTV, t.ex. båda 0): mest inaktiva först, samma princip som
 * tidigare och som lib/agents/hanna-outbound.ts.
 */
export function rankPastCustomerCandidates<T extends { lifetime_value: number; days_since_last_job: number }>(candidates: T[]): T[] {
  return [...candidates].sort((a, b) => b.lifetime_value - a.lifetime_value || b.days_since_last_job - a.days_since_last_job)
}

/** Ta bort kandidater vars customer_id redan finns i excludeCustomerIds (dedup). */
export function excludeByCustomerId<T extends { customer_id: string }>(
  candidates: T[],
  excludeCustomerIds: Set<string>,
): T[] {
  if (excludeCustomerIds.size === 0) return candidates
  return candidates.filter(c => !excludeCustomerIds.has(c.customer_id))
}

// ─────────────────────────────────────────────────────────────────
// Per-person-medveten kapacitet (R5, tasks/resurs-masterplan.md, Etapp 8
// ur multi-employee-parity-plan.md). ADDERAS ovanpå business-aggregatet
// ovan (computeWeekCapacity/getWeekCapacity i lib/capacity/week-capacity.ts)
// — ändrar INTE thin_week-tröskeln, cron-schemat eller OM/NÄR Hanna
// föreslår kontaktkandidater. Aggregatet är fortfarande den enda
// utlösaren (se guard-returnerna i runCapacityFill nedan, oförändrade).
// Det nya är en per-medlem-beläggningsbild för SAMMA vecka, byggd på
// persondagen (lib/schedule/person-day.ts, R1) via SAMMA
// computePersonWeekUtilization som resurstavlan (R2) — ingen ny
// beräkningslogik, bara återanvänd på en ny plats. Facit-testas separat
// i tests/kapacitet-fyllnad-per-person.spec.ts (tests/kapacitet-
// fyllnad.spec.ts, som bevisar business-aggregatet är oförändrat, rörs
// inte).
// ─────────────────────────────────────────────────────────────────

export interface PersonWeekSnapshot {
  business_user_id: string
  name: string
  utilization_pct: number
  /**
   * Fas 1 (kapacitets-primitiven, tasks/vad-kan-vi-kopiera-snug-phoenix.md):
   * summan av personens bokningsbara timmar för veckan ur
   * lib/capacity/free-capacity.ts (computeFreeCapacity) — låter
   * beskrivningen säga t.ex. "Micke har 12 bokningsbara timmar nästa
   * vecka" istället för bara beläggnings-%. Frivilligt fält (bara satt av
   * computeNextWeekPersonBreakdown) så befintliga testfixturer i
   * tests/kapacitet-fyllnad-per-person.spec.ts som inte sätter fältet
   * fortsätter kompilera oförändrade.
   */
  bookable_hours?: number
}

/** Max antal namn i den textformaterade sammanfattningen (approval-
 * beskrivningen) — en lista med alla anställda vore för brytt för en rad.
 * Tunnast beläggning listas alltid först, se formatPersonUtilizationBreakdown. */
export const PERSON_BREAKDOWN_MAX_NAMES = 3

/**
 * Filtrerar fram personer vars veckobeläggning är under tröskeln — samma
 * THIN_WEEK_UTILIZATION_THRESHOLD (40%) som business-aggregatet använder
 * (medvetet samma tal, se export-kommentaren i week-capacity.ts), applicerad
 * per person istället för på hela företaget. Sorterad tunnast-först. Ren
 * funktion, ingen I/O.
 */
export function identifyThinPeople(
  people: PersonWeekSnapshot[],
  threshold: number = THIN_WEEK_UTILIZATION_THRESHOLD,
): PersonWeekSnapshot[] {
  return [...people]
    .filter((p) => p.utilization_pct < threshold)
    .sort((a, b) => a.utilization_pct - b.utilization_pct)
}

/**
 * Formaterar en kort, läsbar per-person-sammanfattning för approval-
 * beskrivningen, t.ex. "Micke 20%, Johan 35%" — visar VEM som har luckor,
 * inte bara att veckan totalt sett är tunn. Tom sträng om inga personer
 * (t.ex. inga aktiva teammedlemmar än, eller ingen under tröskeln).
 */
export function formatPersonUtilizationBreakdown(people: PersonWeekSnapshot[]): string {
  if (people.length === 0) return ''
  return [...people]
    .sort((a, b) => a.utilization_pct - b.utilization_pct)
    .slice(0, PERSON_BREAKDOWN_MAX_NAMES)
    .map((p) => `${p.name} ${p.utilization_pct}%`)
    .join(', ')
}

/**
 * I/O-wrappern: hämtar aktiva teammedlemmar + persondagen för samma vecka
 * som business-aggregatet redan beräknat (weekStart) och kör var och en
 * genom computePersonWeekUtilization. Kastar aldrig — ett DB-fel behandlas
 * som "ingen per-person-data denna körning" (tom lista), samma fail-safe-
 * hållning som resten av filen; anroparen (runCapacityFill) degraderar
 * redan tyst till aggregat-only om detta ger [].
 */
export async function computeNextWeekPersonBreakdown(
  supabase: SupabaseClient,
  businessId: string,
  weekStart: string,
): Promise<PersonWeekSnapshot[]> {
  const { data: members, error } = await supabase
    .from('business_users')
    .select('id, name')
    .eq('business_id', businessId)
    .eq('is_active', true)
  if (error || !members || members.length === 0) return []

  const weekDates = Array.from({ length: 7 }, (_, i) =>
    svDateStrPlusDays(i, new Date(`${weekStart}T12:00:00Z`)),
  )
  const memberIds = (members as { id: string; name: string | null }[]).map((m) => m.id)
  const personDays = await fetchPersonDays(supabase, businessId, memberIds, weekStart, weekDates[6])

  // Fas 1 — bookableHours per person ur SAMMA personDays som redan hämtats
  // ovan (ingen extra DB-runda). Kärnan körs en gång för hela veckan, inte
  // per medlem, samma "hämta en gång, dela ut" -mönster som utilization.
  const freeCapacity = computeFreeCapacity(personDays, memberIds, { from: weekStart, to: weekDates[6] })

  return (members as { id: string; name: string | null }[]).map((m) => {
    const util = computePersonWeekUtilization(personDays, m.id, weekDates)
    const personFree = freeCapacity.people.find((p) => p.businessUserId === m.id)
    return {
      business_user_id: m.id,
      name: m.name || 'Namnlös',
      utilization_pct: Math.round(util.utilizationPct),
      bookable_hours: personFree ? personFree.totalBookableHours : 0,
    }
  })
}

// ─────────────────────────────────────────────────────────────────
// E.164-konvertering — samma mönster som Daniel/Karin/Lisa
// (lib/agents/daniel/observation-prompt.ts ~276-285). Ännu inte
// extraherat till en delad util (fjärde kopian) — inte i scope här.
// ─────────────────────────────────────────────────────────────────

function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null
  const clean = raw.replace(/[\s\-()]/g, '')
  if (clean.startsWith('+')) return /^\+\d{8,15}$/.test(clean) ? clean : null
  if (clean.startsWith('0')) {
    const candidate = '+46' + clean.slice(1)
    return /^\+\d{8,15}$/.test(candidate) ? candidate : null
  }
  return null
}

/**
 * NÄSTA veckas måndag (YYYY-MM-DD, svensk lokaltid). Ankrar på UTC-middag
 * för denna veckans måndag (samma "säkra ankare"-teknik som safeAnchor i
 * week-capacity.ts) innan förskjutningen — undviker midnattsfällan utan
 * att duplicera den privata hjälpfunktionen.
 */
function nextWeekMonday(): string {
  const thisMonday = mondayOfWeek(svDateStr())
  return svDateStrPlusDays(7, new Date(`${thisMonday}T12:00:00Z`))
}

// ─────────────────────────────────────────────────────────────────
// DB-rader
// ─────────────────────────────────────────────────────────────────

interface QuoteRow {
  quote_id: string
  status: string
  total: number | null
  sent_at: string | null
  customer_id: string | null
  title: string | null
}

interface CustomerContactRow {
  customer_id: string
  name: string | null
  phone_number: string | null
}

interface PastCustomerRow {
  customer_id: string
  name: string | null
  phone_number: string | null
  last_job_date: string | null
  lifetime_value: number | null
}

// ─────────────────────────────────────────────────────────────────
// Public entry-point
// ─────────────────────────────────────────────────────────────────

export interface CapacityFillRunResult {
  business_id: string
  thin_week: boolean
  open_hours: number | null
  approvals_created: number
  candidates_considered: number
  skipped_reason?: 'not_configured' | 'not_thin' | 'no_candidates'
}

export async function runCapacityFill(
  supabase: SupabaseClient,
  businessId: string,
): Promise<CapacityFillRunResult> {
  const weekStart = nextWeekMonday()
  const capacity = await getWeekCapacity(supabase, businessId, weekStart)

  // Föreslå ENDAST på en verklig inställning — se fil-kommentaren högst upp.
  if (!capacity.configured) {
    return {
      business_id: businessId,
      thin_week: false,
      open_hours: null,
      approvals_created: 0,
      candidates_considered: 0,
      skipped_reason: 'not_configured',
    }
  }
  if (capacity.thin_week !== true) {
    return {
      business_id: businessId,
      thin_week: false,
      open_hours: capacity.open_hours,
      approvals_created: 0,
      candidates_considered: 0,
      skipped_reason: 'not_thin',
    }
  }

  const now = Date.now()

  const { data: bizConfig } = await supabase
    .from('business_config')
    .select('contact_name')
    .eq('business_id', businessId)
    .maybeSingle()
  const contactFirstName = extractFirstName(bizConfig?.contact_name) || null

  // ── 1. Obesvarade offerter (högst värde först) ──────────────────
  const { data: quotesData } = await supabase
    .from('quotes')
    .select('quote_id, status, total, sent_at, customer_id, title')
    .eq('business_id', businessId)
    .in('status', ['sent', 'opened'])
    .not('sent_at', 'is', null)
    .order('total', { ascending: false })
    .limit(QUOTE_POOL)

  const quoteRows = (quotesData || []) as QuoteRow[]
  const actionableQuotes = quoteRows.filter(q => isUnsoldQuoteActionable(q, now))

  const quoteCustomerIds = Array.from(
    new Set(actionableQuotes.map(q => q.customer_id).filter((id): id is string => !!id)),
  )
  const customerPhoneMap: Record<string, string> = {}
  const customerNameMap: Record<string, string> = {}
  if (quoteCustomerIds.length > 0) {
    const { data: custs } = await supabase
      .from('customer')
      .select('customer_id, name, phone_number')
      .in('customer_id', quoteCustomerIds)
      .eq('business_id', businessId)
    for (const c of (custs || []) as CustomerContactRow[]) {
      if (c.phone_number) customerPhoneMap[c.customer_id] = c.phone_number
      customerNameMap[c.customer_id] = c.name || ''
    }
  }

  const unsoldQuoteCandidates: UnsoldQuoteCandidate[] = actionableQuotes
    .map(q => {
      if (!q.customer_id) return null
      const phoneE164 = toE164(customerPhoneMap[q.customer_id])
      if (!phoneE164) return null
      const days = daysSinceSent(q.sent_at, now)
      if (days === null) return null
      return {
        quote_id: q.quote_id,
        customer_id: q.customer_id,
        customer_name: customerNameMap[q.customer_id] || '',
        customer_phone_e164: phoneE164,
        title: q.title,
        total_kr: Math.round(Number(q.total || 0)),
        days_since_sent: days,
      }
    })
    .filter((x): x is UnsoldQuoteCandidate => x !== null)

  const rankedQuotes = rankUnsoldQuoteCandidates(unsoldQuoteCandidates)

  // ── 2. Dedup — kund med NÅGOT förslag senaste DEDUP_WINDOW_DAYS ──
  // Mirrorar Daniels breda konflikt-avoidance (observation-prompt.ts
  // ~373-404): letar inte bara efter 'capacity_fill'-förslag, en kund som
  // just fått ETT annat SMS-förslag ska inte bombarderas med ännu ett.
  const dedupWindowStart = new Date(now - DEDUP_WINDOW_DAYS * 24 * 3600_000).toISOString()
  const { data: recentApprovals } = await supabase
    .from('pending_approvals')
    .select('payload')
    .eq('business_id', businessId)
    .gte('created_at', dedupWindowStart)
    .limit(500)
  const excludeCustomerIds = new Set<string>()
  for (const row of recentApprovals || []) {
    const cid = (row.payload as Record<string, unknown> | null)?.customer_id
    if (cid) excludeCustomerIds.add(String(cid))
  }

  let candidates: CapacityFillCandidate[] = excludeByCustomerId(rankedQuotes, excludeCustomerIds).map(
    c => ({ source: 'unsold_quote' as const, ...c }),
  )

  // ── 3. Om färre än MAX: fyll på med tidigare kunder ──────────────
  if (candidates.length < MAX_CANDIDATES_PER_BUSINESS) {
    const cutoffIso = new Date(now - PAST_CUSTOMER_INACTIVE_DAYS * 24 * 3600_000).toISOString()
    const { data: custData } = await supabase
      .from('customer')
      .select('customer_id, name, phone_number, last_job_date, lifetime_value')
      .eq('business_id', businessId)
      .not('last_job_date', 'is', null)
      .lte('last_job_date', cutoffIso)
      .not('phone_number', 'is', null)
      .order('last_job_date', { ascending: true })
      .limit(CUSTOMER_POOL)

    const alreadyPicked = new Set(candidates.map(c => c.customer_id))

    const pastCustomerCandidatesRaw: PastCustomerCandidate[] = ((custData || []) as PastCustomerRow[])
      .filter(c => !alreadyPicked.has(c.customer_id))
      .map((c): PastCustomerCandidate | null => {
        const phoneE164 = toE164(c.phone_number)
        if (!phoneE164) return null
        return {
          customer_id: c.customer_id,
          customer_name: c.name || '',
          customer_phone_e164: phoneE164,
          job_type: null, // fylls i per-vald-kandidat nedan, inte för hela poolen
          days_since_last_job: Math.floor(
            (now - new Date(c.last_job_date as string).getTime()) / 86400000,
          ),
          lifetime_value: Number(c.lifetime_value) || 0,
        }
      })
      .filter((x): x is PastCustomerCandidate => x !== null)

    const rankedPastCustomers = excludeByCustomerId(
      rankPastCustomerCandidates(pastCustomerCandidatesRaw),
      excludeCustomerIds,
    )

    const needed = MAX_CANDIDATES_PER_BUSINESS - candidates.length
    const pickedPastCustomers = rankedPastCustomers.slice(0, needed)

    // Skräddarsy senaste jobbtyp — samma query som lib/agents/hanna-outbound.ts,
    // men bara för de faktiskt valda kandidaterna (inte hela poolen).
    for (const pc of pickedPastCustomers) {
      try {
        const { data: proj } = await supabase
          .from('project')
          .select('job_type')
          .eq('business_id', businessId)
          .eq('customer_id', pc.customer_id)
          .not('job_type', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        pc.job_type = (proj?.job_type as string) || null
      } catch {
        // Generiskt meddelande om senaste jobbtyp är okänd.
      }
    }

    candidates = candidates.concat(
      pickedPastCustomers.map(c => ({ source: 'past_customer' as const, ...c })),
    )
  }

  candidates = candidates.slice(0, MAX_CANDIDATES_PER_BUSINESS)

  if (candidates.length === 0) {
    return {
      business_id: businessId,
      thin_week: true,
      open_hours: capacity.open_hours,
      approvals_created: 0,
      candidates_considered: 0,
      skipped_reason: 'no_candidates',
    }
  }

  // ── 3b. Per-person-beläggning för SAMMA vecka (R5) — ADDERAS till
  // beskrivningen/payloaden nedan, ändrar INGET av ovanstående (candidates,
  // thin_week-avgörandet skedde redan på aggregatet). Körs bara här (inte
  // tidigare i funktionen) så vi inte gör en extra DB-runda i de fall som
  // redan avslutats ovan (not_configured/not_thin/no_candidates).
  let personBreakdownText = ''
  let thinPeopleForPayload: PersonWeekSnapshot[] = []
  try {
    const personBreakdown = await computeNextWeekPersonBreakdown(supabase, businessId, weekStart)
    thinPeopleForPayload = identifyThinPeople(personBreakdown)
    personBreakdownText = formatPersonUtilizationBreakdown(thinPeopleForPayload)
  } catch (err: any) {
    console.error('[kapacitet-fyllnad] per-person-beläggning misslyckades, degraderar till aggregat-only:', businessId, err?.message || String(err))
  }

  // ── 4. Skapa ETT pending_approval per kandidat ───────────────────
  let approvalsCreated = 0
  for (const c of candidates) {
    // VP1 (gap 9, tasks/vilande-pengar-masterplan.md): gemensamt frekvenstak
    // ovanpå denna funktions egna DEDUP_WINDOW_DAYS-spärr — hindrar att
    // kunden också fick ett kort från hanna-outbound/avtal-forslag/
    // kundbas-svep samma vecka.
    const freq = await canContactCustomer(supabase, businessId, c.customer_id)
    if (!freq.allowed) continue

    const serviceHint = c.source === 'unsold_quote' ? c.title : c.job_type
    const message = buildCapacityFillMessage({
      customerFirstName: c.customer_name,
      contactFirstName,
      serviceHint,
    })
    const customerLabel = c.customer_name || 'kund'

    const { error } = await supabase.from('pending_approvals').insert({
      business_id: businessId,
      approval_type: 'send_sms',
      title: `Fyll nästa vecka — ${customerLabel}`,
      description:
        `Nästa vecka har ${capacity.open_hours ?? '?'} lediga timmar. ` +
        `Hanna föreslår att höra av sig till ${customerLabel} om ledig tid.` +
        // R5 (tasks/resurs-masterplan.md) — vem som har luckor, inte bara
        // att veckan är tunn. Bara internt (owner/admin, denna beskrivning
        // syns aldrig i kundens SMS ovan).
        (personBreakdownText ? ` (${personBreakdownText})` : ''),
      status: 'pending',
      risk_level: 'low',
      payload: {
        to: c.customer_phone_e164,
        message,
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        routed_agent: 'hanna',
        trigger: 'capacity_fill',
        ...(c.source === 'unsold_quote' ? { quote_id: c.quote_id, related_id: c.quote_id } : {}),
        // R5 — per-person-beläggning, tom lista om inga aktiva medlemmar är
        // under tröskeln (eller om beräkningen degraderade, se ovan).
        ...(thinPeopleForPayload.length > 0 ? { person_breakdown: thinPeopleForPayload } : {}),
      },
    })
    if (!error) {
      approvalsCreated++
    } else {
      console.error('[kapacitet-fyllnad] approval insert error:', {
        business_id: businessId,
        customer_id: c.customer_id,
        error: error.message,
      })
    }
  }

  return {
    business_id: businessId,
    thin_week: true,
    open_hours: capacity.open_hours,
    approvals_created: approvalsCreated,
    candidates_considered: candidates.length,
  }
}
