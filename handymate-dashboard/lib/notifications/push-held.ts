/**
 * push_held (sql/v194) — hållna pushar under tyst tid.
 *
 * KONTRAKT: fail-open åt SÄNDNING. Saknad tabell (migration ej körd) eller
 * DB-fel vid hållning → 'misslyckades', och sendApprovalPush skickar då
 * som vanligt (dagens beteende) — hellre en push för mycket 23:40 än en
 * hållen notis som aldrig kommer fram. Dubblett (samma dedupe-nyckel redan
 * hållen och oreleasad) räknas som hållen.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { arSchemaSaknas } from '@/lib/observability/driftlarm'
import type { HallenPush } from '@/lib/notifications/tyst-tid'

export type HallUtfall = 'hallen' | 'dubblett' | 'misslyckades'
export type SlappUtfall = 'skickad' | 'utgangen' | 'ingen_mottagare' | 'misslyckad'

let schemaVarnat = false

function varnaSchema(): void {
  if (schemaVarnat) return
  schemaVarnat = true
  console.warn('[push-held] push_held saknas — kör sql/v194_push_held.sql för tyst tid på push')
}

export async function hallPush(
  supabase: SupabaseClient,
  rad: Omit<HallenPush, 'id' | 'created_at'>,
): Promise<HallUtfall> {
  try {
    const { error } = await supabase.from('push_held').insert({
      business_id: rad.business_id,
      target_user_id: rad.target_user_id ?? null,
      approval_type: rad.approval_type,
      push_class: rad.push_class,
      dedupe_key: rad.dedupe_key,
      title: rad.title,
      body: rad.body,
      url: rad.url,
    })
    if (!error) return 'hallen'
    if (error.code === '23505') return 'dubblett'
    if (arSchemaSaknas(error)) varnaSchema()
    else console.warn('[push-held] hållning misslyckades (skickar direkt i stället):', error.message)
    return 'misslyckades'
  } catch (err) {
    console.warn('[push-held] hållningen kastade (skickar direkt i stället):', err)
    return 'misslyckades'
  }
}

/** Alla ännu inte släppta rader, äldst först. */
export async function hamtaHallna(supabase: SupabaseClient, limit = 500): Promise<HallenPush[]> {
  const { data, error } = await supabase
    .from('push_held')
    .select('id, business_id, target_user_id, approval_type, push_class, dedupe_key, title, body, url, created_at')
    .is('released_at', null)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) {
    if (arSchemaSaknas(error)) {
      varnaSchema()
      return []
    }
    throw new Error(`push_held kunde inte läsas: ${error.message}`)
  }
  return (data || []) as HallenPush[]
}

export async function markeraSlappta(
  supabase: SupabaseClient,
  ids: string[],
  utfall: SlappUtfall,
  nowIso: string = new Date().toISOString(),
): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase
    .from('push_held')
    .update({ released_at: nowIso, release_outcome: utfall })
    .in('id', ids)
    .is('released_at', null)
  if (error) console.error('[push-held] kunde inte markera släppta rader:', error.message)
}
