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
 *      telefon) — samma datadisciplin som lib/agents/hanna-outbound.ts
 *      (mest inaktiva först, per-kandidat senaste job_type för personlig ton).
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
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { svDateStr, svDateStrPlusDays } from '@/lib/dates'
import { getWeekCapacity, mondayOfWeek } from '@/lib/capacity/week-capacity'
import { daysSinceSent, extractFirstName } from '@/lib/agents/daniel/unopened-quotes'

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

/** Mest inaktiva först (samma prioritering som lib/agents/hanna-outbound.ts). */
export function rankPastCustomerCandidates<T extends { days_since_last_job: number }>(candidates: T[]): T[] {
  return [...candidates].sort((a, b) => b.days_since_last_job - a.days_since_last_job)
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
      .select('customer_id, name, phone_number, last_job_date')
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

  // ── 4. Skapa ETT pending_approval per kandidat ───────────────────
  let approvalsCreated = 0
  for (const c of candidates) {
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
        `Hanna föreslår att höra av sig till ${customerLabel} om ledig tid.`,
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
