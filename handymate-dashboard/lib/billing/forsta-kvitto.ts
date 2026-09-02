/**
 * Första värdekvittot (2026-09-02) — "Aktivera senare"-löftets andra halva.
 *
 * Betalfrågan ställs igen först när teamet bevisat något: det första
 * godkända kortet av en kvittotyp (RECEIPT_APPROVAL_TYPES, samma lista som
 * kvittot självt och aktiveringsmåtten) vars execution_result.outcome är
 * success OCH som buildValueReceipt faktiskt kan sätta ord på. Ingen
 * gissning, ingen uppskattning — finns inget sådant kort finns inget kvitto.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildValueReceipt, RECEIPT_APPROVAL_TYPES } from '@/lib/approvals/value-receipt'

export interface ForstaKvitto {
  text: string
  link: string | null
  at: string
}

interface KvittoRad {
  approval_type: string
  payload: Record<string, unknown> | null
  resolved_at: string | null
}

/** Ren: första raden (i given ordning) som ger ett verifierat kvitto. */
export function harledForstaKvitto(rader: KvittoRad[]): ForstaKvitto | null {
  for (const rad of rader) {
    const execution = (rad.payload?.execution_result ?? null) as Record<string, unknown> | null
    if (!execution || execution.outcome !== 'success' || !rad.resolved_at) continue
    const kvitto = buildValueReceipt({ approval_type: rad.approval_type, payload: rad.payload }, execution, 'success')
    if (kvitto) return { text: kvitto.text, link: kvitto.link ?? null, at: rad.resolved_at }
  }
  return null
}

/** Fail-soft: DB-fel ⇒ null (ingen betalfråga på ett obevisat värde). */
export async function hamtaForstaKvitto(supabase: SupabaseClient, businessId: string): Promise<ForstaKvitto | null> {
  try {
    const { data, error } = await supabase
      .from('pending_approvals')
      .select('approval_type, payload, resolved_at')
      .eq('business_id', businessId)
      .eq('status', 'approved')
      .in('approval_type', [...RECEIPT_APPROVAL_TYPES])
      .not('resolved_at', 'is', null)
      .order('resolved_at', { ascending: true })
      .limit(50)
    if (error) return null
    return harledForstaKvitto((data || []) as KvittoRad[])
  } catch {
    return null
  }
}
