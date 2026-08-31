/**
 * Reservationsförslag SERVERSIDE (Prisslingan V2 pass 4, UX3b).
 *
 * Motorn (lib/reservations/match.ts) har alltid varit ren och delbar — men
 * bara offert-EDITORN körde den. Kö-godkända AI-utkast och agentskapade
 * offerter fick därför ALDRIG reservations_snapshot: hela biblioteket (27
 * seedade förbehåll + triggers + inlärning) hoppades över för allt som inte
 * byggdes för hand.
 *
 * Här: hämta biblioteket (samma data som GET /api/reservations?include=
 * triggers) + ren mappning offertrader → snapshotförslag. INGEN inlärning
 * skrivs serverside — förslag in i utkastet är allt; hantverkaren stryker i
 * editorn och inlärningen förblir hans klick.
 *
 * Anroparen ansvarar för fail-soft: ett förbehållsfel får ALDRIG fälla ett
 * godkännande/offertskapande.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  matchReservations,
  type MatchableItem,
  type ReservationWithTriggers,
} from './match'

export async function fetchReservationLibrary(
  supabase: SupabaseClient,
  businessId: string,
): Promise<ReservationWithTriggers[]> {
  const { data: texts, error } = await supabase
    .from('reservation_texts')
    .select('id, title, content, suggest_enabled, is_active, sort_order')
    .eq('business_id', businessId)
    .order('sort_order')
  if (error) throw error
  const lista = texts || []
  if (lista.length === 0) return []

  const { data: triggers } = await supabase
    .from('reservation_triggers')
    .select('reservation_id, trigger_type, product_id, category_slug, keyword')
    .in('reservation_id', lista.map((t: any) => t.id))

  const perReservation = new Map<string, any[]>()
  for (const tr of triggers || []) {
    const key = (tr as any).reservation_id
    if (!perReservation.has(key)) perReservation.set(key, [])
    perReservation.get(key)!.push(tr)
  }
  return lista.map((t: any) => ({ ...t, triggers: perReservation.get(t.id) || [] }))
}

export interface SnapshotForslag {
  reservation_id: string | null
  title: string
  content: string
}

/** Ren: offertrader (quote_items-form) → snapshotförslag via matchmotorn. */
export function suggestSnapshotForItems(
  library: ReservationWithTriggers[],
  quoteItems: Array<{
    id?: string
    description?: string | null
    category_slug?: string | null
    linked_product_id?: string | null
    item_type?: string
  }>,
): SnapshotForslag[] {
  const matchbara: MatchableItem[] = (quoteItems || []).map((qi, i) => ({
    id: qi.id || `rad_${i}`,
    description: qi.description ?? null,
    category_slug: qi.category_slug ?? null,
    linked_product_id: qi.linked_product_id ?? null,
    item_type: qi.item_type,
  }))
  return matchReservations(matchbara, library).map(s => ({
    reservation_id: s.reservation.id ?? null,
    title: s.reservation.title,
    content: s.reservation.content,
  }))
}
