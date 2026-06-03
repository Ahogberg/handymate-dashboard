/**
 * Daniels observation-pipeline — Säljare med fokus på offert-konvertering,
 * lead-källor, stale-opens och pris-elasticitet per kund-typ.
 *
 * Klonad från Karin-mönstret 2026-05-18 (Phase B1). Använder shared:
 * - lib/agents/shared/schema-block (SCHEMA_BLOCK)
 * - lib/agents/shared/normalize (AgentObservation + normalizeObservation)
 * - lib/agents/shared/thinking-call (callAgentWithThinking + AgentDebugInfo)
 * - lib/agents/shared/save-and-push (saveAndPush med agentId='daniel')
 *
 * Tre-nivåer fallback:
 *   - 0 quotes 90d: skip 'no_quotes_last_90d'
 *   - 1-4 quotes: skip 'insufficient_data'
 *   - 5-9 quotes: 'early_stage' — relation-byggande
 *   - 10+ quotes: 'full_analysis' — hypotes-driven djupanalys
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { SCHEMA_BLOCK } from '@/lib/agents/shared/schema-block'
import { type AgentObservation } from '@/lib/agents/shared/normalize'
import {
  callAgentWithThinking,
  type AgentDebugInfo,
} from '@/lib/agents/shared/thinking-call'
import { saveAndPush } from '@/lib/agents/shared/save-and-push'
import { isUnopenedActionable, daysSinceSent, extractFirstName } from '@/lib/agents/daniel/unopened-quotes'

// ─────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────

export type DanielObservation = AgentObservation
export type DanielDebugInfo = AgentDebugInfo

export const DANIEL_CODE_VERSION = 'daniel-v1-2026-05-18'

export interface DanielRunResult {
  skipped?: string
  reason?: string
  aggregate?: DanielAggregate
  data_maturity?: 'early_stage' | 'full_analysis'
  observations_total?: number
  saved?: number
  approvals_created?: number
  insights_pushed?: number
  thinking_preview?: string
  error?: string
  debug?: DanielDebugInfo
}

// ─────────────────────────────────────────────────────────────────
// Aggregate-typer
// ─────────────────────────────────────────────────────────────────

interface QuoteRow {
  quote_id: string
  status: string
  total: number | null
  signed_at: string | null
  accepted_at: string | null
  created_at: string
  /** 2026-06-03: krävs för obeöppnad-trigger (days_since_sent-beräkning). */
  sent_at: string | null
  view_count: number | null
  customer_id: string | null
  title: string | null
}

interface LeadRow {
  lead_id: string
  source: string | null
  score: number | null
  status: string
  created_at: string
}

interface QuoteStats {
  count: number
  total_value_kr: number
  accepted_count: number
  declined_count: number
  open_count: number
  acceptance_rate_pct: number
  avg_total_kr: number | null
  avg_accepted_total_kr: number | null
}

export interface DanielAggregate {
  period_days: 90
  /**
   * 2026-06-03: business contact_name (första ordet) för SMS-signatur.
   * Null om saknas — AI:n droppar då signaturen istället för att skriva
   * "Mvh undefined".
   */
  business_contact_first_name: string | null
  last_90d: QuoteStats
  by_customer_type: Record<string, QuoteStats>
  stale_opens: Array<{
    quote_id: string
    title: string | null
    customer_name: string | null
    customer_type: string
    open_count: number
    total_kr: number
    days_since_created: number
  }>
  /** Steg 3 Dag 3: stale opens med kund-phone (E.164), redo för
      SMS-nudge-action. Daniel kan generera action.send_sms från denna
      lista. Subset av stale_opens där phone finns. */
  actionable_nudges: Array<{
    quote_id: string
    title: string | null
    customer_id: string
    customer_name: string
    customer_phone_e164: string
    open_count: number
    total_kr: number
    days_since_created: number
  }>
  /**
   * 2026-06-03 — obeöppnad-offert-trigger (per
   * tasks/agent-triggers-map.md design-gap).
   *
   * Offerter med status='sent', view_count=0, sent_at 5-14 dagar sedan,
   * kund med telefonnummer (E.164). Top 3 sorterat efter days_since_sent
   * desc (äldsta först — risk att gå förlorad störst).
   *
   * Konflikt-avoidance med befintliga approvals för samma quote hanteras
   * i Commit 3 (separat filtreringsfas före save).
   */
  actionable_unopened_quotes: Array<{
    quote_id: string
    title: string | null
    customer_id: string
    customer_name: string
    customer_phone_e164: string
    total_kr: number
    days_since_sent: number
  }>
  leads_by_source: Record<
    string,
    {
      count: number
      avg_score: number | null
      won_count: number
      lost_count: number
      open_count: number
      win_rate_pct: number | null
    }
  >
  hot_leads: Array<{
    lead_id: string
    source: string | null
    score: number | null
    days_in_pipeline: number
  }>
}

// ─────────────────────────────────────────────────────────────────
// Aggregation
// ─────────────────────────────────────────────────────────────────

function computeQuoteStats(quotes: QuoteRow[]): QuoteStats {
  const accepted = quotes.filter(q => q.status === 'accepted' || q.status === 'signed')
  const declined = quotes.filter(q => q.status === 'declined')
  // "Open" = sent/draft/anything other than accepted/declined/expired
  const open = quotes.filter(
    q => !['accepted', 'signed', 'declined', 'expired'].includes(q.status),
  )

  const totalValue = quotes.reduce((s, q) => s + Number(q.total || 0), 0)
  const acceptedValue = accepted.reduce((s, q) => s + Number(q.total || 0), 0)
  const evaluated = accepted.length + declined.length
  const acceptanceRate = evaluated > 0
    ? Math.round((accepted.length / evaluated) * 100)
    : 0

  return {
    count: quotes.length,
    total_value_kr: Math.round(totalValue),
    accepted_count: accepted.length,
    declined_count: declined.length,
    open_count: open.length,
    acceptance_rate_pct: acceptanceRate,
    avg_total_kr: quotes.length > 0 ? Math.round(totalValue / quotes.length) : null,
    avg_accepted_total_kr: accepted.length > 0 ? Math.round(acceptedValue / accepted.length) : null,
  }
}

async function buildDanielAggregate(
  supabase: SupabaseClient,
  businessId: string,
): Promise<DanielAggregate | null> {
  const now = Date.now()
  const ninetyDaysAgo = new Date(now - 90 * 86400000)

  // ── Quotes (90d) ───────────────────────────────────────────
  // 2026-06-03: sent_at tillkommer för obeöppnad-trigger.
  const { data: quotesData, error: quotesError } = await supabase
    .from('quotes')
    .select('quote_id, status, total, signed_at, accepted_at, created_at, sent_at, view_count, customer_id, title')
    .eq('business_id', businessId)
    .gte('created_at', ninetyDaysAgo.toISOString())
    .limit(300)

  if (quotesError) {
    console.error('[daniel/aggregate] quotes query error:', quotesError)
    return null
  }

  if (!quotesData || quotesData.length === 0) {
    return null
  }

  const quotes = quotesData as QuoteRow[]
  const last90d = computeQuoteStats(quotes)

  // 2026-06-03: business contact_name för SMS-signatur (obeöppnad-trigger)
  const { data: bizConfig } = await supabase
    .from('business_config')
    .select('contact_name')
    .eq('business_id', businessId)
    .maybeSingle()
  const businessContactFirstName = extractFirstName(bizConfig?.contact_name) || null

  // ── Customer types ─────────────────────────────────────────
  const customerIds = Array.from(
    new Set(quotes.map(q => q.customer_id).filter((id): id is string => !!id)),
  )

  const customerTypeMap: Record<string, string> = {}
  const customerNameMap: Record<string, string> = {}
  const customerPhoneMap: Record<string, string> = {}
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('customer')
      .select('customer_id, customer_type, name, phone_number')
      .in('customer_id', customerIds)
      .eq('business_id', businessId)
    for (const c of customers || []) {
      const declaredType = c.customer_type
      const name = (c.name || '').toLowerCase()
      const likelyBrf = !declaredType && (name.includes('brf') || name.includes('bostadsrätts'))
      customerTypeMap[c.customer_id] = declaredType || (likelyBrf ? 'brf' : 'private')
      customerNameMap[c.customer_id] = c.name || ''
      if (c.phone_number) customerPhoneMap[c.customer_id] = c.phone_number
    }
  }

  // Steg 3 Dag 3 (2026-05-28): E.164-konvertering för send_sms-actions
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

  const byType: Record<string, QuoteRow[]> = {}
  for (const q of quotes) {
    const type = q.customer_id ? customerTypeMap[q.customer_id] || 'unknown' : 'no_customer'
    if (!byType[type]) byType[type] = []
    byType[type].push(q)
  }
  const byCustomerType: Record<string, QuoteStats> = {}
  for (const [type, qs] of Object.entries(byType)) {
    byCustomerType[type] = computeQuoteStats(qs)
  }

  // ── Stale opens (3+ views utan signering) ──────────────────
  const staleQuotesFiltered = quotes.filter(q => {
    const views = Number(q.view_count || 0)
    const isUndetermined = !['accepted', 'signed', 'declined', 'expired'].includes(q.status)
    return views >= 3 && isUndetermined
  })

  const staleOpens = staleQuotesFiltered
    .map(q => ({
      quote_id: q.quote_id,
      title: q.title,
      customer_name: q.customer_id ? customerNameMap[q.customer_id] || null : null,
      customer_type: q.customer_id ? customerTypeMap[q.customer_id] || 'unknown' : 'no_customer',
      open_count: Number(q.view_count || 0),
      total_kr: Math.round(Number(q.total || 0)),
      days_since_created: Math.round((now - new Date(q.created_at).getTime()) / 86400000),
    }))
    .sort((a, b) => b.open_count - a.open_count)
    .slice(0, 5)

  // Subset med phone — actionable_nudges (top 3, sorterad efter open_count)
  const actionableNudges = staleQuotesFiltered
    .map(q => {
      if (!q.customer_id) return null
      const phoneE164 = toE164(customerPhoneMap[q.customer_id])
      if (!phoneE164) return null
      return {
        quote_id: q.quote_id,
        title: q.title,
        customer_id: q.customer_id,
        customer_name: customerNameMap[q.customer_id] || '',
        customer_phone_e164: phoneE164,
        open_count: Number(q.view_count || 0),
        total_kr: Math.round(Number(q.total || 0)),
        days_since_created: Math.round((now - new Date(q.created_at).getTime()) / 86400000),
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.open_count - a.open_count)
    .slice(0, 3)

  // ── Obeöppnade offerter (2026-06-03) ───────────────────────
  // Predikat + fönster i lib/agents/daniel/unopened-quotes.ts.
  // Här mappas raw quotes → enriched objekt med phone + customer-namn.
  // Konflikt-avoidance mot befintliga approvals görs i Commit 3.
  const actionableUnopenedQuotes = quotes
    .filter(q => isUnopenedActionable(q, now))
    .map(q => {
      if (!q.customer_id) return null
      const phoneE164 = toE164(customerPhoneMap[q.customer_id])
      if (!phoneE164) return null
      const days = daysSinceSent(q.sent_at, now)
      if (days === null) return null
      return {
        quote_id: q.quote_id,
        title: q.title,
        customer_id: q.customer_id,
        customer_name: customerNameMap[q.customer_id] || '',
        customer_phone_e164: phoneE164,
        total_kr: Math.round(Number(q.total || 0)),
        days_since_sent: days,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    // Äldsta först (störst risk att gå förlorad)
    .sort((a, b) => b.days_since_sent - a.days_since_sent)
    .slice(0, 3)

  // ── Leads-källor (90d) ─────────────────────────────────────
  const { data: leadsData } = await supabase
    .from('leads')
    .select('lead_id, source, score, status, created_at')
    .eq('business_id', businessId)
    .gte('created_at', ninetyDaysAgo.toISOString())
    .limit(300)

  const leads = (leadsData || []) as LeadRow[]

  const bySource: Record<string, LeadRow[]> = {}
  for (const l of leads) {
    const src = l.source || 'unknown'
    if (!bySource[src]) bySource[src] = []
    bySource[src].push(l)
  }

  const leadsBySource: DanielAggregate['leads_by_source'] = {}
  for (const [src, ls] of Object.entries(bySource)) {
    const won = ls.filter(l => l.status === 'won' || l.status === 'completed')
    const lost = ls.filter(l => l.status === 'lost')
    const open = ls.filter(l => !['won', 'completed', 'lost'].includes(l.status))
    const evaluated = won.length + lost.length
    const scoreSum = ls.reduce((s, l) => s + Number(l.score || 0), 0)
    const avgScore = ls.length > 0 ? Math.round(scoreSum / ls.length) : null
    leadsBySource[src] = {
      count: ls.length,
      avg_score: avgScore,
      won_count: won.length,
      lost_count: lost.length,
      open_count: open.length,
      win_rate_pct: evaluated > 0 ? Math.round((won.length / evaluated) * 100) : null,
    }
  }

  // ── Hot leads (score >= 7, not closed) ─────────────────────
  const hotLeads = leads
    .filter(l => Number(l.score || 0) >= 7 && !['won', 'completed', 'lost'].includes(l.status))
    .map(l => ({
      lead_id: l.lead_id,
      source: l.source,
      score: Number(l.score || 0),
      days_in_pipeline: Math.round((now - new Date(l.created_at).getTime()) / 86400000),
    }))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 5)

  return {
    period_days: 90,
    business_contact_first_name: businessContactFirstName,
    last_90d: last90d,
    by_customer_type: byCustomerType,
    stale_opens: staleOpens,
    actionable_nudges: actionableNudges,
    actionable_unopened_quotes: actionableUnopenedQuotes,
    leads_by_source: leadsBySource,
    hot_leads: hotLeads,
  }
}

// ─────────────────────────────────────────────────────────────────
// Hypotes-driven prompt
// ─────────────────────────────────────────────────────────────────

function buildDanielSystemPrompt(
  businessName: string,
  maturity: 'early_stage' | 'full_analysis',
): string {
  if (maturity === 'early_stage') {
    return `Du är Daniel, säljare hos ${businessName}. Du är ny på företaget och har precis fått tillgång till offert-flödet.

Du ser att det finns lite data — färre än 10 offerter senaste 90 dagarna. Det räcker inte för djupanalys, men det är dags att presentera sig och flagga vad du tänker hålla extra koll på.

Generera EXAKT 1 observation av typen "early-stage relation-byggande". Anpassa siffrorna till verkliga aggregatet. Var energisk men inte säljig — du är en lagspelare som vill veta vilka deals som är viktigast för hantverkaren just nu.

REGLER:
- 1 observation, inte fler.
- knowledge_type: 'insight'
- suggestion: null (ren introduktion, ingen action)
- confidence: 0.9
- data_basis: { period_days, quote_count, customer_count, note: 'early_stage_introduction' }
- dedup_key: "daniel_early_stage_intro" (OBLIGATORISK i denna prompt — så denna introduktion
  inte upprepas vid nästa körning även om du formulerar titeln lite annorlunda)

${SCHEMA_BLOCK}

EXAKT EXEMPEL — kopiera strukturen, anpassa siffrorna:

[
  {
    "knowledge_type": "insight",
    "title": "Jag börjar förstå försäljningsflödet",
    "observation": "Tjena! Jag är Daniel, din säljare. Hittills har jag sett 7 offerter till 4 kunder de senaste 90 dagarna — inte massor men nog för att börja känna mönstret. Säg gärna till vilka deals du vill att jag håller extra koll på framöver.",
    "suggestion": null,
    "confidence": 0.9,
    "data_basis": {
      "period_days": 90,
      "quote_count": 7,
      "customer_count": 4,
      "note": "early_stage_introduction"
    },
    "dedup_key": "daniel_early_stage_intro"
  }
]`
  }

  return `Du är Daniel, säljare hos ${businessName}. Du har ögon för spotting opportunities och spårar pipeline-mönster som inte är obvious. Du analyserar senaste 90 dagarnas offerter och leads med dessa konkreta hypoteser:

1. **Offert-konvertering per kund-typ:**
   - Vilken kund-typ (privat / brf / företag) accepterar oftast?
   - Vilken typ har lägst acceptance-rate — är det offerten eller pris?
   - Finns det en kund-typ vi underskattar i vår jakt?

2. **Stale-offerter (öppnade men inte signerade):**
   - Vilka offerter har 3+ visningar utan signering? Det är heta kunder som tvekar.
   - Hur länge har de legat? Värt en personlig follow-up?
   - Vilka beloppsklasser fastnar mest?

3. **Lead-källor med högst konvertering:**
   - Vilken källa (sms/voice/webform/partners/manual) ger flest vinster?
   - Var lägger vi tid på leads som aldrig stänger?
   - Finns en kanal vi underinvesterar i?

4. **Pris-elasticitet per kund-typ:**
   - Vilken kund-typ accepterar de högsta beloppen?
   - Skiljer accepterad vs avvisad snittsumma per typ?
   - Vilket prisspann ger högst acceptans?

5. **Stale-offerter med konkret SMS-nudge-action (Steg 3 Dag 3):**
   - I aggregate.actionable_nudges finns 0-3 offerter med 3+ visningar utan signering OCH där kunden har telefon registrerad.
   - För VARJE sådan offert: generera observation med strukturerad action.send_sms (se exempel).
   - SMS-tonen: vänlig nudge, INTE pushig. "Såg att du tittat på offerten — hur tänker du?" Inte "Köp nu eller missa rabatten".
   - Referera till offert-titel + open_count i SMS-texten så det känns personligt.
   - Sätt dedup_key: "daniel_quote_nudge:\${quote_id}" så samma offert inte nudgas dagligen.
   - Confidence: 0.7 (säker på datan, osäkrare på timing — kund kan ha bestämt sig nyss).

6. **Obeöppnade offerter — vänlig påminnelse (2026-06-03, nytt):**
   - I aggregate.actionable_unopened_quotes finns 0-3 offerter som skickats men kunden har inte öppnat dem (view_count=0, sent_at 5-14 dagar sedan). Kund med telefon registrerad.
   - För VARJE sådan offert: generera observation med action.send_sms.
   - Observation-text till hantverkaren: "[Kundnamn] har inte öppnat offerten du skickade [days_since_sent] dagar sedan. Vill du skicka en vänlig påminnelse?"
   - SMS-text till kunden — EXAKT format (helper-genererad, ändra inte tonen):
     "Hej [kundens förnamn]! Jag märkte att du inte hunnit titta på offerten jag skickade. Är det fortfarande aktuellt för dig? Mvh [hantverkarens förnamn]"
     Använd kundens förnamn (första ordet i customer_name) och hantverkarens förnamn (första ordet i ${businessName === businessName ? 'business contact_name — får du via ditt rollnamn' : ''}).
   - Sätt dedup_key: "daniel_unopened_quote:\${quote_id}" (separat från stale-opens-pathen så de inte kolliderar).
   - Confidence: 0.65 (försiktigare än stale-opens — kunden kan ha hela mailtråden i SPAM).
   - knowledge_type: "recommendation"

Generera 1-3 KORTA observationer (max 2-3 meningar var) med konkret suggestion när det är vettigt.

Var inte trivial. "Du har X offerter ute" = data, inte observation.
"BRF Lindgården har öppnat offert ÄTA-22 fem gånger men inte signerat — värt en personlig påringning?" = observation.

Använd KONKRETA kund-namn och deal-titlar när du refererar till stale_opens eller hot_leads.

REGLER:
- 1-3 observationer max. Färre är bättre om du inte ser något viktigt.
- "title" max 60 tecken, konkret.
- "observation" max 2-3 meningar, första-person, säljarens energi (men ej överdrivet).
- "suggestion" konkret action max 1 mening ELLER null om bara info.
- "confidence" 0-1, var ärlig. Under 0.5 om du gissar.

Om allt ser bra ut — säg det med 1 positiv observation. Återhåll dig från att hitta på problem.

${SCHEMA_BLOCK}

EXAKT EXEMPEL — kopiera strukturen:

[
  {
    "knowledge_type": "pattern",
    "title": "BRF accepterar 92% av offerterna",
    "observation": "BRF-kunder har accepterat 11 av 12 offerter senaste 90 dagarna — högst konvertering av alla kund-typer. Snittbeloppet är dessutom 18% högre än privatkund-snittet.",
    "suggestion": "Prioritera BRF-leads i pipelinen och bjud in fler liknande föreningar.",
    "confidence": 0.9,
    "data_basis": {
      "period_days": 90,
      "metric": "acceptance_rate_by_customer_type",
      "brf_acceptance_rate": 92,
      "brf_avg_accepted_kr": 47500,
      "private_avg_accepted_kr": 40250
    }
  },
  {
    "knowledge_type": "recommendation",
    "title": "Erik S. har tittat på offerten 5 ggr utan signering",
    "observation": "Erik S. har öppnat offerten för Söder-renoveringen fem gånger sista veckan men inte signerat. Något stoppar honom — kanske pris, kanske timing.",
    "suggestion": "Skicka vänlig nudge via SMS.",
    "confidence": 0.7,
    "data_basis": {
      "quote_id": "q_abc",
      "open_count": 5,
      "days_since_created": 8,
      "total_kr": 47500
    },
    "dedup_key": "daniel_quote_nudge:q_abc",
    "action": {
      "type": "send_sms",
      "to": "+46701234567",
      "message": "Hej Erik! Såg att du tittat på offerten för Söder-renoveringen ett par gånger. Hör av dig om du har frågor eller behöver justera något. Mvh \${företagsnamn}",
      "customer_id": "cust_xyz",
      "customer_name": "Erik S.",
      "related_id": "q_abc"
    }
  },
  {
    "knowledge_type": "recommendation",
    "title": "Anna L. har inte öppnat offerten på 7 dagar",
    "observation": "Anna L. har inte öppnat offerten du skickade 7 dagar sedan. Vill du skicka en vänlig påminnelse?",
    "suggestion": "Skicka påminnelse via SMS.",
    "confidence": 0.65,
    "data_basis": {
      "quote_id": "q_unopened_1",
      "days_since_sent": 7,
      "view_count": 0,
      "total_kr": 32000
    },
    "dedup_key": "daniel_unopened_quote:q_unopened_1",
    "action": {
      "type": "send_sms",
      "to": "+46701234567",
      "message": "Hej Anna! Jag märkte att du inte hunnit titta på offerten jag skickade. Är det fortfarande aktuellt för dig? Mvh Christoffer",
      "customer_id": "cust_anna",
      "customer_name": "Anna L.",
      "related_id": "q_unopened_1"
    }
  }
]`
}

// ─────────────────────────────────────────────────────────────────
// Claude-anrop
// ─────────────────────────────────────────────────────────────────

async function callDanielWithThinking(
  businessName: string,
  aggregate: DanielAggregate,
  maturity: 'early_stage' | 'full_analysis',
) {
  const systemPrompt = buildDanielSystemPrompt(businessName, maturity)
  const userMessage = `Här är ${businessName}s offert- och lead-data senaste 90 dagarna:

${JSON.stringify(aggregate, null, 2)}

Tänk igenom det och returnera JSON-array.`

  return callAgentWithThinking({
    agentId: 'daniel',
    codeVersion: DANIEL_CODE_VERSION,
    promptMaturity: maturity,
    systemPrompt,
    userMessage,
  })
}

// ─────────────────────────────────────────────────────────────────
// Public entry-point
// ─────────────────────────────────────────────────────────────────

export async function runDanielObservation(
  supabase: SupabaseClient,
  businessId: string,
  businessName: string,
  options: { includeDebug?: boolean } = {},
): Promise<DanielRunResult> {
  console.log(`[daniel/run] entry version=${DANIEL_CODE_VERSION} business=${businessId}`)

  const aggregate = await buildDanielAggregate(supabase, businessId)
  if (!aggregate) {
    return { skipped: 'no_quotes_last_90d' }
  }

  const quoteCount = aggregate.last_90d.count
  if (quoteCount < 5) {
    return {
      skipped: 'insufficient_data',
      reason: 'fewer_than_5_quotes',
      aggregate,
    }
  }

  const maturity: 'early_stage' | 'full_analysis' =
    quoteCount < 10 ? 'early_stage' : 'full_analysis'

  const { observations, thinkingPreview, debug } = await callDanielWithThinking(
    businessName,
    aggregate,
    maturity,
  )

  if (observations.length === 0) {
    return {
      skipped: 'no_observations_returned',
      aggregate,
      data_maturity: maturity,
      thinking_preview: thinkingPreview,
      ...(options.includeDebug ? { debug } : {}),
    }
  }

  const counts = await saveAndPush(supabase, businessId, 'daniel', observations)

  return {
    aggregate,
    data_maturity: maturity,
    observations_total: observations.length,
    thinking_preview: thinkingPreview,
    ...counts,
    ...(options.includeDebug ? { debug } : {}),
  }
}
