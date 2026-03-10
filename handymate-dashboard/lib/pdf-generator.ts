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

export function generateInvoicePDF(invoice: InvoiceData, business: BusinessData): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  const contentWidth = pageWidth - margin * 2
  let y = margin

  // Parse accent color
  const accentHex = business.accent_color || '#7c3aed'
  const r = parseInt(accentHex.slice(1, 3), 16)
  const g = parseInt(accentHex.slice(3, 5), 16)
  const b = parseInt(accentHex.slice(5, 7), 16)
  const purple = [r, g, b] as const
  const darkText = [26, 26, 26] as const
  const grayText = [102, 102, 102] as const
  const lightGray = [153, 153, 153] as const

  // Determine title
  const invoiceType = invoice.invoice_type || 'standard'
  let title = 'FAKTURA'
  if (invoice.is_credit_note || invoiceType === 'credit') title = 'KREDITFAKTURA'
  else if (invoiceType === 'reminder') title = 'PÅMINNELSE'
  else if (invoiceType === 'partial') title = 'DELFAKTURA'

  // Header: company name + title
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

  // Parties: sender + receiver
  doc.setFontSize(8)
  doc.setTextColor(...lightGray)
  doc.text('AVSÄNDARE', margin, y)
  doc.text('MOTTAGARE', margin + contentWidth / 2 + 10, y)
  y += 5

  // Sender
  doc.setFontSize(10)
  doc.setTextColor(...darkText)
  doc.text(business.business_name || '', margin, y)
  doc.setFontSize(9)
  doc.setTextColor(...grayText)
  if (business.address) { y += 4; doc.text(business.address, margin, y) }
  if (business.contact_email) { y += 4; doc.text(business.contact_email, margin, y) }

  // Receiver
  let ry = y - (business.address ? 8 : 4)
  const rx = margin + contentWidth / 2 + 10
  doc.setFontSize(10)
  doc.setTextColor(...darkText)
  doc.text(invoice.customer?.name || 'Kund', rx, ry)
  doc.setFontSize(9)
  doc.setTextColor(...grayText)
  if (invoice.customer?.address_line) { ry += 4; doc.text(invoice.customer.address_line, rx, ry) }
  if (invoice.customer?.email) { ry += 4; doc.text(invoice.customer.email, rx, ry) }
  if (invoice.customer?.phone_number) { ry += 4; doc.text(invoice.customer.phone_number, rx, ry) }
  if (invoice.personnummer) { ry += 4; doc.text(`Personnr: ${invoice.personnummer}`, rx, ry) }
  if (invoice.fastighetsbeteckning) { ry += 4; doc.text(`Fastighet: ${invoice.fastighetsbeteckning}`, rx, ry) }

  y = Math.max(y, ry) + 8

  // Meta box
  const ocrNumber = invoice.ocr_number || generateOCR(invoice.invoice_number || '')
  const boxY = y
  doc.setFillColor(248, 245, 255)
  doc.roundedRect(margin, boxY, contentWidth, 22, 3, 3, 'F')

  const metaLabels = ['FAKTURADATUM', 'FÖRFALLODATUM', 'OCR-NUMMER']
  const metaValues = [
    new Date(invoice.invoice_date).toLocaleDateString('sv-SE'),
    new Date(invoice.due_date).toLocaleDateString('sv-SE'),
    ocrNumber,
  ]

  if (invoice.our_reference) { metaLabels.push('VÅR REF'); metaValues.push(invoice.our_reference) }
  if (invoice.your_reference) { metaLabels.push('ER REF'); metaValues.push(invoice.your_reference) }

  const colWidth = contentWidth / metaLabels.length
  metaLabels.forEach((label, i) => {
    const x = margin + 6 + i * colWidth
    doc.setFontSize(7)
    doc.setTextColor(...lightGray)
    doc.text(label, x, boxY + 8)
    doc.setFontSize(10)
    doc.setTextColor(...darkText)
    doc.text(metaValues[i], x, boxY + 16)
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

  // Items table – filter to displayable rows
  const displayItems = invoice.items || []
  const tableBody: any[][] = []

  for (const item of displayItems) {
    const itemType = item.item_type || 'item'

    if (itemType === 'heading') {
      tableBody.push([{ content: item.description, colSpan: 5, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }])
    } else if (itemType === 'text') {
      tableBody.push([{ content: item.description, colSpan: 5, styles: { fontStyle: 'italic', textColor: [102, 102, 102] } }])
    } else if (itemType === 'subtotal') {
      tableBody.push([
        { content: '', colSpan: 3 },
        { content: item.description, styles: { fontStyle: 'bold', fillColor: [254, 243, 199] } },
        { content: formatSEK(item.total), styles: { fontStyle: 'bold', halign: 'right', fillColor: [254, 243, 199] } }
      ])
    } else if (itemType === 'discount') {
      tableBody.push([
        item.description,
        String(item.quantity),
        item.unit,
        formatSEK(Math.abs(item.unit_price)),
        `-${formatSEK(Math.abs(item.total))}`,
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
    head: [['Beskrivning', 'Antal', 'Enhet', 'à-pris', 'Summa']],
    body: tableBody,
    theme: 'plain',
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: [r, g, b],
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

  // Totals box
  const totalsX = pageWidth - margin - 80
  const totalsWidth = 80
  const totalsHeight = invoice.rot_rut_type ? 58 : 38

  doc.setFillColor(248, 245, 255)
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

  const payItems: { label: string; value: string }[] = []
  if (business.bankgiro) payItems.push({ label: 'Bankgiro', value: business.bankgiro })
  if (business.plusgiro) payItems.push({ label: 'Plusgiro', value: business.plusgiro })
  if (business.swish_number) payItems.push({ label: 'Swish', value: business.swish_number })
  payItems.push({ label: 'Att betala', value: formatSEK(invoice.rot_rut_type ? invoice.customer_pays : invoice.total) })
  payItems.push({ label: 'OCR-nummer', value: ocrNumber })

  const qrSize = 38 // mm
  const hasSwishQR = !!business.swish_qr
  const payBoxH = hasSwishQR ? Math.max(qrSize + 14, 28) : 28
  doc.roundedRect(margin, y, contentWidth, payBoxH, 3, 3, 'F')

  doc.setFontSize(7)
  doc.setTextColor(...lightGray)
  doc.text('BETALNINGSINFORMATION', margin + 8, y + 7)

  if (hasSwishQR) {
    // QR code on the left side
    const qrX = margin + 8
    const qrY = y + 10
    doc.addImage(business.swish_qr!, 'PNG', qrX, qrY, qrSize, qrSize)

    // Swish label below QR
    doc.setFontSize(7)
    doc.setTextColor(...lightGray)
    doc.text('Swish', qrX, qrY + qrSize + 4)
    if (business.swish_number) {
      doc.setFontSize(8)
      doc.setTextColor(...purple)
      doc.text(business.swish_number, qrX, qrY + qrSize + 9)
    }

    // Text to the right of QR
    const textX = margin + 8 + qrSize + 8
    const textWidth = contentWidth - qrSize - 24
    doc.setFontSize(10)
    doc.setTextColor(255, 255, 255)
    doc.text('Betala med Swish', textX, y + 16)
    doc.setFontSize(8)
    doc.setTextColor(...lightGray)
    doc.text('Skanna QR-koden — belopp och fakturanummer', textX, y + 22, { maxWidth: textWidth })
    doc.text('fylls i automatiskt i din Swish-app.', textX, y + 27, { maxWidth: textWidth })

    // Other payment items to the right of QR
    const otherItems = payItems.filter(p => p.label !== 'Swish')
    const colW = textWidth / Math.max(otherItems.length, 1)
    otherItems.forEach((item, i) => {
      const px = textX + i * colW
      doc.setFontSize(7)
      doc.setTextColor(...lightGray)
      doc.text(item.label, px, y + 35)
      doc.setFontSize(10)
      doc.setTextColor(...purple)
      doc.text(item.value, px, y + 41, { maxWidth: colW - 2 })
    })
  } else {
    const payColWidth = contentWidth / payItems.length
    payItems.forEach((item, i) => {
      const px = margin + 8 + i * payColWidth
      doc.setFontSize(7)
      doc.setTextColor(...lightGray)
      doc.text(item.label, px, y + 14)
      doc.setFontSize(12)
      doc.setTextColor(...purple)
      doc.text(item.value, px, y + 22)
    })
  }

  y += payBoxH + 8

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

  if (business.penalty_interest) {
    y += 4
    doc.text(`Dröjsmålsränta: ${business.penalty_interest}%`, pageWidth / 2, y, { align: 'center' })
  }

  y += 4
  doc.text(business.invoice_footer_text || 'Tack för att du anlitar oss!', pageWidth / 2, y, { align: 'center' })

  // Return as Buffer
  const arrayBuffer = doc.output('arraybuffer')
  return Buffer.from(arrayBuffer)
}
