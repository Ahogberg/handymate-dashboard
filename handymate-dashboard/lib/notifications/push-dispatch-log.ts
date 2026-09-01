/**
 * push_dispatch_log (sql/v191) — dedupe vid SÄNDNING av push.
 *
 * Tidigare fanns dedupe bara när agent-observationer SKAPADES; en push
 * kunde ändå gå två gånger (cron-omkörning, dubbel signal, två anropare).
 * Nu slår sendApprovalPush upp dedupe-nyckeln här innan den skickar.
 *
 * KONTRAKT: fail-open. Saknad tabell (migration ej körd) eller DB-fel →
 * "inte nyligen skickad" + en console.warn, dvs. exakt dagens beteende.
 * Bokföringen efteråt är best-effort och kastar aldrig.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { arSchemaSaknas } from '@/lib/observability/driftlarm'
import type { PushKlass } from '@/lib/notifications/push-policy'

let schemaVarnat = false

export async function nyligenSkickad(
  supabase: SupabaseClient,
  businessId: string,
  dedupeKey: string,
  windowSeconds: number,
  nowMs: number = Date.now(),
): Promise<boolean> {
  try {
    const sedan = new Date(nowMs - windowSeconds * 1000).toISOString()
    const { data, error } = await supabase
      .from('push_dispatch_log')
      .select('id')
      .eq('business_id', businessId)
      .eq('dedupe_key', dedupeKey)
      .gte('sent_at', sedan)
      .limit(1)
    if (error) {
      if (arSchemaSaknas(error)) {
        if (!schemaVarnat) {
          schemaVarnat = true
          console.warn('[push-dispatch-log] push_dispatch_log saknas — kör sql/v191 för dedupe vid sändning')
        }
      } else {
        console.warn('[push-dispatch-log] uppslag misslyckades (fail-open):', error.message)
      }
      return false
    }
    return (data || []).length > 0
  } catch (err) {
    console.warn('[push-dispatch-log] uppslaget kastade (fail-open):', err)
    return false
  }
}

export async function bokforPush(
  supabase: SupabaseClient,
  rad: {
    business_id: string
    dedupe_key: string
    approval_type: string
    push_class: PushKlass
    target_user_id?: string | null
    delivered: boolean
  },
): Promise<void> {
  try {
    const { error } = await supabase.from('push_dispatch_log').insert({
      business_id: rad.business_id,
      dedupe_key: rad.dedupe_key,
      approval_type: rad.approval_type,
      push_class: rad.push_class,
      target_user_id: rad.target_user_id ?? null,
      delivered: rad.delivered,
    })
    if (error && !arSchemaSaknas(error)) {
      console.warn('[push-dispatch-log] bokföring misslyckades:', error.message)
    }
  } catch (err) {
    console.warn('[push-dispatch-log] bokföringen kastade:', err)
  }
}
