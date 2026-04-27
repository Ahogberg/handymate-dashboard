import type { InvoiceStatus, InvoiceTemplateData, InvoiceTemplateItem } from './types'
import { formatDateLong } from '@/lib/document-html'

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

function deriveStatus(invoice: any): { status: InvoiceStatus; daysOverdue: number } {
  if (invoice.status === 'paid' || invoice.paid_at) return { status: 'paid', daysOverdue: 0 }
  if (invoice.invoice_type === 'reminder') return { status: 'reminder', daysOverdue: 0 }

  const due = invoice.due_date ? new Date(invoice.due_date) : null
  if (due && due.getTime() < Date.now()) {
    const days = Math.ceil((Date.now() - due.getTime()) / (1000 * 60 * 60 * 24))
    return { status: 'overdue', daysOverdue: days }
  }
  return { status: 'unpaid', daysOverdue: 0 }
}

/**
 * Bygger ett InvoiceTemplateData-objekt från DB-rad + business-config.
 * Beräknar status, dröjsmålsränta, slutbelopp.
 *
 * @param swishQrDataUrl  Base64 QR-bild från /lib/swish-qr.ts (frivilligt — om null skippar mallen Swish-QR-rendering).
 */
export function buildInvoiceTemplateData(
  invoice: any,
  config: any,
  swishQrDataUrl?: string | null,
): InvoiceTemplateData {
  // ── Items ──────────────────────────────────────────────────────
  const rawItems: any[] = invoice.items || []
  const items: InvoiceTemplateItem[] = rawItems
    .filter(i => i.item_type !== 'heading' && i.item_type !== 'text')
    .map(i => ({
      name: i.description || i.name || '',
      description: i.long_description || null,
      quantity: Number(i.quantity || i.qty || 1),
      unit: unitLabel(i.unit),
      unitPrice: Number(i.unit_price || i.price || 0),
      total: Number(i.total || (Number(i.quantity || i.qty || 1) * Number(i.unit_price || i.price || 0))),
    }))

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

  return {
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
      isCreditNote: !!invoice.is_credit_note,
    },
    swishQrDataUrl: swishQrDataUrl || null,
  }
}
