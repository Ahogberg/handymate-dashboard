import { generateItemId } from '@/lib/quote-calculations'
import { generatedQuoteToQuoteItems } from '@/lib/quotes/generated-to-quote-items'
import type {
  DetailLevel,
  PaymentPlanEntry,
  QuoteItem,
} from '@/lib/types/quote'
import type { ReservationSnapshotEntry } from '@/lib/reservations/match'

/**
 * Load-mappern för offertredigeraren (Fas 2, offert-omtaget 2026-08-31) —
 * extraherad ur den gamla `[id]/edit/page.tsx`s `fetchQuote()`. Ren
 * hämtning + mappning, inga React-setters — QuoteBuilder.tsx applicerar
 * fälten på sitt eget state (samma modell som create-läget använder).
 *
 * TVÅ HISTORISKT DOKUMENTERADE BUGGAR SOM DENNA FIL SKYDDAR MOT:
 *
 * 1. Dolda rader (is_hidden): `item.is_hidden ?? false` — utan den blir
 *    undefined `false` i PUT-rutten och en rad hantverkaren MEDVETET dolt
 *    för kunden (v90, marginalrader) publiceras igen vid nästa autospar.
 *    `??` (inte `||`) håller redan-false oförändrat.
 *
 * 2. Giltighetsdatum (valid_until → valid_days): se `computeValidDays`
 *    nedan — bevarar EXAKT samma "vilken av de fyra knapparna (14/30/60/90)
 *    låg närmast"-häromstämning som den gamla sidan hade. OBS (flaggat i
 *    Fas 2-rapporten, INTE fixat här — se den): PUT-rutten
 *    (app/api/quotes/route.ts) räknar om `valid_until` som
 *    `NY Date() + valid_days` vid VARJE PUT, inte `created_at + valid_days`.
 *    Det betyder att en offert vars giltighetsdatum en gång bucketats om
 *    till t.ex. "30 dagar" och sedan autosparas flera dagar senare får sitt
 *    faktiska `valid_until` framflyttat — en kvarstående, redan existerande
 *    bugg i den DELADE PUT-rutten (påverkar ALLA anrop dit, inte bara denna
 *    sida), utanför den här Fas 2-uppgiftens omfång att ändra. Den här
 *    filen replikerar EXAKT den gamla sidans (redan ofullständiga) formel —
 *    gör den varken bättre eller sämre.
 */

export interface LoadedEditQuote {
  selectedCustomer: string
  title: string
  description: string
  quoteStatus: string
  quoteNumber: string
  items: QuoteItem[]
  notIncluded: string
  ataTerms: string
  paymentTermsText: string
  termsText: string
  hasAnyStandardText: boolean
  loadedReservations: ReservationSnapshotEntry[]
  attachments: Array<{ name: string; url: string; size?: number; path?: string }>
  paymentPlan: PaymentPlanEntry[]
  hasPaymentPlan: boolean
  referencePerson: string
  customerReference: string
  projectAddress: string
  detailLevel: DetailLevel
  showUnitPrices: boolean
  showQuantities: boolean
  templateStyle: 'modern' | 'premium' | 'friendly' | null
  personnummer: string
  fastighetsbeteckning: string
  discountPercent: number
  validDays: number
}

/**
 * Samma bucketering som gamla edit-sidan: hittar vilken av de fyra
 * "Giltighetstid"-knapparna (14/30/60/90 dagar) som låg närmast det
 * FAKTISKT sparade `valid_until` räknat från `created_at`. Ändrar INTE
 * `valid_until` — bara vilket värde giltighetstids-dropdownen visar tills
 * hantverkaren ändrar den (eller sparar, se docblocket ovan för den kända
 * bristen i PUT-rutten).
 */
function computeValidDays(validUntil: string | null | undefined, createdAt: string | null | undefined): number {
  if (!validUntil || !createdAt) return 30
  const validUntilDate = new Date(validUntil)
  const createdDate = new Date(createdAt)
  const diffMs = validUntilDate.getTime() - createdDate.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 30
  if (diffDays <= 14) return 14
  if (diffDays <= 30) return 30
  if (diffDays <= 60) return 60
  return 90
}

export async function fetchQuoteForEdit(quoteId: string): Promise<LoadedEditQuote> {
  const res = await fetch(`/api/quotes?quoteId=${quoteId}`)
  if (!res.ok) {
    throw new Error(`Kunde inte ladda offerten (status ${res.status})`)
  }
  const data = await res.json()
  const quote = data.quote
  if (!quote) {
    throw new Error('Offerten hittades inte i svaret')
  }

  let items: QuoteItem[] = []
  if (quote.quote_items && quote.quote_items.length > 0) {
    items = quote.quote_items.map((item: any, idx: number) => ({
      id: item.id || generateItemId(),
      item_type: item.item_type || 'item',
      group_name: item.group_name || undefined,
      description: item.description || '',
      quantity: item.quantity || 0,
      unit: item.unit || 'st',
      unit_price: item.unit_price || 0,
      total: item.total || 0,
      cost_price: item.cost_price || undefined,
      article_number: item.article_number || undefined,
      is_rot_eligible: item.is_rot_eligible || false,
      is_rut_eligible: item.is_rut_eligible || false,
      option_selected: item.option_selected ?? false,
      option_default: item.option_default ?? false,
      // Dolda marginalrader måste överleva laddning -> autosave. Utan
      // mappningen blir undefined false i PUT-rutten och raden publiceras.
      is_hidden: item.is_hidden ?? false,
      category_slug: item.category_slug || undefined,
      linked_product_id: item.linked_product_id || undefined,
      // Produktbank (v67): snapshot-fälten MÅSTE följa med genom edit-
      // laddningen — annars raderar nästa spara arbete/material-spliten.
      // ?? (inte ||): labor_amount 0 = ren material och skall bevaras.
      labor_amount: item.labor_amount ?? null,
      material_amount: item.material_amount ?? null,
      estimated_hours: item.estimated_hours ?? null,
      component_snapshot: item.component_snapshot ?? null,
      show_components_to_customer: item.show_components_to_customer ?? false,
      sort_order: item.sort_order ?? idx,
    }))
  } else if (quote.items && Array.isArray(quote.items) && quote.items.length > 0) {
    // Förstrukturerade-rader-eran (legacy `quotes.items` JSONB) — samma
    // konvertering som AI-genererade rader använder, men sourceIsAi=false
    // (default) så inga Kvittoprincipen Fall 3-flaggor (ai_price_missing/
    // ai_uncertain) sätts på en gammal, redan-sparad offert.
    // quote.rot_rut_type är offertens (den eran) helhets-avdragstyp.
    items = generatedQuoteToQuoteItems(quote.items, null, quote.rot_rut_type, false)
  }

  const notIncluded = quote.not_included || ''
  const ataTerms = quote.ata_terms || ''
  const paymentTermsText = quote.payment_terms_text || ''
  const hasAnyStandardText = !!(quote.not_included || quote.ata_terms || quote.payment_terms_text)

  const loadedReservations: ReservationSnapshotEntry[] = Array.isArray(quote.reservations_snapshot)
    ? quote.reservations_snapshot
    : []

  const attachments: LoadedEditQuote['attachments'] = Array.isArray(quote.attachments)
    ? quote.attachments
    : []

  const hasPaymentPlan = !!(quote.payment_plan && Array.isArray(quote.payment_plan) && quote.payment_plan.length > 0)

  const qStyle = quote.template_style as 'modern' | 'premium' | 'friendly' | null | undefined
  const templateStyle = qStyle && ['modern', 'premium', 'friendly'].includes(qStyle) ? qStyle : null

  return {
    selectedCustomer: quote.customer_id || '',
    title: quote.title || '',
    description: quote.description || '',
    quoteStatus: quote.status || 'draft',
    quoteNumber: quote.quote_number || '',
    items,
    notIncluded,
    ataTerms,
    paymentTermsText,
    // Egen 'Villkor'-text per offert (pilot-feedback 2026-05-20) — samma
    // fält som new-sidan skriver till via termsText.
    termsText: (quote as any).terms_text || '',
    hasAnyStandardText,
    loadedReservations,
    attachments,
    paymentPlan: hasPaymentPlan ? quote.payment_plan : [],
    hasPaymentPlan,
    referencePerson: quote.reference_person || '',
    customerReference: quote.customer_reference || '',
    projectAddress: quote.project_address || '',
    detailLevel: (quote.detail_level || 'detailed') as DetailLevel,
    showUnitPrices: quote.show_unit_prices ?? true,
    showQuantities: quote.show_quantities ?? true,
    templateStyle,
    personnummer: quote.personnummer || '',
    fastighetsbeteckning: quote.fastighetsbeteckning || '',
    discountPercent: quote.discount_percent || 0,
    validDays: computeValidDays(quote.valid_until, quote.created_at),
  }
}
