/**
 * Delad quote→invoice-mappare — EN sanning i stället för tre (Prisslingan V2
 * etapp A1, 2026-08-31).
 *
 * Före denna fil fanns tre parallella mappningar av quote_items → fakturarader
 * (app/api/invoices/from-quote, app/api/projects/[id]/create-final-invoice,
 * lib/invoices/project-invoice-draft) som kopierade OLIKA fältuppsättningar:
 * bara en av tre bevarade labor_amount (ROT-basen, v67), ingen bevarade
 * linked_product_id, och en tappade även is_rut_eligible/cost_price. Det är
 * samma felklass som momsbasen 2026-07-30: duplicerad pengalogik som driftar
 * isär utan att någon kopia ser fel ut för sig.
 *
 * Konsekvensen av tappet var verkliga pengar: utan labor_amount räknas
 * fakturans ROT-bas på HELA radtotalen i stället för arbetsandelen → för högt
 * avdrag som Skatteverket nekar och lämnar kunden med en obetald rest.
 *
 * Regler som är avsiktliga och låsta av tests/quote-to-invoice-mapper.spec.ts:
 * - Tillval: ovalda 'option'-rader exkluderas helt; valda blir 'item'.
 * - labor_amount kopieras med ?? (ALDRIG ||): 0 är giltigt och betyder
 *   "ren materialrad — ROT-bas 0".
 * - Endast 'item'-rader får sin total omräknad (qty × á-pris). Delsummor
 *   (quantity 0, lagrad total = summan) och rabatter (lagrad NEGATIV total)
 *   behåller sin lagrade total — omräkning nollade resp. teckenvände dem.
 * - Ingen totals-/ROT-beräkning görs här; anroparen äger den (och
 *   create-invoice-kärnan ska enligt sin filkommentar INTE ta över den).
 */

export interface MappedInvoiceItem {
  id: string
  item_type: string
  group_name?: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  type?: string
  is_rot_eligible: boolean
  is_rut_eligible: boolean
  sort_order: number
  cost_price: number | null
  article_number: string | null
  /** Arbetsandelen av raden (v67) — ROT-basens sanning. ?? -kopierad: 0 giltigt. */
  labor_amount: number | null
  /** Produktkopplingen — utan den bryts marginaluppföljning, Fortnox
      ArticleNumber och prisåterkopplingen till artikelbanken vid fakturan. */
  linked_product_id: string | null
}

export interface MapQuoteItemsOptions {
  /** Prefix för genererade rad-id:n (default 'ii_'). */
  idPrefix?: string
  /** Startvärde för sort_order-fallback när raden saknar egen. */
  startSortOrder?: number
}

function radId(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 14)
}

/**
 * Mappar offertrader (quote_items-rader ELLER legacy-JSONB med name/price)
 * till fakturans radform. Ren funktion — ingen DB, inga sidoeffekter.
 */
export function mapQuoteItemsToInvoiceItems(
  quoteItems: any[],
  opts: MapQuoteItemsOptions = {},
): MappedInvoiceItem[] {
  const prefix = opts.idPrefix ?? 'ii_'
  const start = opts.startSortOrder ?? 0

  return (quoteItems || [])
    .filter((item: any) => item.item_type !== 'option' || item.option_selected === true)
    .map((item: any, i: number) => {
      const itemType = item.item_type === 'option' ? 'item' : (item.item_type || 'item')
      const quantity = item.quantity || 1
      const unitPrice = item.unit_price || item.price || 0
      return {
        id: radId(prefix),
        item_type: itemType,
        group_name: item.group_name || undefined,
        description: item.description || item.name || '',
        quantity,
        unit: item.unit || 'st',
        unit_price: unitPrice,
        total: itemType === 'item' ? quantity * unitPrice : (item.total || 0),
        type: item.type,
        is_rot_eligible: item.is_rot_eligible || false,
        is_rut_eligible: item.is_rut_eligible || false,
        sort_order: item.sort_order ?? start + i,
        cost_price: item.cost_price ?? null,
        article_number: item.article_number ?? null,
        labor_amount: item.labor_amount ?? null,
        linked_product_id: item.linked_product_id ?? null,
      }
    })
}

/**
 * ROT-/RUT-basen ur fakturarader: per berättigad 'item'-rad
 * labor_amount ?? qty × á-pris (create-final-invoice-modellen — den korrekta).
 *
 * ?? är avsiktligt: labor_amount 0 = ren material och ska ge bas 0, inte
 * falla tillbaka på radtotalen. Rabatt-/rubrik-/delsummerader räknas aldrig.
 */
export function rotRutLaborBasis(
  items: Array<Pick<MappedInvoiceItem, 'item_type' | 'quantity' | 'unit_price' | 'labor_amount'> &
    { is_rot_eligible?: boolean; is_rut_eligible?: boolean }>,
  type: 'rot' | 'rut',
): number {
  return (items || [])
    .filter(i => (i.item_type || 'item') === 'item')
    .filter(i => (type === 'rot' ? i.is_rot_eligible : i.is_rut_eligible))
    .reduce((sum, i) => {
      const rad = Number(i.quantity || 0) * Number(i.unit_price || 0)
      return sum + Number(i.labor_amount ?? rad)
    }, 0)
}
