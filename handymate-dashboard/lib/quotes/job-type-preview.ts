import { inspectTemplate, type SetupProduct, type SetupTemplate } from './job-type-setup'
import { matchReservations, type ReservationWithTriggers } from '@/lib/reservations/match'

export interface JobTypePreviewRow {
  index: number
  itemType: 'item' | 'option'
  description: string
  unit: string
  productName: string | null
  unitPrice: number | null
  status: 'priced' | 'price_missing' | 'product_missing' | 'unit_mismatch'
}

export interface JobTypePreviewReservation {
  id: string
  title: string
  triggeredBy: string[]
}

export interface JobTypeQuotePreview {
  rows: JobTypePreviewRow[]
  reservations: JobTypePreviewReservation[]
}

/**
 * Read-only förhandsbevis av exakt det underlag som redan är kopplat.
 *
 * Avsiktliga begränsningar:
 * - endast aktiva artikelbankens pris läses via inspectTemplate,
 * - mallens gamla unit_price och total finns inte ens i DTO:n,
 * - mängder visas inte innan det riktiga jobbet har granskats,
 * - reservationsmotorn återanvänds utan att acceptera eller skriva något.
 */
export function buildJobTypeQuotePreview(
  template: SetupTemplate,
  products: SetupProduct[],
  reservationLibrary: ReservationWithTriggers[] = [],
): JobTypeQuotePreview {
  const inspected = inspectTemplate(template, products)
  const rows: JobTypePreviewRow[] = inspected.map(({ item, product, status }) => ({
    index: item.index,
    itemType: item.itemType,
    description: item.description || 'Namnlös rad',
    unit: item.unit,
    productName: product?.name ?? null,
    unitPrice: status === 'priced' && product ? product.salesPrice : null,
    status,
  }))

  const suggestions = matchReservations(
    template.items.map(item => ({
      id: `jobbtyp_preview_${item.index}`,
      item_type: item.itemType,
      description: item.description,
      linked_product_id: item.linkedProductId,
    })),
    reservationLibrary,
  )

  return {
    rows,
    reservations: suggestions.map(suggestion => ({
      id: suggestion.reservation.id,
      title: suggestion.reservation.title,
      triggeredBy: Array.from(new Set(suggestion.triggeredBy.map(row => row.description).filter(Boolean))),
    })),
  }
}

