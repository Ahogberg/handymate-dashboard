/**
 * Lisas observation-pipeline — Kundservice-agent som dagligen
 * sammanfattar obesvarade kund-SMS och föreslår vänliga svar.
 *
 * Skapad 2026-05-29 (Steg 3 Dag 5a). Använder shared:
 * - lib/agents/shared/schema-block (SCHEMA_BLOCK)
 * - lib/agents/shared/normalize (AgentObservation)
 * - lib/agents/shared/thinking-call (callAgentWithThinking)
 * - lib/agents/shared/save-and-push (saveAndPush med agentId='lisa')
 *
 * Logik:
 *   1. Läs alla inbound SMS senaste 7d (sms_log direction='inbound')
 *   2. Per phone_from: kolla om någon outbound skickats efter senaste
 *      inbound. Om nej → "obesvarad".
 *   3. Top 3 obesvarade (äldsta först) → aggregat → Lisa föreslår svar.
 *   4. Lisa returnerar observation med action.send_sms (utkast).
 *
 * Skip-fall:
 *   - 0 inbound 7d: 'no_inbound_last_7d'
 *   - alla besvarade: positiv observation utan action
 *   - 1+ obesvarade: full analysis
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { SCHEMA_BLOCK } from '@/lib/agents/shared/schema-block'
import { type AgentObservation } from '@/lib/agents/shared/normalize'
import {
  callAgentWithThinking,
  type AgentDebugInfo,
} from '@/lib/agents/shared/thinking-call'
import { saveAndPush } from '@/lib/agents/shared/save-and-push'

// ─────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────

export type LisaObservation = AgentObservation
export type LisaDebugInfo = AgentDebugInfo

export const LISA_CODE_VERSION = 'lisa-v1-2026-05-29'

export interface LisaRunResult {
  skipped?: string
  reason?: string
  aggregate?: LisaAggregate
  observations_total?: number
  saved?: number
  approvals_created?: number
  insights_pushed?: number
  thinking_preview?: string
  error?: string
  debug?: LisaDebugInfo
}

// ─────────────────────────────────────────────────────────────────
// Aggregate-typer
// ─────────────────────────────────────────────────────────────────

interface SmsRow {
  sms_id: string
  business_id: string
  customer_id: string | null
  direction: string
  phone_from: string | null
  phone_to: string | null
  message: string | null
  created_at: string
}

export interface LisaAggregate {
  period_days: 7
  inbound_count: number
  outbound_count: number
  unanswered_count: number
  /** Top 3 obesvarade kund-SMS (äldsta först — där "tystnaden" är mest
      pinsam). Lisa föreslår svar för varje. */
  actionable_unanswered: Array<{
    phone_from_e164: string
    customer_id: string | null
    customer_name: string
    last_inbound_message: string
    days_since_inbound: number
    inbound_count_from_phone: number
  }>
}

// ─────────────────────────────────────────────────────────────────
// Aggregation
// ─────────────────────────────────────────────────────────────────

function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null
  const clean = raw.replace(/[\s\-()]/g, '')
  if (clean.startsWith('+')) return /^\+\d{8,15}$/.test(clean) ? clean : null
  if (clean.startsWith('0')) {
    const candidate = '+46' + clean.slice(1)
    return /^\+\d{8,15}$/.test(candidate) ? candidate : null
  }
  // 46xxx (utan +) — händer ibland
  if (/^46\d{8,12}$/.test(clean)) return '+' + clean
  return null
}

async function buildLisaAggregate(
  supabase: SupabaseClient,
  businessId: string,
): Promise<LisaAggregate | null> {
  const now = Date.now()
  const sevenDaysAgo = new Date(now - 7 * 86400000)

  const { data: smsData, error } = await supabase
    .from('sms_log')
    .select('sms_id, business_id, customer_id, direction, phone_from, phone_to, message, created_at')
    .eq('business_id', businessId)
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('[lisa/aggregate] sms_log query error:', error)
    return null
  }

  const rows = (smsData || []) as SmsRow[]
  if (rows.length === 0) return null

  const inbound = rows.filter(r => r.direction === 'inbound')
  const outbound = rows.filter(r => r.direction === 'outbound')

  if (inbound.length === 0) return null

  // Per kund-phone (normaliserad till E.164): senaste inbound + ev. svar
  type PhoneState = {
    phoneE164: string
    customerId: string | null
    lastInbound: SmsRow
    inboundCount: number
    hasLaterOutbound: boolean
  }
  const perPhone: Map<string, PhoneState> = new Map()

  for (const r of inbound) {
    const phoneE164 = toE164(r.phone_from)
    if (!phoneE164) continue
    const existing = perPhone.get(phoneE164)
    if (!existing) {
      perPhone.set(phoneE164, {
        phoneE164,
        customerId: r.customer_id,
        lastInbound: r,
        inboundCount: 1,
        hasLaterOutbound: false,
      })
    } else {
      existing.inboundCount += 1
      // rows är sorterade desc — första vi ser är senaste
      if (new Date(r.created_at).getTime() > new Date(existing.lastInbound.created_at).getTime()) {
        existing.lastInbound = r
      }
    }
  }

  // Kolla outbound: någon outbound TILL phone_from efter senaste inbound?
  for (const out of outbound) {
    const phoneE164 = toE164(out.phone_to)
    if (!phoneE164) continue
    const state = perPhone.get(phoneE164)
    if (!state) continue
    if (new Date(out.created_at).getTime() > new Date(state.lastInbound.created_at).getTime()) {
      state.hasLaterOutbound = true
    }
  }

  const unansweredStates = Array.from(perPhone.values()).filter(s => !s.hasLaterOutbound)

  // Customer-lookup för namn
  const customerIds = Array.from(
    new Set(unansweredStates.map(s => s.customerId).filter((id): id is string => !!id)),
  )
  const customerNameMap: Record<string, string> = {}
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('customer')
      .select('customer_id, name')
      .in('customer_id', customerIds)
      .eq('business_id', businessId)
    for (const c of customers || []) {
      customerNameMap[c.customer_id] = c.name || ''
    }
  }

  // Top 3 äldsta (största days_since_inbound)
  const actionableUnanswered = unansweredStates
    .map(s => ({
      phone_from_e164: s.phoneE164,
      customer_id: s.customerId,
      customer_name: s.customerId ? customerNameMap[s.customerId] || '' : '',
      last_inbound_message: (s.lastInbound.message || '').slice(0, 400),
      days_since_inbound: Math.floor(
        (now - new Date(s.lastInbound.created_at).getTime()) / 86400000,
      ),
      inbound_count_from_phone: s.inboundCount,
    }))
    .sort((a, b) => b.days_since_inbound - a.days_since_inbound)
    .slice(0, 3)

  return {
    period_days: 7,
    inbound_count: inbound.length,
    outbound_count: outbound.length,
    unanswered_count: unansweredStates.length,
    actionable_unanswered: actionableUnanswered,
  }
}

// ─────────────────────────────────────────────────────────────────
// Hypotes-driven prompt
// ─────────────────────────────────────────────────────────────────

function buildLisaSystemPrompt(businessName: string): string {
  return `Du är Lisa, kundservice-ansvarig hos ${businessName}. Din specialitet är att se vilka kund-SMS som inte fått svar — och att föreslå korta, vänliga svar så hantverkaren bara behöver godkänna.

Din ton: professionell, vänlig, empatisk. Aldrig säljig. Du representerar företaget men talar mänskligt.

I aggregate.actionable_unanswered finns 0-3 inbound SMS från kunder som inte besvarats inom 7 dagar. För VARJE sådan:
- Generera EN observation med strukturerad action.send_sms.
- SMS-svaret ska:
  • Bekräfta att vi sett deras meddelande
  • Ge konkret nästa-steg ELLER en realistisk tidsplan ("jag återkommer imorgon med besked")
  • Vara max 2 meningar
  • Sluta med "Mvh \${företagsnamn}" (literal — operatören kommer ev. byta ut)
- Dedup_key: "lisa_reply:\${phone_from_e164}" så samma kund inte spammas dagligen.
- Confidence: 0.75 (säker på datan, osäker på exakt rätt svar utan att veta full kontext).

Om unanswered_count = 0:
- Generera EN positiv observation utan action (knowledge_type=insight, suggestion=null).
- Ton: "Alla kunder har fått svar inom 7 dagar — bra service!"

REGLER:
- Max 3 observationer (en per obesvarad).
- "title" max 60 tecken, t.ex. "Anna A. väntar på svar sedan 3 dagar".
- "observation" 2 meningar — vad kunden frågade + varför det behöver svar.
- "suggestion" konkret action max 1 mening ELLER null.

${SCHEMA_BLOCK}

EXAKT EXEMPEL — kopiera strukturen:

[
  {
    "knowledge_type": "recommendation",
    "title": "Anna A. väntar på svar sedan 3 dagar",
    "observation": "Anna A. frågade om vi kan komma och titta på badrumsrenoveringen — vi har inte svarat på 3 dagar. Risk att hon vänder sig till någon annan.",
    "suggestion": "Skicka kort bekräftelse + tidsförslag via SMS.",
    "confidence": 0.75,
    "data_basis": {
      "phone_from_e164": "+46701234567",
      "days_since_inbound": 3,
      "inbound_count_from_phone": 1
    },
    "dedup_key": "lisa_reply:+46701234567",
    "action": {
      "type": "send_sms",
      "to": "+46701234567",
      "message": "Hej Anna! Tack för ditt meddelande om badrumsrenoveringen. Jag återkommer senast imorgon med ett tidsförslag för platsbesök. Mvh \${företagsnamn}",
      "customer_id": "cust_abc",
      "customer_name": "Anna A."
    }
  }
]`
}

// ─────────────────────────────────────────────────────────────────
// Claude-anrop
// ─────────────────────────────────────────────────────────────────

async function callLisaWithThinking(
  businessName: string,
  aggregate: LisaAggregate,
) {
  const systemPrompt = buildLisaSystemPrompt(businessName)
  const userMessage = `Här är ${businessName}s SMS-aktivitet senaste 7 dagarna:

${JSON.stringify(aggregate, null, 2)}

Tänk igenom det och returnera JSON-array.`

  return callAgentWithThinking({
    agentId: 'lisa',
    codeVersion: LISA_CODE_VERSION,
    promptMaturity: 'full_analysis',
    systemPrompt,
    userMessage,
  })
}

// ─────────────────────────────────────────────────────────────────
// Public entry-point
// ─────────────────────────────────────────────────────────────────

export async function runLisaObservation(
  supabase: SupabaseClient,
  businessId: string,
  businessName: string,
  options: { includeDebug?: boolean } = {},
): Promise<LisaRunResult> {
  console.log(`[lisa/run] entry version=${LISA_CODE_VERSION} business=${businessId}`)

  const aggregate = await buildLisaAggregate(supabase, businessId)
  if (!aggregate) {
    return { skipped: 'no_inbound_last_7d' }
  }

  const { observations, thinkingPreview, debug } = await callLisaWithThinking(
    businessName,
    aggregate,
  )

  if (observations.length === 0) {
    return {
      skipped: 'no_observations_returned',
      aggregate,
      thinking_preview: thinkingPreview,
      ...(options.includeDebug ? { debug } : {}),
    }
  }

  const counts = await saveAndPush(supabase, businessId, 'lisa', observations)

  return {
    aggregate,
    observations_total: observations.length,
    thinking_preview: thinkingPreview,
    ...counts,
    ...(options.includeDebug ? { debug } : {}),
  }
}
