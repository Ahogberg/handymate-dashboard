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
  f_skatt_registered?: boolean
}

function formatSEK(amount: number | null | undefined): string {
  if (amount == null) return '0 kr'
  return amount.toLocaleString('sv-SE') + ' kr'
}

export function generateInvoicePDF(invoice: InvoiceData, business: BusinessData): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  const contentWidth = pageWidth - margin * 2
  let y = margin

  const purple = [124, 58, 237] as const
  const darkText = [26, 26, 26] as const
  const grayText = [102, 102, 102] as const
  const lightGray = [153, 153, 153] as const

  // Header: company name + FAKTURA
  doc.setFontSize(22)
  doc.setTextColor(...purple)
  doc.text(business.business_name || 'Företag', margin, y + 8)

  doc.setFontSize(10)
  doc.setTextColor(...grayText)
  const companyInfo = [
    business.address || '',
    `${business.contact_email || ''} | ${business.contact_phone || ''}`,
    `Org.nr: ${business.org_number || 'Ej angivet'}`
  ].filter(Boolean)
  companyInfo.forEach((line, i) => {
    doc.text(line, margin, y + 15 + i * 4.5)
  })

  // Invoice title
  doc.setFontSize(28)
  doc.setTextColor(...darkText)
  const title = invoice.is_credit_note ? 'KREDITFAKTURA' : 'FAKTURA'
  doc.text(title, pageWidth - margin, y + 8, { align: 'right' })

  doc.setFontSize(12)
  doc.setTextColor(...purple)
  doc.text(`#${invoice.invoice_number}`, pageWidth - margin, y + 16, { align: 'right' })

  if (invoice.is_credit_note && invoice.credit_reason) {
    doc.setFontSize(9)
    doc.setTextColor(220, 38, 38)
    doc.text(`Anledning: ${invoice.credit_reason}`, pageWidth - margin, y + 22, { align: 'right' })
  }

  // Purple divider
  y += 35
  doc.setDrawColor(...purple)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)
  y += 10

  // Customer info
  doc.setFontSize(8)
  doc.setTextColor(...lightGray)
  doc.text('FAKTURERAS TILL', margin, y)
  y += 5

  doc.setFontSize(11)
  doc.setTextColor(...darkText)
  doc.text(invoice.customer?.name || 'Kund', margin, y)
  y += 5

  doc.setFontSize(9)
  doc.setTextColor(...grayText)
  if (invoice.customer?.address_line) {
    doc.text(invoice.customer.address_line, margin, y)
    y += 4.5
  }
  if (invoice.customer?.email) {
    doc.text(invoice.customer.email, margin, y)
    y += 4.5
  }
  if (invoice.customer?.phone_number) {
    doc.text(invoice.customer.phone_number, margin, y)
    y += 4.5
  }
  if (invoice.personnummer) {
    doc.text(`Personnummer: ${invoice.personnummer}`, margin, y)
    y += 4.5
  }

  y += 6

  // Dates box
  const ocrNumber = generateOCR(invoice.invoice_number || '')
  const boxY = y
  doc.setFillColor(248, 245, 255)
  doc.roundedRect(margin, boxY, contentWidth, 22, 3, 3, 'F')

  const colWidth = contentWidth / 3
  const labels = ['FAKTURADATUM', 'FÖRFALLODATUM', 'OCR-NUMMER']
  const values = [
    new Date(invoice.invoice_date).toLocaleDateString('sv-SE'),
    new Date(invoice.due_date).toLocaleDateString('sv-SE'),
    ocrNumber,
  ]

  labels.forEach((label, i) => {
    const x = margin + 6 + i * colWidth
    doc.setFontSize(7)
    doc.setTextColor(...lightGray)
    doc.text(label, x, boxY + 8)
    doc.setFontSize(11)
    doc.setTextColor(...darkText)
    doc.text(values[i], x, boxY + 16)
  })

  y = boxY + 28

  // ROT/RUT notice
  if (invoice.rot_rut_type) {
    doc.setFillColor(212, 237, 218)
    doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'F')
    doc.setFontSize(9)
    doc.setTextColor(6, 95, 70)
    doc.text(
      `${invoice.rot_rut_type.toUpperCase()}-avdrag tillämpas. Avdraget på ${formatSEK(invoice.rot_rut_deduction)} begärs hos Skatteverket. Du betalar ${formatSEK(invoice.customer_pays)}.`,
      margin + 5, y + 7,
      { maxWidth: contentWidth - 10 }
    )
    if (invoice.fastighetsbeteckning) {
      doc.text(`Fastighet: ${invoice.fastighetsbeteckning}`, margin + 5, y + 13)
    }
    y += 22
  }

  // Items table
  const items = invoice.items || []
  const tableBody = items.map((item) => [
    item.description,
    String(item.quantity),
    item.unit,
    formatSEK(item.unit_price),
    formatSEK(item.total),
  ])

  autoTable(doc, {
    startY: y,
    head: [['Beskrivning', 'Antal', 'Enhet', 'à-pris', 'Summa']],
    body: tableBody,
    theme: 'plain',
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: [124, 58, 237],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [26, 26, 26],
      cellPadding: 4,
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 20 },
      2: { halign: 'right', cellWidth: 20 },
      3: { halign: 'right', cellWidth: 30 },
      4: { halign: 'right', cellWidth: 30 },
    },
  })

  y = (doc as any).lastAutoTable.finalY + 10

  // Totals box — right-aligned
  const totalsX = pageWidth - margin - 80
  const totalsWidth = 80

  doc.setFillColor(248, 245, 255)
  const totalsHeight = invoice.rot_rut_type ? 58 : 38
  doc.roundedRect(totalsX, y, totalsWidth, totalsHeight, 3, 3, 'F')

  let ty = y + 8
  doc.setFontSize(9)
  doc.setTextColor(...grayText)
  doc.text('Delsumma', totalsX + 5, ty)
  doc.text(formatSEK(invoice.subtotal), totalsX + totalsWidth - 5, ty, { align: 'right' })
  ty += 6
  doc.text(`Moms (${invoice.vat_rate}%)`, totalsX + 5, ty)
  doc.text(formatSEK(invoice.vat_amount), totalsX + totalsWidth - 5, ty, { align: 'right' })
  ty += 2
  doc.setDrawColor(...purple)
  doc.setLineWidth(0.4)
  doc.line(totalsX + 5, ty, totalsX + totalsWidth - 5, ty)
  ty += 6
  doc.setFontSize(13)
  doc.setTextColor(...purple)
  doc.text('Totalt', totalsX + 5, ty)
  doc.text(formatSEK(invoice.total), totalsX + totalsWidth - 5, ty, { align: 'right' })

  if (invoice.rot_rut_type) {
    ty += 7
    doc.setFontSize(9)
    doc.setTextColor(5, 150, 105)
    doc.text(`${invoice.rot_rut_type.toUpperCase()}-avdrag`, totalsX + 5, ty)
    doc.text(`-${formatSEK(invoice.rot_rut_deduction)}`, totalsX + totalsWidth - 5, ty, { align: 'right' })
    ty += 7
    doc.setFillColor(212, 237, 218)
    doc.roundedRect(totalsX, ty - 5, totalsWidth, 12, 0, 0, 'F')
    doc.setFontSize(11)
    doc.setTextColor(26, 26, 26)
    doc.text('Att betala', totalsX + 5, ty + 2)
    doc.text(formatSEK(invoice.customer_pays), totalsX + totalsWidth - 5, ty + 2, { align: 'right' })
  }

  y += totalsHeight + 10

  // Payment info box
  doc.setFillColor(26, 26, 26)
  doc.roundedRect(margin, y, contentWidth, 28, 3, 3, 'F')

  doc.setFontSize(7)
  doc.setTextColor(...lightGray)
  doc.text('BETALNINGSINFORMATION', margin + 8, y + 7)

  const payColWidth = contentWidth / 3
  const payLabels = ['Bankgiro', 'Att betala', 'OCR-nummer']
  const payValues = [
    business.bankgiro || 'Ej angivet',
    formatSEK(invoice.rot_rut_type ? invoice.customer_pays : invoice.total),
    ocrNumber,
  ]

  payLabels.forEach((label, i) => {
    const px = margin + 8 + i * payColWidth
    doc.setFontSize(7)
    doc.setTextColor(...lightGray)
    doc.text(label, px, y + 14)
    doc.setFontSize(12)
    doc.setTextColor(...purple)
    doc.text(payValues[i], px, y + 22)
  })

  y += 36

  // Footer
  doc.setDrawColor(230, 230, 230)
  doc.setLineWidth(0.2)
  doc.line(margin, y, pageWidth - margin, y)
  y += 6
  doc.setFontSize(8)
  doc.setTextColor(...lightGray)
  const footerParts = [
    business.business_name || '',
    `Org.nr: ${business.org_number || ''}`,
    business.contact_email || '',
    business.f_skatt_registered ? 'Godkänd för F-skatt' : '',
  ].filter(Boolean)
  doc.text(footerParts.join(' | '), pageWidth / 2, y, { align: 'center' })
  y += 5
  doc.text('Tack för att du anlitar oss!', pageWidth / 2, y, { align: 'center' })

  // Return as Buffer
  const arrayBuffer = doc.output('arraybuffer')
  return Buffer.from(arrayBuffer)
}
