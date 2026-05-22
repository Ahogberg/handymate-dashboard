/**
 * getQuoteBudgetDerivation (Etapp 3 pre-fix, 2026-05-22).
 *
 * Härleder budget-data + laborItems från en offert för användning i
 * offert→projekt-konvertering. EN SANNING — kallas från både:
 * - /api/projects POST (manuella "Skapa projekt"-knappen)
 * - lib/projects/create-from-quote.ts (auto vid accept)
 *
 * Bakgrund (pilot-blocker upptäckt 2026-05-22):
 * Tidigare läste båda konverterings-vägarna BARA quote.items (JSONB).
 * För nya offerter är JSONB tomt — data ligger i quote_items-tabellen.
 * Detta gjorde att alla nya offerter konverterades med budget_amount=null
 * → Etapp 2 ekonomi-vy + Lars-aggregator visade fel.
 *
 * Källprio (samma som getProjectQuoteContext + quote-edit-UI):
 * 1. quote_items-tabellen (primärt — nya offerter)
 * 2. quote.items JSONB (fallback — legacy-offerter)
 * 3. quote.total kolumn (last-resort fallback för budgetAmount om båda
 *    ovan är tomma — sker när offert har bara titel/total satt utan rader)
 *
 * Heuristik labor vs material (samma som getProjectQuoteContext):
 * - JSONB-rader: type='labor' är källan
 * - quote_items: is_rot_eligible || is_rut_eligible || unit∈{tim/h/timmar/hour}
 *
 * project_type-härledning:
 * - laborItems > 0 OCH materialItems > 0 → 'mixed'
 * - laborItems > 0 (bara arbete) → 'hourly'
 * - Annars (bara material, tomt, bara fastpris) → 'fixed_price'
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface LaborItemForMilestone {
  description: string
  quantity: number  // timmar om unit=tim, annars antal
  unit: string
  total: number
}

export type QuoteBudgetSource =
  | 'quote_items_table'  // primär källa: normaliserad tabell
  | 'jsonb_legacy'       // fallback: quotes.items JSONB
  | 'total_fallback'     // sista utvägen: quote.total-kolumn när rader saknas
  | 'empty'              // offert utan budget-data alls

export interface QuoteBudgetDerivation {
  budget_hours: number | null
  budget_amount: number | null
  project_type: 'fixed_price' | 'hourly' | 'mixed'
  labor_items: LaborItemForMilestone[]
  source: QuoteBudgetSource
}

// ─────────────────────────────────────────────────────────────────
// Internal row-types
// ─────────────────────────────────────────────────────────────────

interface QuoteItemTableRow {
  id: string
  item_type: string | null
  description: string | null
  quantity: number | null
  unit: string | null
  unit_price: number | null
  total: number | null
  is_rot_eligible: boolean | null
  is_rut_eligible: boolean | null
  sort_order: number | null
}

interface QuoteJsonbItem {
  id?: string
  type?: string  // legacy: 'labor' | 'material'
  item_type?: string
  description?: string
  name?: string
  quantity?: number
  unit?: string
  unit_price?: number
  price?: number
  total?: number
  is_rot_eligible?: boolean
  is_rut_eligible?: boolean
}

// ─────────────────────────────────────────────────────────────────
// Heuristik-helpers
// ─────────────────────────────────────────────────────────────────

const LABOR_UNITS = new Set(['tim', 'h', 'timmar', 'hour'])

function isLaborByTableRow(r: QuoteItemTableRow): boolean {
  if (r.item_type && r.item_type !== 'item') return false
  if (r.is_rot_eligible || r.is_rut_eligible) return true
  return LABOR_UNITS.has((r.unit || '').toLowerCase().trim())
}

function isLaborByJsonbItem(j: QuoteJsonbItem): boolean {
  if (j.item_type && j.item_type !== 'item') return false
  if (j.type === 'labor') return true
  if (j.is_rot_eligible || j.is_rut_eligible) return true
  return LABOR_UNITS.has((j.unit || '').toLowerCase().trim())
}

function deriveProjectType(
  laborCount: number,
  materialCount: number,
): 'fixed_price' | 'hourly' | 'mixed' {
  if (laborCount > 0 && materialCount > 0) return 'mixed'
  if (laborCount > 0) return 'hourly'
  return 'fixed_price'
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────

export async function getQuoteBudgetDerivation(
  supabase: SupabaseClient,
  quoteId: string,
  businessId: string,
): Promise<QuoteBudgetDerivation> {
  // ── 1. Försök quote_items-tabellen först ─────────────────────
  const { data: tableData } = await supabase
    .from('quote_items')
    .select(
      'id, item_type, description, quantity, unit, unit_price, total, ' +
        'is_rot_eligible, is_rut_eligible, sort_order',
    )
    .eq('quote_id', quoteId)
    .order('sort_order', { ascending: true })

  const tableRows = (tableData || []) as unknown as QuoteItemTableRow[]

  if (tableRows.length > 0) {
    let laborHours = 0
    let totalAmount = 0
    let laborCount = 0
    let materialCount = 0
    const laborItems: LaborItemForMilestone[] = []

    for (const r of tableRows) {
      const qty = Number(r.quantity || 0)
      const total = Number(r.total || 0)
      const itemType = r.item_type || 'item'

      if (itemType !== 'item') continue  // hoppa rubriker/text/subtotal/discount

      totalAmount += total
      const isLabor = isLaborByTableRow(r)

      if (isLabor) {
        laborCount += 1
        laborHours += qty
        laborItems.push({
          description: r.description || 'Arbete',
          quantity: qty,
          unit: r.unit || 'st',
          total: total,
        })
      } else {
        materialCount += 1
      }
    }

    return {
      budget_hours: laborHours > 0 ? laborHours : null,
      budget_amount: totalAmount > 0 ? totalAmount : null,
      project_type: deriveProjectType(laborCount, materialCount),
      labor_items: laborItems,
      source: 'quote_items_table',
    }
  }

  // ── 2. Fallback: quote.items JSONB ───────────────────────────
  const { data: quoteRow } = await supabase
    .from('quotes')
    .select('items, total')
    .eq('quote_id', quoteId)
    .eq('business_id', businessId)
    .single()

  if (!quoteRow) {
    return {
      budget_hours: null,
      budget_amount: null,
      project_type: 'fixed_price',
      labor_items: [],
      source: 'empty',
    }
  }

  const jsonbItems = Array.isArray(quoteRow.items)
    ? (quoteRow.items as QuoteJsonbItem[])
    : []

  if (jsonbItems.length > 0) {
    let laborHours = 0
    let totalAmount = 0
    let laborCount = 0
    let materialCount = 0
    const laborItems: LaborItemForMilestone[] = []

    for (const j of jsonbItems) {
      const qty = Number(j.quantity || 0)
      const total = Number(j.total ?? qty * Number(j.unit_price ?? j.price ?? 0))
      const itemType = j.item_type || 'item'

      if (itemType !== 'item') continue

      totalAmount += total
      const isLabor = isLaborByJsonbItem(j)

      if (isLabor) {
        laborCount += 1
        laborHours += qty
        laborItems.push({
          description: j.description || j.name || 'Arbete',
          quantity: qty,
          unit: j.unit || 'st',
          total: total,
        })
      } else {
        materialCount += 1
      }
    }

    return {
      budget_hours: laborHours > 0 ? laborHours : null,
      // Behåll quote.total-fallback om radernas summa råkar bli 0 men
      // offerten har en total satt direkt (edge-case)
      budget_amount: totalAmount > 0 ? totalAmount : Number(quoteRow.total || 0) || null,
      project_type: deriveProjectType(laborCount, materialCount),
      labor_items: laborItems,
      source: 'jsonb_legacy',
    }
  }

  // ── 3. Sista utvägen: quote.total-kolumnen (offert utan rader) ──
  const totalKr = Number(quoteRow.total || 0)
  if (totalKr > 0) {
    return {
      budget_hours: null,
      budget_amount: totalKr,
      project_type: 'fixed_price',
      labor_items: [],
      source: 'total_fallback',
    }
  }

  // ── 4. Helt tom offert ───────────────────────────────────────
  return {
    budget_hours: null,
    budget_amount: null,
    project_type: 'fixed_price',
    labor_items: [],
    source: 'empty',
  }
}
