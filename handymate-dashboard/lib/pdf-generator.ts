import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { generateOCR } from '@/lib/ocr'

interface InvoiceItem {
  description: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  type?: string
  item_type?: string
  is_rot_eligible?: boolean
  is_rut_eligible?: boolean
  group_name?: string
}

interface InvoiceData {
  invoice_number: string
  invoice_date: string
  due_date: string
  status: string
  items: InvoiceItem[]
  subtotal: number
  vat_rate: number
  vat_amount: number
  total: number
  rot_rut_type?: string | null
  rot_rut_deduction?: number | null
  customer_pays?: number | null
  is_credit_note?: boolean
  credit_reason?: string | null
  original_invoice_id?: string | null
  personnummer?: string | null
  fastighetsbeteckning?: string | null
  ocr_number?: string | null
  our_reference?: string | null
  your_reference?: string | null
  invoice_type?: string
  customer?: {
    name: string
    phone_number?: string
    email?: string | null
    address_line?: string | null
  }
}

interface BusinessData {
  business_name?: string
  org_number?: string
  contact_email?: string
  contact_phone?: string
  address?: string
  bankgiro?: string
  plusgiro?: string
  swish_number?: string
  swish_qr?: string
  bank_account_number?: string
  f_skatt_registered?: boolean
  accent_color?: string
  invoice_footer_text?: string
  penalty_interest?: number
}

function formatSEK(amount: number | null | undefined): string {
  if (amount == null) return '0 kr'
  return amount.toLocaleString('sv-SE') + ' kr'
}

// Design tokens (matches document-html.ts)
const ACCENT_RGB = [15, 118, 110] as const   // #0F766E
const TEXT_PRIMARY = [30, 41, 59] as const    // #1E293B
const TEXT_SECONDARY = [148, 163, 184] as const // #94A3B8
const TEXT_MUTED = [100, 116, 139] as const   // #64748B
const LABEL_COLOR = [203, 213, 225] as const  // #CBD5E1
const BORDER_COLOR = [226, 232, 240] as const // #E2E8F0
const SEPARATOR = [241, 245, 249] as const    // #F1F5F9

export function generateInvoicePDF(invoice: InvoiceData, business: BusinessData): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  const contentWidth = pageWidth - margin * 2
  let y = margin

  // Determine title
  const invoiceType = invoice.invoice_type || 'standard'
  let title = 'FAKTURA'
  if (invoice.is_credit_note || invoiceType === 'credit') title = 'KREDITFAKTURA'
  else if (invoiceType === 'reminder') title = 'PÅMINNELSE'
  else if (invoiceType === 'partial') title = 'DELFAKTURA'

  // ── Header ──
  // Company name (left) — weight 500 equivalent
  doc.setFontSize(16)
  doc.setTextColor(...TEXT_PRIMARY)
  doc.text(business.business_name || 'Företag', margin, y + 6)

  // Contact info below company name
  doc.setFontSize(9)
  doc.setTextColor(...TEXT_SECONDARY)
  const companyLines = [
    [business.contact_phone, business.contact_email].filter(Boolean).join(' · '),
    business.address || '',
  ].filter(Boolean)
  companyLines.forEach((line, i) => {
    doc.text(line, margin, y + 12 + i * 4)
  })

  // Document type label (right, uppercase, teal)
  doc.setFontSize(8)
  doc.setTextColor(...ACCENT_RGB)
  doc.text(title, pageWidth - margin, y + 3, { align: 'right' })

  // Document number (right, larger)
  doc.setFontSize(18)
  doc.setTextColor(...TEXT_PRIMARY)
  doc.text(invoice.invoice_number, pageWidth - margin, y + 11, { align: 'right' })

  if (invoice.is_credit_note && invoice.credit_reason) {
    doc.setFontSize(8)
    doc.setTextColor(220, 38, 38)
    doc.text(`Anledning: ${invoice.credit_reason}`, pageWidth - margin, y + 17, { align: 'right' })
  }

  // ── Teal line ──
  y += 24
  doc.setDrawColor(...ACCENT_RGB)
  doc.setLineWidth(0.15)
  doc.line(margin, y, pageWidth - margin, y)
  y += 10

  // ── Meta row (3 columns) ──
  const colW = contentWidth / 3

  // Column 1: Faktureras till
  doc.setFontSize(7)
  doc.setTextColor(...LABEL_COLOR)
  doc.text('FAKTURERAS TILL', margin, y)
  doc.setFontSize(10)
  doc.setTextColor(...TEXT_PRIMARY)
  let my = y + 5
  doc.text(invoice.customer?.name || 'Kund', margin, my)
  doc.setFontSize(9)
  if (invoice.customer?.address_line) { my += 4; doc.text(invoice.customer.address_line, margin, my) }
  if (invoice.customer?.phone_number) { my += 4; doc.text(invoice.customer.phone_number, margin, my) }

  // Column 2: Dates
  const dateX = margin + colW
  doc.setFontSize(7)
  doc.setTextColor(...LABEL_COLOR)
  doc.text('FAKTURADATUM', dateX, y)
  doc.setFontSize(10)
  doc.setTextColor(...TEXT_PRIMARY)
  doc.text(new Date(invoice.invoice_date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' }), dateX, y + 5)

  doc.setFontSize(7)
  doc.setTextColor(...LABEL_COLOR)
  doc.text('FÖRFALLODATUM', dateX, y + 13)
  doc.setFontSize(10)
  doc.setTextColor(...ACCENT_RGB) // Teal highlight
  doc.text(new Date(invoice.due_date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' }), dateX, y + 18)

  // Column 3: References
  const refX = margin + colW * 2
  const ocrNumber = invoice.ocr_number || generateOCR(invoice.invoice_number || '')
  doc.setFontSize(7)
  doc.setTextColor(...LABEL_COLOR)
  doc.text('OCR-NUMMER', refX, y)
  doc.setFontSize(10)
  doc.setTextColor(...TEXT_PRIMARY)
  doc.text(ocrNumber, refX, y + 5)

  if (invoice.our_reference) {
    doc.setFontSize(7)
    doc.setTextColor(...LABEL_COLOR)
    doc.text('VÅR REFERENS', refX, y + 13)
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_PRIMARY)
    doc.text(invoice.our_reference, refX, y + 18)
  }

  y += 28

  // ── ROT/RUT notice (subtle) ──
  if (invoice.rot_rut_type) {
    doc.setFontSize(9)
    doc.setTextColor(...ACCENT_RGB)
    doc.text(
      `${invoice.rot_rut_type.toUpperCase()}-avdrag: ${formatSEK(invoice.rot_rut_deduction)} begärs hos Skatteverket. Att betala: ${formatSEK(invoice.customer_pays)}.`,
      margin, y,
      { maxWidth: contentWidth }
    )
    if (invoice.personnummer) {
      y += 5
      doc.setFontSize(8)
      doc.setTextColor(...TEXT_MUTED)
      doc.text(`Personnummer: ${invoice.personnummer}${invoice.fastighetsbeteckning ? ` · Fastighet: ${invoice.fastighetsbeteckning}` : ''}`, margin, y)
    }
    y += 8
  }

  // ── Section title ──
  doc.setFontSize(7)
  doc.setTextColor(...LABEL_COLOR)
  doc.text('SPECIFIKATION', margin, y)
  y += 4

  // ── Items table ──
  const displayItems = invoice.items || []
  const tableBody: any[][] = []

  for (const item of displayItems) {
    const itemType = item.item_type || 'item'

    if (itemType === 'heading') {
      tableBody.push([{ content: item.description, colSpan: 5, styles: { fontStyle: 'bold', textColor: TEXT_PRIMARY } }])
    } else if (itemType === 'text') {
      tableBody.push([{ content: item.description, colSpan: 5, styles: { fontStyle: 'italic', textColor: [...TEXT_SECONDARY] } }])
    } else if (itemType === 'subtotal') {
      tableBody.push([
        { content: '', colSpan: 3 },
        { content: item.description || 'Delsumma', styles: { fontStyle: 'bold' } },
        { content: formatSEK(item.total), styles: { fontStyle: 'bold', halign: 'right' as const } },
      ])
    } else if (itemType === 'discount') {
      tableBody.push([
        { content: item.description, styles: { textColor: [...ACCENT_RGB] } },
        { content: String(item.quantity), styles: { textColor: [...ACCENT_RGB] } },
        { content: item.unit, styles: { textColor: [...ACCENT_RGB] } },
        { content: formatSEK(Math.abs(item.unit_price)), styles: { textColor: [...ACCENT_RGB] } },
        { content: `-${formatSEK(Math.abs(item.total))}`, styles: { textColor: [...ACCENT_RGB], halign: 'right' as const } },
      ])
    } else {
      tableBody.push([
        item.description + (item.is_rot_eligible ? ' [ROT]' : item.is_rut_eligible ? ' [RUT]' : ''),
        String(item.quantity),
        item.unit,
        formatSEK(item.unit_price),
        formatSEK(item.total),
      ])
    }
  }

  autoTable(doc, {
    startY: y,
    head: [['Beskrivning', 'Antal', 'Enhet', 'Pris/enhet', 'Summa']],
    body: tableBody,
    theme: 'plain',
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [...LABEL_COLOR],
      fontSize: 7,
      fontStyle: 'normal',
      cellPadding: { top: 2, bottom: 4, left: 0, right: 0 },
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [...TEXT_PRIMARY],
      cellPadding: { top: 3, bottom: 3, left: 0, right: 0 },
      lineColor: [...SEPARATOR],
      lineWidth: { bottom: 0.2 },
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 18 },
      2: { halign: 'right', cellWidth: 18 },
      3: { halign: 'right', cellWidth: 28 },
      4: { halign: 'right', cellWidth: 28 },
    },
    didParseCell: (data: any) => {
      // No border on the last row
      if (data.row.index === tableBody.length - 1 && data.section === 'body') {
        data.cell.styles.lineWidth = { bottom: 0 }
      }
    },
  })

  y = (doc as any).lastAutoTable.finalY + 8

  // ── Totals (right-aligned) ──
  const totalsW = 65
  const totalsX = pageWidth - margin - totalsW

  const drawTotalRow = (label: string, value: string, options?: { teal?: boolean; bold?: boolean; topLine?: boolean }) => {
    if (options?.topLine) {
      doc.setDrawColor(...BORDER_COLOR)
      doc.setLineWidth(0.15)
      doc.line(totalsX, y - 1, totalsX + totalsW, y - 1)
      y += 3
    }
    doc.setFontSize(options?.bold ? 11 : 9)
    const color = options?.teal ? ACCENT_RGB : options?.bold ? TEXT_PRIMARY : TEXT_MUTED
    doc.setTextColor(color[0], color[1], color[2])
    doc.text(label, totalsX, y)
    doc.text(value, totalsX + totalsW, y, { align: 'right' })
    y += options?.bold ? 7 : 5
  }

  drawTotalRow('Netto exkl. moms', formatSEK(invoice.subtotal))
  drawTotalRow(`Moms ${invoice.vat_rate}%`, formatSEK(invoice.vat_amount))

  if (invoice.rot_rut_type) {
    drawTotalRow(`${invoice.rot_rut_type.toUpperCase()}-avdrag`, `-${formatSEK(invoice.rot_rut_deduction)}`, { teal: true })
  }

  drawTotalRow('Att betala', formatSEK(invoice.rot_rut_type ? invoice.customer_pays : invoice.total), { bold: true, topLine: true })

  y += 4

  // ── Swish / Payment info ──
  if (business.swish_qr) {
    // Light gray background row
    doc.setFillColor(...SEPARATOR)
    doc.roundedRect(margin, y, contentWidth, 24, 3, 3, 'F')

    // QR code
    doc.addImage(business.swish_qr, 'PNG', margin + 5, y + 3, 18, 18)

    // Swish info
    const infoX = margin + 28
    doc.setFontSize(7)
    doc.setTextColor(...LABEL_COLOR)
    doc.text('BETALA MED SWISH', infoX, y + 7)
    doc.setFontSize(10)
    doc.setTextColor(...TEXT_PRIMARY)
    doc.text(business.swish_number || '', infoX, y + 13)
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_SECONDARY)
    doc.text(`Märk betalning: ${invoice.invoice_number}`, infoX, y + 18)

    // Amount (right)
    const finalAmount = invoice.rot_rut_type ? invoice.customer_pays : invoice.total
    doc.setFontSize(16)
    doc.setTextColor(...TEXT_PRIMARY)
    doc.text(formatSEK(finalAmount), pageWidth - margin - 5, y + 11, { align: 'right' })
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_SECONDARY)
    doc.text(`förfaller ${new Date(invoice.due_date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })}`, pageWidth - margin - 5, y + 17, { align: 'right' })

    y += 30
  } else if (business.bankgiro || business.plusgiro) {
    doc.setFillColor(...SEPARATOR)
    doc.roundedRect(margin, y, contentWidth, 18, 3, 3, 'F')

    const payLabel = business.bankgiro ? 'Bankgiro' : 'Plusgiro'
    const payNum = business.bankgiro || business.plusgiro || ''

    doc.setFontSize(7)
    doc.setTextColor(...LABEL_COLOR)
    doc.text(payLabel.toUpperCase(), margin + 5, y + 6)
    doc.setFontSize(10)
    doc.setTextColor(...TEXT_PRIMARY)
    doc.text(payNum, margin + 5, y + 12)

    doc.setFontSize(7)
    doc.setTextColor(...LABEL_COLOR)
    doc.text('OCR', margin + 50, y + 6)
    doc.setFontSize(10)
    doc.setTextColor(...TEXT_PRIMARY)
    doc.text(ocrNumber, margin + 50, y + 12)

    y += 24
  }

  // ── Footer (3 columns) ──
  doc.setDrawColor(...BORDER_COLOR)
  doc.setLineWidth(0.15)
  doc.line(margin, y, pageWidth - margin, y)
  y += 6

  const footerCols = [
    { label: 'BANKGIRO', value: business.bankgiro || '—' },
    { label: 'ORG.NR', value: business.org_number || '' },
    { label: 'F-SKATTSEDEL', value: business.f_skatt_registered ? 'Godkänd' : '—' },
  ]

  const fColW = contentWidth / footerCols.length
  footerCols.forEach((col, i) => {
    const fx = margin + i * fColW
    doc.setFontSize(7)
    doc.setTextColor(...LABEL_COLOR)
    doc.text(col.label, fx, y)
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(col.value, fx, y + 5)
  })

  // Return as Buffer
  const arrayBuffer = doc.output('arraybuffer')
  return Buffer.from(arrayBuffer)
}

// ─────────────────────────────────────────────────────────────────────────────
// OFFERT-PDF (v68) — kundens fullständiga nedladdningsbara arkivkopia.
// Modell: generateInvoicePDF ovan (samma jsPDF-idiom, marginaler, formatSEK).
// PDF:en renderar ALLA rader (respekterar EJ on-screen-visningsnivån) men
// exkluderar tillval som kunden inte valt (option_selected === false).
// ─────────────────────────────────────────────────────────────────────────────

interface QuoteItemRow {
  item_type?: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  is_rot_eligible?: boolean
  is_rut_eligible?: boolean
  option_selected?: boolean | null
}

export interface QuotePdfData {
  quote_number: string
  issued_date?: string | null
  created_at?: string | null
  valid_until?: string | null
  title?: string | null
  description?: string | null
  items: QuoteItemRow[]
  subtotal: number
  vat_rate: number
  vat_amount: number
  total: number
  rot_rut_type?: string | null
  rot_work_cost?: number | null
  rot_deduction?: number | null
  rot_customer_pays?: number | null
  rut_work_cost?: number | null
  rut_deduction?: number | null
  rut_customer_pays?: number | null
  reference_person?: string | null
  personnummer?: string | null
  fastighetsbeteckning?: string | null
  customer?: {
    name: string
    address_line?: string | null
    phone_number?: string | null
    email?: string | null
    personnummer?: string | null
  }
  creator?: {
    name?: string | null
    phone?: string | null
    email?: string | null
  } | null
  introduction_text?: string | null
  conclusion_text?: string | null
  not_included?: string | null
  payment_terms_text?: string | null
}

export interface BusinessPdfData {
  business_name?: string
  org_number?: string
  address?: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  accent_color?: string
  f_skatt_registered?: boolean
  bankgiro?: string
  plusgiro?: string
  swish_number?: string
  /** Base64 data-URI (data:image/png;base64,... eller data:image/jpeg;base64,...), förhämtad av anroparen. */
  logo_base64?: string
  /** Bildformat för logo_base64 — jsPDF addImage kräver PNG eller JPEG. */
  logo_format?: 'PNG' | 'JPEG'
}

/** Konvertera '#0F766E' → [15,118,110]; fallback ACCENT_RGB vid ogiltig input. */
function hexToRgb(hex: string | null | undefined): readonly [number, number, number] {
  if (!hex) return ACCENT_RGB
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return ACCENT_RGB
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function formatDateSv(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function generateQuotePDF(quote: QuotePdfData, business: BusinessPdfData): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  const contentWidth = pageWidth - margin * 2
  let y = margin

  const accent = hexToRgb(business.accent_color)

  // ── Header ──
  // Logga (om tillgänglig och avkodningsbar) ritas till vänster; text för
  // företagsnamn/org.nr/adress flyttas då till höger om loggan. Misslyckas
  // hämtning/avkodning/addImage av någon anledning faller vi tyst tillbaka
  // till samma text-only header som innan denna feature — PDF:en får ALDRIG
  // krascha på grund av loggan.
  let textX = margin
  if (business.logo_base64 && business.logo_format) {
    try {
      const maxW = 35
      const maxH = 14
      let logoW = maxW
      let logoH = maxH
      const props = doc.getImageProperties(business.logo_base64)
      if (props?.width && props?.height) {
        const ratio = props.width / props.height
        logoH = maxH
        logoW = logoH * ratio
        if (logoW > maxW) {
          logoW = maxW
          logoH = logoW / ratio
        }
      }
      doc.addImage(business.logo_base64, business.logo_format, margin, y, logoW, logoH)
      textX = margin + logoW + 4
    } catch (err) {
      console.error('[generateQuotePDF] Kunde inte rita logga i PDF-header:', err)
      textX = margin
    }
  }

  doc.setFontSize(16)
  doc.setTextColor(...TEXT_PRIMARY)
  doc.text(business.business_name || 'Företag', textX, y + 6)

  doc.setFontSize(9)
  doc.setTextColor(...TEXT_SECONDARY)
  const companyLines = [
    business.org_number ? `Org.nr ${business.org_number}` : '',
    business.address || '',
  ].filter(Boolean)
  companyLines.forEach((line, i) => {
    doc.text(line, textX, y + 12 + i * 4)
  })

  // Dokumenttyp (höger, versal, accent)
  doc.setFontSize(8)
  doc.setTextColor(accent[0], accent[1], accent[2])
  doc.text('OFFERT', pageWidth - margin, y + 3, { align: 'right' })

  // Offertnummer (höger, större)
  doc.setFontSize(18)
  doc.setTextColor(...TEXT_PRIMARY)
  doc.text(quote.quote_number || '', pageWidth - margin, y + 11, { align: 'right' })

  // ── Accent-linje ──
  y += 24
  doc.setDrawColor(accent[0], accent[1], accent[2])
  doc.setLineWidth(0.15)
  doc.line(margin, y, pageWidth - margin, y)
  y += 10

  // ── Meta-rad (3 kolumner): kund · datum · avsändare ──
  const colW = contentWidth / 3

  // Kolumn 1: Offert till
  doc.setFontSize(7)
  doc.setTextColor(...LABEL_COLOR)
  doc.text('OFFERT TILL', margin, y)
  doc.setFontSize(10)
  doc.setTextColor(...TEXT_PRIMARY)
  let cy = y + 5
  doc.text(quote.customer?.name || 'Kund', margin, cy)
  doc.setFontSize(9)
  if (quote.customer?.address_line) { cy += 4; doc.text(quote.customer.address_line, margin, cy) }
  if (quote.customer?.phone_number) { cy += 4; doc.text(quote.customer.phone_number, margin, cy) }
  const custPnr = quote.customer?.personnummer || quote.personnummer
  if (custPnr) { cy += 4; doc.text(`Personnr: ${custPnr}`, margin, cy) }

  // Kolumn 2: Datum
  const dateX = margin + colW
  const issued = quote.issued_date || quote.created_at
  doc.setFontSize(7)
  doc.setTextColor(...LABEL_COLOR)
  doc.text('OFFERTDATUM', dateX, y)
  doc.setFontSize(10)
  doc.setTextColor(...TEXT_PRIMARY)
  doc.text(formatDateSv(issued) || '—', dateX, y + 5)

  if (quote.valid_until) {
    doc.setFontSize(7)
    doc.setTextColor(...LABEL_COLOR)
    doc.text('GILTIG TILL', dateX, y + 13)
    doc.setFontSize(10)
    doc.setTextColor(accent[0], accent[1], accent[2])
    doc.text(formatDateSv(quote.valid_until), dateX, y + 18)
  }

  // Kolumn 3: Vår referens / kontakt (skaparen med fallback)
  const refX = margin + colW * 2
  const contactName = quote.creator?.name ?? business.contact_name
  const contactPhone = quote.creator?.phone ?? business.contact_phone
  const contactEmail = quote.creator?.email ?? business.contact_email
  doc.setFontSize(7)
  doc.setTextColor(...LABEL_COLOR)
  doc.text('VÅR REFERENS', refX, y)
  doc.setFontSize(10)
  doc.setTextColor(...TEXT_PRIMARY)
  let ry = y + 5
  doc.text(contactName || business.business_name || '—', refX, ry)
  doc.setFontSize(9)
  doc.setTextColor(...TEXT_SECONDARY)
  if (contactPhone) { ry += 4; doc.text(contactPhone, refX, ry) }
  if (contactEmail) { ry += 4; doc.text(contactEmail, refX, ry) }

  // Fastställ startpunkt under den längsta kolumnen
  y = Math.max(cy, y + 18, ry) + 8

  // ── Referensperson (byggarbetsplatsens kontakt) ──
  if (quote.reference_person) {
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(`Referensperson: ${quote.reference_person}${quote.fastighetsbeteckning ? ` · Fastighet: ${quote.fastighetsbeteckning}` : ''}`, margin, y)
    y += 6
  } else if (quote.fastighetsbeteckning) {
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(`Fastighet: ${quote.fastighetsbeteckning}`, margin, y)
    y += 6
  }

  // ── Offertens titel + beskrivning ──
  if (quote.title) {
    doc.setFontSize(12)
    doc.setTextColor(...TEXT_PRIMARY)
    doc.text(quote.title, margin, y)
    y += 6
  }
  if (quote.description) {
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_MUTED)
    const descLines = doc.splitTextToSize(quote.description, contentWidth)
    doc.text(descLines, margin, y)
    y += descLines.length * 4 + 4
  }

  // ── Specifikation ──
  doc.setFontSize(7)
  doc.setTextColor(...LABEL_COLOR)
  doc.text('SPECIFIKATION', margin, y)
  y += 4

  const tableBody: any[][] = []
  for (const item of quote.items || []) {
    const itemType = item.item_type || 'item'

    // Ej valda tillval hör inte till kundens aktuella kopia — exkludera dem.
    if (itemType === 'option' && item.option_selected === false) continue

    if (itemType === 'heading') {
      tableBody.push([{ content: item.description, colSpan: 5, styles: { fontStyle: 'bold', textColor: TEXT_PRIMARY } }])
    } else if (itemType === 'text') {
      tableBody.push([{ content: item.description, colSpan: 5, styles: { fontStyle: 'italic', textColor: [...TEXT_SECONDARY] } }])
    } else if (itemType === 'subtotal') {
      tableBody.push([
        { content: '', colSpan: 3 },
        { content: item.description || 'Delsumma', styles: { fontStyle: 'bold' } },
        { content: formatSEK(item.total), styles: { fontStyle: 'bold', halign: 'right' as const } },
      ])
    } else if (itemType === 'discount') {
      tableBody.push([
        { content: item.description, styles: { textColor: [accent[0], accent[1], accent[2]] } },
        { content: String(item.quantity), styles: { textColor: [accent[0], accent[1], accent[2]] } },
        { content: item.unit, styles: { textColor: [accent[0], accent[1], accent[2]] } },
        { content: formatSEK(Math.abs(item.unit_price)), styles: { textColor: [accent[0], accent[1], accent[2]] } },
        { content: `-${formatSEK(Math.abs(item.total))}`, styles: { textColor: [accent[0], accent[1], accent[2]], halign: 'right' as const } },
      ])
    } else {
      // 'item' och valda 'option'
      const rotTag = item.is_rot_eligible ? ' [ROT]' : item.is_rut_eligible ? ' [RUT]' : ''
      const optTag = itemType === 'option' ? ' (tillval)' : ''
      tableBody.push([
        item.description + rotTag + optTag,
        String(item.quantity),
        item.unit,
        formatSEK(item.unit_price),
        formatSEK(item.total),
      ])
    }
  }

  autoTable(doc, {
    startY: y,
    head: [['Beskrivning', 'Antal', 'Enhet', 'À-pris', 'Summa']],
    body: tableBody,
    theme: 'plain',
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [...LABEL_COLOR],
      fontSize: 7,
      fontStyle: 'normal',
      cellPadding: { top: 2, bottom: 4, left: 0, right: 0 },
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [...TEXT_PRIMARY],
      cellPadding: { top: 3, bottom: 3, left: 0, right: 0 },
      lineColor: [...SEPARATOR],
      lineWidth: { bottom: 0.2 },
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 18 },
      2: { halign: 'right', cellWidth: 18 },
      3: { halign: 'right', cellWidth: 28 },
      4: { halign: 'right', cellWidth: 28 },
    },
    didParseCell: (data: any) => {
      if (data.row.index === tableBody.length - 1 && data.section === 'body') {
        data.cell.styles.lineWidth = { bottom: 0 }
      }
    },
  })

  y = (doc as any).lastAutoTable.finalY + 8

  // ── Totals (högerjusterat) ──
  const totalsW = 65
  const totalsX = pageWidth - margin - totalsW

  const drawTotalRow = (label: string, value: string, options?: { teal?: boolean; bold?: boolean; topLine?: boolean }) => {
    if (options?.topLine) {
      doc.setDrawColor(...BORDER_COLOR)
      doc.setLineWidth(0.15)
      doc.line(totalsX, y - 1, totalsX + totalsW, y - 1)
      y += 3
    }
    doc.setFontSize(options?.bold ? 11 : 9)
    if (options?.teal) doc.setTextColor(accent[0], accent[1], accent[2])
    else if (options?.bold) doc.setTextColor(...TEXT_PRIMARY)
    else doc.setTextColor(...TEXT_MUTED)
    doc.text(label, totalsX, y)
    doc.text(value, totalsX + totalsW, y, { align: 'right' })
    y += options?.bold ? 7 : 5
  }

  drawTotalRow('Delsumma', formatSEK(quote.subtotal))
  drawTotalRow(`Moms ${quote.vat_rate}%`, formatSEK(quote.vat_amount))
  drawTotalRow('Totalt inkl moms', formatSEK(quote.total), { bold: !quote.rot_rut_type, topLine: true })

  if (quote.rot_rut_type) {
    const type = quote.rot_rut_type.toUpperCase()
    const deduction = quote.rot_rut_type === 'rut'
      ? (quote.rut_deduction ?? 0)
      : (quote.rot_deduction ?? 0)
    const customerPays = quote.rot_rut_type === 'rut'
      ? (quote.rut_customer_pays ?? quote.total - deduction)
      : (quote.rot_customer_pays ?? quote.total - deduction)
    drawTotalRow(`${type}-avdrag`, `-${formatSEK(deduction)}`, { teal: true })
    drawTotalRow('Att betala', formatSEK(customerPays), { bold: true, topLine: true })
  }

  y += 6

  // ── Villkorstexter (liten stil) ──
  // Inlednings-/avslutningstext (quote.introduction_text/conclusion_text)
  // renderas INTE längre — redundanta mot beskrivningen (pilot-beslut 2026-07).
  const terms: Array<[string, string | null | undefined]> = [
    ['Ingår ej', quote.not_included],
    ['Betalningsvillkor', quote.payment_terms_text],
  ]
  for (const [label, text] of terms) {
    if (!text) continue
    // Sidbrytning om vi är nära nederkanten
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage()
      y = margin
    }
    doc.setFontSize(7)
    doc.setTextColor(...LABEL_COLOR)
    doc.text(label.toUpperCase(), margin, y)
    y += 4
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_MUTED)
    const lines = doc.splitTextToSize(text, contentWidth)
    doc.text(lines, margin, y)
    y += lines.length * 4 + 4
  }

  // ── Footer ──
  const footerY = doc.internal.pageSize.getHeight() - 15
  doc.setDrawColor(...BORDER_COLOR)
  doc.setLineWidth(0.15)
  doc.line(margin, footerY, pageWidth - margin, footerY)
  doc.setFontSize(7)
  doc.setTextColor(...TEXT_MUTED)
  const footerParts = [
    business.f_skatt_registered ? 'Innehar F-skattsedel' : '',
    business.org_number ? `Org.nr ${business.org_number}` : '',
  ].filter(Boolean)
  if (footerParts.length > 0) {
    doc.text(footerParts.join(' · '), margin, footerY + 5)
  }

  const arrayBuffer = doc.output('arraybuffer')
  return Buffer.from(arrayBuffer)
}
