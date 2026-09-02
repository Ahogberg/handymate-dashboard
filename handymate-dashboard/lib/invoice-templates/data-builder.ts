import type { InvoiceStatus, InvoiceTemplateData, InvoiceTemplateItem, InvoiceTemplateItemType } from './types'
import { formatDateLong } from '@/lib/document-html'
import { buildAttribution } from '@/lib/branding/attribution'

const KNOWN_ITEM_TYPES: InvoiceTemplateItemType[] = ['item', 'heading', 'text', 'subtotal', 'discount']

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
 * FACIT-BUGG (ETAPP 6d, offert-masterplan.md, faktura-sprinten — "6b-
 * flaggan"): tidigare kortslöt denna funktion vid invoice_type==='reminder'
 * och returnerade daysOverdue=0 UTAN att någonsin titta på due_date — dvs
 * INNAN förfallodagarna räknades. En påminnelsefaktura (dokumentet som
 * SKICKAS som en påminnelse) som faktiskt var långt förfallen fick alltså
 * daysOverdue=0 → lateInterest (nedan) blev felaktigt 0 kr trots att
 * fakturan var t.ex. 20 dagar sen.
 *
 * Fixen: räkna daysOverdue EN gång, alltid utifrån due_date (oavsett
 * invoice_type) — grenen på invoice_type väljer bara vilket `status`-namn
 * som rapporteras (påminnelsefakturor visar 'reminder' i UI:t istället för
 * 'overdue'), men bär nu med sig den RIKTIGA förfallodagsräkningen istället
 * för att tvinga fram 0. Ren funktion — se tests/invoice-derive-status.spec.ts.
 */
export function deriveStatus(invoice: any): { status: InvoiceStatus; daysOverdue: number } {
  // customer_paid (ROT/RUT, kundens del betald) visas för kunden som Betald:
  // kundens skuld är reglerad, resten begärs från Skatteverket.
  if (invoice.status === 'paid' || invoice.status === 'customer_paid' || invoice.paid_at) return { status: 'paid', daysOverdue: 0 }

  const due = invoice.due_date ? new Date(invoice.due_date) : null
  const daysOverdue = due && due.getTime() < Date.now()
    ? Math.ceil((Date.now() - due.getTime()) / (1000 * 60 * 60 * 24))
    : 0

  if (invoice.invoice_type === 'reminder') return { status: 'reminder', daysOverdue }
  if (daysOverdue > 0) return { status: 'overdue', daysOverdue }
  return { status: 'unpaid', daysOverdue: 0 }
}

/**
 * Bygger ett InvoiceTemplateData-objekt från DB-rad + business-config.
 * Beräknar status, dröjsmålsränta, slutbelopp.
 *
 * @param swishQrDataUrl  Base64 QR-bild från /lib/swish-qr.ts (frivilligt — om null skippar mallen Swish-QR-rendering).
 *
 * ETAPP 6a: returnerar `InvoiceTemplateData & { docType: 'invoice' }` —
 * docType-diskriminanten som dokumentmotorn (components/quotes/document/
 * QuoteDocument.tsx, MoneyDocumentData-unionen) kräver. Strukturellt
 * kompatibel med InvoiceTemplateData (premium.ts/friendly.ts's
 * InvoiceTemplateRenderFn-parameter) — extra-fältet stör inte de gamla
 * mallsträngarna, de läser bara det de känner till.
 */
export function buildInvoiceTemplateData(
  invoice: any,
  config: any,
  swishQrDataUrl?: string | null,
): InvoiceTemplateData & { docType: 'invoice' } {
  // ── Items ──────────────────────────────────────────────────────
  // ETAPP 6a (offert-masterplan.md, faktura-sprinten): tidigare filtrerade
  // denna funktion bort heading/text-rader helt och behandlade ALLA rader
  // som 'item' (kvantitet × à-pris) — subtotal/discount-rader fick alltså
  // fel belopp (t.ex. en delsumma-rad visade "0 × 0 kr = <lagrad total>"
  // istället för sin egen semantik). FACIT för rätt semantik var den döda
  // koden i den gamla app/api/invoices/pdf/route.ts (renderInvoiceItems,
  // nu raderad efter att pariteten verifierats — se
  // tests/invoice-document-parity.spec.ts): subtotal-rader behåller sin
  // LAGRADE total (inte kvantitet×pris), discount-rader normaliseras till
  // NEGATIV total (mallarna visar "−X kr" oavsett lagrat tecken) — exakt
  // samma normalisering som offertens data-builder redan gjorde för
  // 'discount' (se buildQuoteTemplateData ovan i systran-filen).
  const rawItems: any[] = invoice.items || []
  const items: InvoiceTemplateItem[] = rawItems.map(i => {
    const itemType: InvoiceTemplateItemType =
      KNOWN_ITEM_TYPES.includes(i.item_type) ? i.item_type : 'item'
    const quantity = Number(i.quantity ?? i.qty ?? 0)
    const unitPrice = Number(i.unit_price ?? i.price ?? 0)
    let total = Number(i.total ?? (quantity * unitPrice))
    if (itemType === 'discount') {
      total = -Math.abs(total)
    } else if (itemType === 'heading' || itemType === 'text') {
      total = 0
    }
    return {
      itemType,
      id: i.id,
      name: i.description || i.name || '',
      description: i.long_description || null,
      quantity: itemType === 'item' || itemType === 'discount' ? (quantity || 1) : quantity,
      unit: unitLabel(i.unit),
      unitPrice,
      total,
      // Etapp 6 (multi-employee-parity-plan.md): vem som utförde arbetet —
      // sattes redan på raden av from-time-entries/create-invoice-kärnan
      // men renderades ingenstans innan denna etapp (masterplan-fyndet).
      performedByName: i.performed_by_name ?? null,
    }
  })

  // ── Status + sen-dagar ─────────────────────────────────────────
  const { status, daysOverdue } = deriveStatus(invoice)

  // ── Totals ─────────────────────────────────────────────────────
  const subtotalExVat = Number(invoice.subtotal || (invoice.total ? invoice.total / 1.25 : 0))
  const vatRate = Number(invoice.vat_rate || 25)
  const vatAmount = Number(invoice.vat_amount || (subtotalExVat * vatRate / 100))
  const totalIncVat = Number(invoice.total || (subtotalExVat + vatAmount))

  // ROT/RUT
  const rotRutType: 'rot' | 'rut' | null = invoice.rot_rut_type || null
  const rotRutDeduction = Number(invoice.rot_rut_deduction || 0)
  const rotDeduction = rotRutType === 'rot' ? rotRutDeduction : undefined
  const rutDeduction = rotRutType === 'rut' ? rotRutDeduction : undefined

  // Sen avgift + dröjsmålsränta
  const lateInterestRate = Number(config?.penalty_interest || config?.late_fee_percent || 8)
  const reminderFee = invoice.reminder_count && invoice.reminder_count > 0
    ? Number(config?.reminder_fee || 60)
    : 0

  // Beräkna basbelopp att räkna ränta på (efter ROT)
  const baseAmount = invoice.customer_pays != null
    ? Number(invoice.customer_pays)
    : (rotRutDeduction > 0 ? totalIncVat - rotRutDeduction : totalIncVat)

  const lateInterest = daysOverdue > 0
    ? Math.round(baseAmount * (lateInterestRate / 100) * (daysOverdue / 365) * 100) / 100
    : 0

  const amountToPay = baseAmount + lateInterest + reminderFee

  // ── Datum ──────────────────────────────────────────────────────
  const invoiceDate = formatDateLong(invoice.invoice_date || invoice.created_at)
  const dueDate = formatDateLong(invoice.due_date)
  const paidDate = invoice.paid_at ? formatDateLong(invoice.paid_at) : null

  // ── Customer ───────────────────────────────────────────────────
  const cust = invoice.customer || {}
  const custAddressFull = cust.address_line || cust.address || null
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

  // ── Title ──────────────────────────────────────────────────────
  let title = invoice.description || 'Utfört arbete'
  if (invoice.is_credit_note) title = `Kreditfaktura — ${title}`
  else if (invoice.invoice_type === 'reminder') title = `Påminnelse — ${title}`
  else if (invoice.invoice_type === 'partial') title = `Delfaktura ${invoice.partial_number || ''} — ${title}`

  // ── Rabatt (global %) ────────────────────────────────────────────
  const discountPercent = invoice.discount_percent ? Number(invoice.discount_percent) : undefined
  const discountAmount = invoice.discount_amount ? Number(invoice.discount_amount) : undefined

  return {
    docType: 'invoice',
    business: {
      name: config?.business_name || 'Företag',
      orgNumber: config?.org_number || '',
      address: config?.address || config?.service_area || '',
      contactName: config?.contact_name || '',
      phone: config?.contact_phone || config?.phone_number || '',
      email: config?.contact_email || '',
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
      personnummer: invoice.personnummer || cust.personal_number || null,
      reference: invoice.your_reference || null,
    },
    invoice: {
      number: invoice.invoice_number || (invoice.invoice_id ? String(invoice.invoice_id).substring(0, 8).toUpperCase() : ''),
      invoiceDate,
      dueDate,
      paidDate,
      status,
      daysOverdue,
      ocrNumber: invoice.ocr_number || invoice.invoice_number || '',
      title,
      description: invoice.introduction_text || invoice.description || null,
      items,
      subtotalExVat,
      discountPercent,
      discountAmount,
      vatAmount,
      vatRate,
      totalIncVat,
      rotDeduction,
      rutDeduction,
      rotRutType,
      lateInterest: lateInterest > 0 ? lateInterest : undefined,
      lateInterestRate,
      reminderFee: reminderFee > 0 ? reminderFee : undefined,
      amountToPay,
      paymentTerms: invoice.payment_terms_text || config?.default_invoice_terms || '30 dagar netto',
      introductionText: invoice.introduction_text || null,
      conclusionText: invoice.conclusion_text || null,
      quoteReference: invoice.quote_number || null,
      ourReference: invoice.our_reference || config?.contact_name || null,
      yourReference: invoice.your_reference || null,
      bankgiro: invoice.bankgiro_number || config?.bankgiro || null,
      plusgiro: invoice.plusgiro_number || config?.plusgiro || null,
      // Kreditfaktura — ETAPP 6a punkt (d): facit är den döda koden i den
      // gamla pdf-routen (generateInvoiceHTML), som skickade BÅDE
      // is_credit_note/credit_reason (renderades) OCH original_invoice_id
      // (accepterades av lib/pdf-generator.ts men aldrig renderades där
      // heller — se rapporten). Vi läser samma kolumn
      // (invoice.original_invoice_id, INTE credit_for_invoice_id — se
      // types.ts-kommentaren för varför) men gör ingen extra join för att
      // slå upp originalfakturans NUMMER; fältet bär det råa id:t tills
      // ett eventuellt fast-follow lägger till uppslaget.
      isCreditNote: !!invoice.is_credit_note,
      creditReason: invoice.credit_reason || null,
      originalInvoiceId: invoice.original_invoice_id || invoice.credit_for_invoice_id || null,
    },
    swishQrDataUrl: swishQrDataUrl || null,
    // Stämpeln: rätt direkt när config är hela business_config-raden
    // (select('*')). Anropare med explicit kolumnlista skriver över med
    // loadAttribution — kolumnen får ALDRIG läggas i en kolumnlista
    // (PostgREST fäller hela selecten före sql/v202).
    attribution: buildAttribution(config),
  }
}
