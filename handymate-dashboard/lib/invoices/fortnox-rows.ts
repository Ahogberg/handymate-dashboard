/**
 * Fortnox-radbyggaren — REN funktion, bruten ur sync-to-fortnox (Prisslingan
 * V2 etapp A3, 2026-08-31). Låst av tests/fortnox-row-builder.spec.ts.
 *
 * Buggarna som motiverade utbrytningen (alla i den gamla inline-mappen):
 * - VAT var hårdkodad 25 per rad — en 12%- eller 6%-faktura, och
 *   påminnelseavgifter/dröjsmålsränta (vat_rate 0), bokfördes fel.
 * - Rabattrader skickades med POSITIVT Price (bara total negeras i appen) —
 *   Fortnox-fakturan blev HÖGRE än Handymates på varje faktura med rabatt.
 * - heading/text/subtotal skickades som 0 kr-varurader — bokföringen och
 *   kunddokumentet visade olika radlistor.
 *
 * ArticleNumber är MEDVETET utelämnat (fasad utrullning): ett ArticleNumber
 * som inte finns i Fortnox artikelregister ger API-fel på hela bokföringen.
 * Fas 2 (P2) synkar products → Fortnox /articles först; därefter kan
 * item.article_number skickas villkorat.
 */

import { houseWorkRowFields, type HouseWorkRowInput } from '@/lib/fortnox/housework'
import type { RotRutType } from '@/lib/skv/categories'

export interface FortnoxInvoiceRow {
  ArticleNumber?: string
  Description: string
  DeliveredQuantity?: number
  Price?: number
  Unit?: string
  VAT?: number
  HouseWork?: boolean
  HouseWorkType?: string
  HouseWorkHoursToReport?: number
}

/** Radkälla: fakturans items-JSONB. `name` täcker påminnelseraderna som
    historiskt skrivits utan `description`. */
export interface FortnoxRowSourceItem extends HouseWorkRowInput {
  item_type?: string | null
  description?: string | null
  name?: string | null
  unit_price?: number | null
  /** Radens egen momssats (t.ex. 0 för påminnelseavgift/ränta). */
  vat_rate?: number | null
}

/** App-enhet → Fortnox-enhet. Okänd enhet utelämnas (Fortnox default). */
export function mapFortnoxUnit(u: string | null | undefined): string | undefined {
  if (!u) return undefined
  const lower = u.toLowerCase()
  if (lower === 'tim' || lower === 'h' || lower === 'timmar') return 'h'
  if (lower === 'st' || lower === 'styck') return 'st'
  if (lower === 'm' || lower === 'meter') return 'm'
  if (lower === 'm2' || lower === 'kvm') return 'm2'
  if (lower === 'kg') return 'kg'
  return undefined
}

export function buildFortnoxInvoiceRows(
  items: FortnoxRowSourceItem[],
  opts: {
    /** Fakturans momssats — radens egen vat_rate vinner, sist 25. */
    invoiceVatRate?: number | null
    /** Satt när fakturan har husarbete: fälten sätts då på VARJE rad
        (Fortnox-regeln), HouseWork=true bara på berättigade arbetsrader. */
    houseWork?: { rotType: RotRutType; houseWorkType: string } | null
  } = {},
): FortnoxInvoiceRow[] {
  const rows: FortnoxInvoiceRow[] = []
  for (const item of items || []) {
    const typ = item.item_type || 'item'
    // Delsummor är ren presentation — beloppet ligger redan i raderna ovanför.
    if (typ === 'subtotal') continue

    const beskrivning = (item.description || item.name || '').slice(0, 200)

    // Rubriker/fritext → textrader (bara Description, inget pris/antal).
    // Tomma sådana rader utelämnas helt.
    if (typ === 'heading' || typ === 'text') {
      if (beskrivning) {
        rows.push({
          Description: beskrivning,
          ...(opts.houseWork
            ? houseWorkRowFields(item, opts.houseWork.rotType, opts.houseWork.houseWorkType)
            : {}),
        })
      }
      continue
    }

    const pris = Number(item.unit_price ?? 0)
    rows.push({
      Description: beskrivning || 'Arbete',
      DeliveredQuantity: Number(item.quantity ?? 1),
      // Rabattrader lagras med positivt unit_price i appen (bara total
      // negeras) — Fortnox behöver det negativa radpriset.
      Price: typ === 'discount' ? -Math.abs(pris) : pris,
      Unit: mapFortnoxUnit(item.unit),
      VAT: Number(item.vat_rate ?? opts.invoiceVatRate ?? 25),
      ...(opts.houseWork
        ? houseWorkRowFields(item, opts.houseWork.rotType, opts.houseWork.houseWorkType)
        : {}),
    })
  }
  return rows
}
