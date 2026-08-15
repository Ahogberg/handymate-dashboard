/**
 * Gemensamt frekvenstak per kund (gap 9, tasks/vilande-pengar-masterplan.md
 * VP1) — max ETT outbound-förslag per kund, oavsett vilken av Hannas fyra
 * producenter som föreslår det:
 *
 *   - lib/agents/hanna-outbound.ts        → approval_type 'proactive_care'
 *   - lib/agents/hanna/capacity-fill.ts   → approval_type 'send_sms' (trigger 'capacity_fill')
 *   - lib/agents/hanna/avtal-forslag.ts   → approval_type 'send_sms' (trigger 'avtal_forslag')
 *   - lib/agents/hanna/kundbas-svep.ts    → samma insert-helper som avtal-forslag ovan
 *
 * Varje producent har redan sin EGEN, snävare dedup (t.ex. avtal-forslags
 * 7-dagars breda spärr + 30-dagars avvisat-spärr, kapacitetsfyllnadens
 * 7-dagars breda spärr) — men de körs OBEROENDE av varandra, så en kund kan
 * i praktiken få två-tre olika kort samma vecka från olika producenter.
 * Denna guard är ett SISTA, delat lager ovanpå de befintliga — anropas
 * INNAN kortskapande, blockerar aldrig retroaktivt, ersätter ingen av de
 * befintliga spärrarna.
 *
 * Alla fyra producenter skriver payload.customer_id (verifierat läsning av
 * respektive fil 2026-08-05) — det är den gemensamma nämnaren guarden
 * matchar mot, oavsett approval_type.
 *
 * Kollar TVÅ datakällor (de kan divergera — ett kort kan skapas utan att
 * SMS:et någonsin skickades, t.ex. avvisat, eller tvärtom loggat SMS utan
 * kvarvarande kort):
 *   1. pending_approvals — approval_type 'send_sms' eller 'proactive_care',
 *      SKAPAD (oavsett status: pending/approved/rejected — även ett
 *      avvisat/godkänt kort betyder att kunden nyligen kontaktades/
 *      erbjöds kontakt) inom fönstret.
 *   2. sms_log — faktiskt loggat utgående agent-SMS (sendSmsViaElks loggar
 *      ALLTID, även fail) inom fönstret.
 *
 * Detta är en rådgivande PRODUCENTVAKT: DB-fel får hellre skapa ett extra
 * approval-kort än stoppa hela outbound-motorn. Den är inte exekverings-
 * skyddet. Den centrala grinden i lib/outbound/sms-gate.ts kör precis före
 * 46elks, kontrollerar faktisk skickad historik och failar stängt.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** approval_type-värden som räknas som "outbound-förslag" för guarden —
    täcker alla fyra producenter (se filkommentaren ovan).
    VP3: + 'warranty_followup' — motorn väcktes (den var död pga fel
    tabellnamn) och dess kort ska både konsultera och synas i taket. */
export const OUTBOUND_APPROVAL_TYPES = ['send_sms', 'proactive_care', 'warranty_followup'] as const

/** Hur många dagar tillbaka som räknas som "nyligen kontaktad". */
export const FREQUENCY_WINDOW_DAYS = 7

export interface FrequencyCheckResult {
  allowed: boolean
  reason?: string
}

/**
 * Ren datumlogik — testbar utan DB. Avgör om en rad (skapad vid
 * `createdAtIso`) faller inom frekvensfönstret räknat från `nowMs`.
 */
export function isWithinFrequencyWindow(
  createdAtIso: string | null | undefined,
  nowMs: number,
  windowDays: number = FREQUENCY_WINDOW_DAYS,
): boolean {
  if (!createdAtIso) return false
  const createdMs = new Date(createdAtIso).getTime()
  if (Number.isNaN(createdMs)) return false
  const windowStartMs = nowMs - windowDays * 24 * 60 * 60 * 1000
  return createdMs >= windowStartMs
}

/**
 * Kärnpredikatet, ren funktion: hittar den FÖRSTA matchande raden (om
 * någon) bland redan hämtade pending_approvals-rader för en given kund
 * inom fönstret. Separerad från I/O så den kan facit-testas utan Supabase.
 */
export function findRecentApprovalForCustomer(
  approvalRows: Array<{ payload: unknown; created_at: string }>,
  customerId: string,
  nowMs: number,
  windowDays: number = FREQUENCY_WINDOW_DAYS,
): { payload: unknown; created_at: string } | null {
  for (const row of approvalRows) {
    const payload = (row.payload || {}) as Record<string, unknown>
    const rowCustomerId = payload.customer_id ? String(payload.customer_id) : null
    if (rowCustomerId !== String(customerId)) continue
    if (isWithinFrequencyWindow(row.created_at, nowMs, windowDays)) return row
  }
  return null
}

/**
 * Kollar om `customerId` fick NÅGOT outbound-kort skapat (pending_approvals,
 * approval_type send_sms/proactive_care) eller ett loggat agent-SMS
 * (sms_log, outbound) senaste FREQUENCY_WINDOW_DAYS dagarna. Anropas av
 * producenterna FÖRE kortskapande — se filkommentaren för vilka.
 */
export async function canContactCustomer(
  supabase: SupabaseClient,
  businessId: string,
  customerId: string,
  now: Date = new Date(),
): Promise<FrequencyCheckResult> {
  if (!customerId) return { allowed: true }

  const nowMs = now.getTime()
  const windowStartIso = new Date(nowMs - FREQUENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  try {
    const { data: recentApprovals, error: apprErr } = await supabase
      .from('pending_approvals')
      .select('payload, created_at')
      .eq('business_id', businessId)
      .in('approval_type', OUTBOUND_APPROVAL_TYPES as unknown as string[])
      .gte('created_at', windowStartIso)
      .limit(500)

    if (apprErr) {
      console.warn('[frequency-guard] pending_approvals-uppslag misslyckades (tillåter kontakt):', apprErr.message)
    } else {
      const hit = findRecentApprovalForCustomer(recentApprovals || [], customerId, nowMs)
      if (hit) {
        return {
          allowed: false,
          reason: `Kunden fick redan ett outbound-förslag senaste ${FREQUENCY_WINDOW_DAYS} dagarna`,
        }
      }
    }
  } catch (err: any) {
    console.warn('[frequency-guard] pending_approvals-uppslag kastade (tillåter kontakt):', err?.message || err)
  }

  try {
    const { data: recentSms, error: smsErr } = await supabase
      .from('sms_log')
      .select('sms_id')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .eq('direction', 'outbound')
      .gte('created_at', windowStartIso)
      .limit(1)

    if (smsErr) {
      console.warn('[frequency-guard] sms_log-uppslag misslyckades (tillåter kontakt):', smsErr.message)
    } else if (recentSms && recentSms.length > 0) {
      return {
        allowed: false,
        reason: `Kunden fick redan ett SMS senaste ${FREQUENCY_WINDOW_DAYS} dagarna`,
      }
    }
  } catch (err: any) {
    console.warn('[frequency-guard] sms_log-uppslag kastade (tillåter kontakt):', err?.message || err)
  }

  return { allowed: true }
}
