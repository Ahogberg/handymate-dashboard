import type { QuoteTemplateData, QuoteTemplateItem, QuoteTemplateComponent } from './types'
import { formatDateLong } from '@/lib/document-html'
import { resolveDisplayLevel, displayLevelToColumns, groupItemsForSummary } from '@/lib/quotes/display-level'

const DEFAULT_ACCENT = '#0F766E'

function unitLabel(unit: string | null | undefined): string {
  switch ((unit || '').toLowerCase()) {
    case 'hour':
    case 'h':
    case 'tim':
      return 'tim'
    case 'piece':
    case 'st':
      return 'st'
    case 'm2':
      return 'm²'
    case 'm':
      return 'm'
    case 'lm':
      return 'lm'
    case 'pauschal':
      return 'pauschal'
    case 'kg':
      return 'kg'
    case 'l':
      return 'l'
    default:
      return unit || 'st'
  }
}

/**
 * Per-rad-override (show_components_to_customer): plocka ut komponentspecen ur
 * component_snapshot som FÅR visas för kunden. ALDRIG interna kostnader
 * (unit_cost) — bara beskrivning + mängd per enhet + enhet. Returnerar undefined
 * när flaggan är av eller snapshot saknas.
 */
function extractCustomerComponents(i: any): QuoteTemplateComponent[] | undefined {
  if (i?.show_components_to_customer !== true) return undefined
  const snap = i?.component_snapshot
  const comps = Array.isArray(snap?.components) ? snap.components : null
  if (!comps || comps.length === 0) return undefined
  return comps.map((c: any): QuoteTemplateComponent => ({
    description: String(c?.description ?? ''),
    quantityPerUnit: Number(c?.quantity_per_unit ?? 0),
    unit: String(c?.unit ?? ''),
  }))
}

function plus30Days(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  d.setDate(d.getDate() + 30)
  return d.toISOString()
}

/**
 * Bygger ett unified data-objekt som mall-renderarna konsumerar.
 * Hanterar både legacy items-JSONB och nya quote_items-rader,
 * samt ROT/RUT-avdrag och alla varianter av betalnings-/garantitext.
 */
export function buildQuoteTemplateData(
  quote: any,
  business: any,
  config: any,
): QuoteTemplateData {
  // ── Items ──────────────────────────────────────────────────────
  const structured: any[] = quote.quote_items || []
  let items: QuoteTemplateItem[] = []

  if (structured.length > 0) {
    // Mappa ALLA radtyper i ursprunglig ordning — rubriker, fritext,
    // delsummor och rabatter är del av dokumentet, inte bara 'item'-rader.
    const knownTypes = ['item', 'heading', 'text', 'subtotal', 'discount', 'option']
    items = structured.map(i => {
      const itemType: QuoteTemplateItem['itemType'] =
        knownTypes.includes(i.item_type) ? i.item_type : 'item'
      const quantity = Number(i.quantity || 0)
      const unitPrice = Number(i.unit_price || 0)
      let total = Number(i.total || quantity * unitPrice)
      if (itemType === 'discount') {
        // recalculateItems lagrar rabatt-total negativt, men normalisera
        // oavsett lagrat tecken så mallarna alltid kan visa "−X kr"
        total = -Math.abs(total)
      }
      return {
        itemType,
        // Endast tillvalsrader: kundens val (☑/☐) — quote_items.option_selected
        optionSelected: itemType === 'option' ? i.option_selected === true : undefined,
        name: i.description || '',
        description: i.long_description || null,
        quantity,
        unit: unitLabel(i.unit),
        unitPrice,
        total,
        isRotEligible: !!i.is_rot_eligible || i.rot_rut_type === 'rot',
        isRutEligible: !!i.is_rut_eligible || i.rot_rut_type === 'rut',
        // Per-rad-override: visa komponentbeskrivningar (ALDRIG unit_cost) när
        // hantverkaren aktivt slagit på det. Töms i 'summary' (rader visas ej).
        components: extractCustomerComponents(i),
      }
    })
  } else {
    // Legacy: items JSONB array med { type, description, qty, price, total }
    const legacy: any[] = quote.items || []
    items = legacy.map(i => ({
      itemType: 'item' as const,
      name: i.description || i.name || '',
      description: i.long_description || null,
      quantity: Number(i.qty || i.quantity || 1),
      unit: unitLabel(i.unit),
      unitPrice: Number(i.price || i.unit_price || 0),
      total: Number(i.total || (Number(i.qty || 1) * Number(i.price || 0))),
      isRotEligible: i.type === 'labor',
      isRutEligible: false,
    }))
  }

  // ── Visningsnivå (Del C) — filtrera/transformera INNAN mallarna ──
  // EN sanning: resolveDisplayLevel + displayLevelToColumns. 'summary' ersätter
  // radlistan med gruppsummor (+ tillval som egna rader); 'rows' behåller rader
  // men mallarna döljer antal/à-pris via kolumnflaggorna; 'full' är oförändrat.
  const displayLevel = resolveDisplayLevel({
    detail_level: quote.detail_level,
    show_unit_prices: quote.show_unit_prices,
  })
  const cols = displayLevelToColumns(displayLevel)

  if (displayLevel === 'summary') {
    // Gruppera på strukturerade rader (samma källa som mallarna fick).
    const { groups, options } = groupItemsForSummary(structured.length > 0 ? structured : (quote.items || []))
    const groupRows: QuoteTemplateItem[] = groups.map(g => ({
      itemType: 'subtotal',
      isGroup: true,
      name: g.heading,
      quantity: 0,
      unit: '',
      unitPrice: 0,
      total: g.total,
    }))
    // Tillval återbyggs från structured-raderna med fulla fält (kundens val).
    const optionRows: QuoteTemplateItem[] = options.map(o => ({
      itemType: 'option',
      optionSelected: o.option_selected === true,
      name: o.description || '',
      description: o.long_description || null,
      quantity: Number(o.quantity || 0),
      unit: unitLabel(o.unit),
      unitPrice: Number(o.unit_price || 0),
      total: Number(o.total || 0),
      isRotEligible: !!o.is_rot_eligible || o.rot_rut_type === 'rot',
      isRutEligible: !!o.is_rut_eligible || o.rot_rut_type === 'rut',
    }))
    items = [...groupRows, ...optionRows]
  } else if (displayLevel === 'rows') {
    // Rad för rad: behåll radtotal, men nolla ut antal/à-pris-signalen och töm
    // komponentspecar? Nej — komponentspecar visas i 'rows' också (per plan).
    // Kolumnvisningen styrs av flaggorna nedan; datat lämnas intakt så radtotal
    // finns kvar. (Vi rör inte quantity/unitPrice-värdena — mallen döljer dem.)
    // Ingen items-transform behövs.
  }

  // ── Totals ─────────────────────────────────────────────────────
  const subtotalExVat = Number(quote.subtotal || (quote.total ? quote.total / 1.25 : 0))
  const vatRate = Number(quote.vat_rate || 25)
  const vatAmount = Number(quote.vat_amount || (subtotalExVat * vatRate / 100))
  const totalIncVat = Number(quote.total || (subtotalExVat + vatAmount))

  const rotDeduction = Number(
    quote.rot_deduction || quote.rot_rut_deduction || 0,
  )
  const rutDeduction = Number(quote.rut_deduction || 0)

  let amountToPay = totalIncVat
  if (rotDeduction > 0) {
    amountToPay = Number(quote.rot_customer_pays || quote.customer_pays || (totalIncVat - rotDeduction))
  } else if (rutDeduction > 0) {
    amountToPay = Number(quote.rut_customer_pays || quote.customer_pays || (totalIncVat - rutDeduction))
  } else if (quote.customer_pays) {
    amountToPay = Number(quote.customer_pays)
  }

  // ── Datum ──────────────────────────────────────────────────────
  const issuedDate = formatDateLong(quote.created_at) || formatDateLong(new Date().toISOString())
  const validIso = quote.valid_until || plus30Days(quote.created_at) || plus30Days(new Date().toISOString())
  const validUntilDate = formatDateLong(validIso)

  // ── Customer ───────────────────────────────────────────────────
  const cust = quote.customer || {}
  const custAddressFull = cust.address_line || cust.address || null
  // Adressen kan vara en sträng "Storgatan 1, 123 45 Stockholm" eller separata fält.
  // Försöker dela upp om kommatecken finns; annars lämnas adressen som en rad.
  let custAddress: string | null = null
  let custPostal: string | null = null
  let custCity: string | null = null
  if (custAddressFull) {
    const parts = String(custAddressFull).split(',').map(s => s.trim())
    custAddress = parts[0] || null
    if (parts.length > 1) {
      const cityPart = parts.slice(1).join(', ')
      const m = cityPart.match(/^(\d{3}\s?\d{2})\s+(.+)$/)
      if (m) {
        custPostal = m[1]
        custCity = m[2]
      } else {
        custCity = cityPart
      }
    }
  }
  custPostal = custPostal || cust.postal_code || cust.zip_code || null
  custCity = custCity || cust.city || null

  // ── Business ───────────────────────────────────────────────────
  const businessName = config?.business_name || business?.business_name || 'Företag'
  const businessAddress = config?.address || business?.address || ''

  return {
    // Signerad/accepterad offert → tillvals-valen är låsta; mallarna
    // döljer då "Välj dina tillval i kundportalen"-noten.
    isSigned: quote.status === 'accepted' || !!quote.signed_at,
    displayLevel,
    showQuantities: cols.showQuantities,
    showUnitPrices: cols.showUnitPrices,
    business: {
      name: businessName,
      orgNumber: config?.org_number || business?.org_number || '',
      address: businessAddress,
      contactName: config?.contact_name || business?.contact_name || '',
      phone: config?.phone_number || business?.phone_number || '',
      email: config?.contact_email || business?.contact_email || '',
      website: config?.website || null,
      bankgiro: config?.bankgiro || null,
      plusgiro: config?.plusgiro || null,
      swish: config?.swish_number || null,
      fSkatt: !!config?.f_skatt_registered,
      momsRegnr: config?.vat_number || null,
      accentColor: config?.accent_color || DEFAULT_ACCENT,
      logoUrl: config?.logo_url || null,
      tagline: config?.tagline || config?.service_area || null,
    },
    customer: {
      name: cust.name || 'Kund',
      address: custAddress,
      postalCode: custPostal,
      city: custCity,
      phone: cust.phone_number || cust.phone || null,
      email: cust.email || null,
      personnummer: quote.personnummer || cust.personnummer || null,
      reference: quote.customer_reference || null,
    },
    quote: {
      number: quote.quote_number || (quote.quote_id ? String(quote.quote_id).substring(0, 8).toUpperCase() : ''),
      // Vi sätter dealNumber från ett resolverat dealReference-fält som PDF-routen
      // injicerar (eller direkt på quote-objektet vid preview)
      dealNumber: quote.deal_number != null ? `#${quote.deal_number}` : (quote.dealReference || null),
      issuedDate,
      validUntilDate,
      title: quote.title || 'Offert',
      description: quote.description || null,
      items,
      subtotalExVat,
      vatAmount,
      totalIncVat,
      rotDeduction: rotDeduction > 0 ? rotDeduction : undefined,
      rutDeduction: rutDeduction > 0 ? rutDeduction : undefined,
      amountToPay,
      // Pilot-feedback 2026-05-20: ta bort hardcoded '30 dagar netto'-default.
      // Använd quote.payment_terms_text (offert-specifik), annars customer's
      // default_payment_days om finns ('X dagar'), annars business-default.
      // Som SISTA fallback: tom — INTE '30 dagar netto' utan kontext.
      paymentTerms: quote.payment_terms_text
        || (quote.customer?.default_payment_days
          ? `${quote.customer.default_payment_days} dagar`
          : config?.default_quote_terms || ''),
      warrantyText: quote.warranty_text || null,
      introductionText: quote.introduction_text || null,
      conclusionText: quote.conclusion_text || null,
      notIncluded: quote.not_included || null,
      termsText: quote.terms_text || null,
    },
  }
}
