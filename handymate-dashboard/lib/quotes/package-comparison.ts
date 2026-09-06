import type { QuoteItem } from '../types/quote'
import { calculateQuoteTotals, recalculateItems } from '../quote-calculations'
import { calculateQuoteMargin } from './margin'
export type PackageLevel = 'base' | 'recommended' | 'extended'
export const PACKAGE_LABELS: Record<PackageLevel, string> = { base: 'Grund', recommended: 'Rekommenderat', extended: 'Utökat' }
/** Hidden options are never offered as choices and preserve their existing state. */
export function applyPackage(items: QuoteItem[], level: PackageLevel, recommended: string[]): QuoteItem[] {
  const ids = new Set(recommended)
  return items.map(item => {
    if (item.item_type !== 'option' || item.is_hidden) return item
    const selected = level === 'extended' || (level === 'recommended' && ids.has(item.id))
    return { ...item, option_default: selected, option_selected: selected }
  })
}
export function comparePackage(items: QuoteItem[], level: PackageLevel, recommended: string[], discountPercent: number, vatRate: number) {
  const rows = recalculateItems(applyPackage(items, level, recommended))
  const active = rows.filter(row => row.item_type === 'item' || (row.item_type === 'option' && row.option_selected))
  const invalid = active.length === 0 || active.some(row => (row.ai_price_missing && !(row.unit_price > 0)) || !Number.isFinite(row.unit_price) || row.unit_price < 0 || !Number.isFinite(row.quantity) || row.quantity <= 0)
    || !Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100 || !Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100
    || rows.some(row => row.item_type === 'discount' && (!Number.isFinite(row.quantity) || !Number.isFinite(row.unit_price)))
  const totals = calculateQuoteTotals(rows, discountPercent, vatRate)
  const margin = calculateQuoteMargin(rows)
  const knownCosts = active.length > 0 && active.every(row => row.cost_price != null && Number.isFinite(row.cost_price) && row.cost_price >= 0)
  return {
    level, rows, valid: !invalid && Number.isFinite(totals.total),
    total: totals.total, beforeVat: totals.afterDiscount,
    // Invoice revenue after discount minus actual entered costs; never a partial percentage.
    contribution: !invalid && knownCosts ? Math.round(totals.afterDiscount - margin.knownCost) : null,
    options: rows.filter(row => row.item_type === 'option' && !row.is_hidden && row.option_selected).map(row => row.description),
  }
}
