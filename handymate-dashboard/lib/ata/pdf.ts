/**
 * ÄTA-dokumentet som PDF — det hantverkaren skriver ut, kunden laddar ner
 * från portalen och som ligger till grund vid tvist.
 *
 * ═══ VARFÖR ═══
 *
 * Fram till 2026-09-02 fanns inget ÄTA-dokument alls: kunden signerade en
 * webbsida och det enda spåret var en JSON-rad. Ett affärssystem levererar
 * ett dokument med rader, moms, ROT-avdrag, foton och signatur.
 *
 * Summorna räknas av `beraknaAtaSummor` (lib/ata/totals.ts) — samma
 * funktion som portalen och signeringssidan använder, så dokumentet visar
 * aldrig andra belopp än skärmen.
 *
 * Delas av två rutter: `/api/ata/[id]/pdf` (inloggad, see_financials) och
 * `/api/ata/sign/[token]/pdf` (publik, aldrig för draft/pending).
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { normaliseraAtaRader, ataRadNamn } from './items'
import { beraknaAtaSummor } from './totals'
import { ataStatusLabel, ataTypLabel } from './labels'
import { buildAttribution, stampAttributionOnPdf, type Attribution } from '@/lib/branding/attribution'
import {
  drawBrandHeader,
  drawBrandFooter,
  PDF_TEXT_PRIMARY as TEXT_PRIMARY,
  PDF_TEXT_SECONDARY as TEXT_SECONDARY,
  PDF_TEXT_MUTED as TEXT_MUTED,
  type PdfBranding,
} from '@/lib/branding/pdf'

const AMBER_RGB = [180, 83, 9] as const

export interface AtaPdfAta {
  change_id: string
  ata_number: number | null
  change_type: string | null
  description: string | null
  /**
   * project_change.notes finns MEDVETET inte här. Formuläret kallar fältet
   * "Intern notering" (components/projects/ata/ChangeModal.tsx) och Pass F
   * lägger dessutom kortets id där som idempotensmarkör. Dokumentet är det
   * kunden signerar — samma PDF serveras via /api/ata/sign/[token]/pdf.
   * Driftfynd F10, Nordström El 2026-09-06: noteringen hamnade i kundens PDF.
   */
  items: unknown
  total?: number | null
  vat_rate?: number | null
  status: string | null
  created_at?: string | null
  sent_at?: string | null
  signed_at?: string | null
  signed_by_name?: string | null
  signature_data?: string | null
}

export interface AtaPdfCustomer {
  name?: string | null
  address_line?: string | null
  visit_address?: string | null
  phone_number?: string | null
  email?: string | null
}

export interface AtaPdfProject {
  name?: string | null
  project_number?: string | number | null
}

export interface AtaPdfBilaga {
  name: string
  mime_type?: string | null
  /** Signerad URL (bucketen är privat). */
  url: string
}

export interface GenerateAtaPdfInput {
  ata: AtaPdfAta
  /** Varumärket (lib/branding/pdf.ts) — sidhuvud, accentfärg, sidfot. */
  brand: PdfBranding
  customer: AtaPdfCustomer | null
  project: AtaPdfProject | null
  attachments: AtaPdfBilaga[]
  /** Handymate-stämpeln (lib/branding/attribution.ts). Utelämnad → texten utan länk. */
  attribution?: Attribution
}

// sv-SE ger smalt hårt mellanslag (U+202F) som tusentalsavgränsare — det
// ligger utanför WinAnsi och blir skräptecken i jsPDF:s standardfonter.
const tal = (n: number) => n.toLocaleString('sv-SE').replace(/[  ]/g, ' ')
const kr = (n: number) => `${tal(Math.round(n))} kr`

const datum = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('sv-SE')
}

/**
 * Hämta en bild som data-URL för jsPDF. Bara PNG/JPEG ritas; allt annat
 * (eller ett nätverksfel) ger null och hoppas över — dokumentet ska aldrig
 * fallera på en bilaga.
 */
async function hamtaBild(url: string): Promise<{ data: string; format: 'PNG' | 'JPEG' } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || ''
    const format: 'PNG' | 'JPEG' | null = contentType.includes('png')
      ? 'PNG'
      : (contentType.includes('jpeg') || contentType.includes('jpg')) ? 'JPEG' : null
    if (!format) return null
    const buf = Buffer.from(await res.arrayBuffer()).toString('base64')
    return { data: `data:${format === 'PNG' ? 'image/png' : 'image/jpeg'};base64,${buf}`, format }
  } catch (err) {
    console.error('[ata/pdf] kunde inte hämta bild:', err)
    return null
  }
}

export async function generateAtaPDF(input: GenerateAtaPdfInput): Promise<Buffer> {
  const { ata, brand, customer, project, attachments } = input
  const ACCENT_RGB = brand.accent

  const vatRate = Number(ata.vat_rate ?? 25)
  const rader = normaliseraAtaRader(ata.items)
  const summor = beraknaAtaSummor(rader, vatRate, ata.change_type ?? undefined)
  const arAvgaende = ata.change_type === 'removal'
  const arUtkast = ata.status === 'draft' || ata.status === 'pending'
  const arSignerad = !!ata.signature_data && !!ata.signed_at

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  const contentWidth = pageWidth - margin * 2
  const bottom = pageHeight - 20
  let y = margin

  // Mät ALLTID före ritning — annars hamnar blocket delvis utanför sidan.
  const ensureSpace = (h: number) => {
    if (y + h > bottom) {
      doc.addPage()
      y = margin
    }
  }

  // ── Sidhuvud (lib/branding/pdf.ts — samma som byggdagbok/egenkontroll/arbetsorder) ──
  y = drawBrandHeader(doc, brand, {
    docType: 'Ändrings- och tilläggsarbete',
    title: `ÄTA-${ata.ata_number ?? '?'}`,
    meta: [
      `Datum: ${datum(ata.created_at) || '–'}`,
      `Typ: ${ataTypLabel(ata.change_type)}`,
      `Status: ${ataStatusLabel(ata.status)}`,
    ],
  })

  // ── Projekt + kund ──
  const kolB = margin + contentWidth / 2
  doc.setFontSize(8)
  doc.setTextColor(...ACCENT_RGB)
  doc.text('PROJEKT', margin, y)
  doc.text('KUND', kolB, y)
  y += 5
  doc.setFontSize(9)
  doc.setTextColor(...TEXT_PRIMARY)
  const projektrader = [
    project?.name || '–',
    project?.project_number ? `Projektnr ${project.project_number}` : null,
  ].filter(Boolean) as string[]
  const kundrader = [
    customer?.name || '–',
    customer?.visit_address || customer?.address_line || null,
    customer?.phone_number || null,
    customer?.email || null,
  ].filter(Boolean) as string[]
  projektrader.forEach((rad, i) => doc.text(rad, margin, y + i * 4.5))
  kundrader.forEach((rad, i) => doc.text(rad, kolB, y + i * 4.5))
  y += Math.max(projektrader.length, kundrader.length) * 4.5 + 6

  // ── Beskrivning ──
  doc.setFontSize(8)
  doc.setTextColor(...ACCENT_RGB)
  doc.text('BESKRIVNING', margin, y)
  y += 5
  doc.setFontSize(10)
  doc.setTextColor(...TEXT_PRIMARY)
  const beskrivning = doc.splitTextToSize(ata.description || '–', contentWidth) as string[]
  ensureSpace(beskrivning.length * 4.5)
  doc.text(beskrivning, margin, y)
  y += beskrivning.length * 4.5 + 3

  if (arAvgaende) {
    doc.setFontSize(9)
    doc.setTextColor(...AMBER_RGB)
    doc.text('Avgående arbete — beloppen nedan dras av från projektets totalsumma.', margin, y)
    y += 6
  }

  // ── Radtabell ──
  y += 2
  if (rader.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Benämning', 'Antal', 'Enhet', 'À-pris', 'Summa']],
      body: rader.map(rad => [
        rad.description && rad.description !== rad.name
          ? `${ataRadNamn(rad)}\n${rad.description}`
          : ataRadNamn(rad),
        tal(rad.quantity),
        rad.unit,
        kr(rad.unit_price),
        kr(rad.quantity * rad.unit_price),
      ]),
      styles: { fontSize: 9, cellPadding: 2.5, textColor: [...TEXT_PRIMARY] as any },
      headStyles: { fillColor: [...ACCENT_RGB] as any, textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        1: { halign: 'right', cellWidth: 18 },
        2: { cellWidth: 18 },
        3: { halign: 'right', cellWidth: 28 },
        4: { halign: 'right', cellWidth: 30 },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    })
    y = (doc as any).lastAutoTable.finalY + 6
  } else {
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_SECONDARY)
    doc.text('Inga specificerade rader.', margin, y)
    y += 6
  }

  // ── Totalrader ──
  const delsumma = rader.length > 0 ? summor.delsumma : (arAvgaende ? -1 : 1) * Math.abs(Number(ata.total ?? 0))
  const moms = rader.length > 0 ? summor.moms : delsumma * vatRate / 100
  const totalt = delsumma + moms
  const totalrader: Array<[string, string, boolean]> = [
    ['Delsumma exkl. moms', kr(delsumma), false],
    [`Moms ${tal(vatRate)} %`, kr(moms), false],
    ['Totalt inkl. moms', kr(totalt), true],
  ]
  if (summor.rotTyp && summor.rotAvdrag > 0) {
    totalrader.push([`${summor.rotTyp === 'rot' ? 'ROT' : 'RUT'}-avdrag (prel.)`, `-${kr(summor.rotAvdrag)}`, false])
    totalrader.push(['Att betala', kr(summor.attBetala), true])
  }
  ensureSpace(totalrader.length * 6 + 4)
  const labelX = pageWidth - margin - 75
  const valueX = pageWidth - margin
  for (const [label, value, fet] of totalrader) {
    doc.setFontSize(fet ? 10 : 9)
    doc.setFont('helvetica', fet ? 'bold' : 'normal')
    if (fet) doc.setTextColor(...TEXT_PRIMARY)
    else doc.setTextColor(...TEXT_MUTED)
    doc.text(label, labelX, y)
    doc.text(value, valueX, y, { align: 'right' })
    if (fet) {
      doc.setDrawColor(...ACCENT_RGB)
      doc.setLineWidth(0.4)
      doc.line(labelX, y + 1.5, valueX, y + 1.5)
    }
    y += 6
  }
  doc.setFont('helvetica', 'normal')
  if (summor.rotTyp) {
    doc.setFontSize(7)
    doc.setTextColor(...TEXT_SECONDARY)
    doc.text('Avdraget är preliminärt och förutsätter att Skatteverket godkänner ansökan.', valueX, y, { align: 'right' })
    y += 5
  }
  y += 4

  // ── Bilagor ──
  if (attachments.length > 0) {
    ensureSpace(12)
    doc.setFontSize(8)
    doc.setTextColor(...ACCENT_RGB)
    doc.text('BILAGOR', margin, y)
    y += 5

    const bildW = 55
    const bildH = 41
    const gap = 5
    let kol = 0
    let radStartY = y
    const ovriga: string[] = []

    for (const bilaga of attachments) {
      const arBild = (bilaga.mime_type || '').startsWith('image/')
      const bild = arBild ? await hamtaBild(bilaga.url) : null
      if (!bild) {
        ovriga.push(bilaga.name)
        continue
      }
      if (kol === 0) {
        ensureSpace(bildH + 8)
        radStartY = y
      }
      const x = margin + kol * (bildW + gap)
      try {
        doc.addImage(bild.data, bild.format, x, radStartY, bildW, bildH)
        doc.setFontSize(7)
        doc.setTextColor(...TEXT_SECONDARY)
        doc.text(doc.splitTextToSize(bilaga.name, bildW)[0] || '', x, radStartY + bildH + 3.5)
      } catch (err) {
        console.error('[ata/pdf] kunde inte rita bilaga:', err)
        ovriga.push(bilaga.name)
        continue
      }
      kol += 1
      if (kol === 3) {
        kol = 0
        y = radStartY + bildH + 8
      }
    }
    if (kol !== 0) y = radStartY + bildH + 8

    if (ovriga.length > 0) {
      doc.setFontSize(8)
      doc.setTextColor(...TEXT_MUTED)
      for (const namn of ovriga) {
        ensureSpace(4)
        doc.text(`• ${namn}`, margin, y)
        y += 4
      }
    }
    y += 4
  }

  // ── Signatur ──
  if (arSignerad) {
    ensureSpace(40)
    doc.setFontSize(8)
    doc.setTextColor(...ACCENT_RGB)
    doc.text('SIGNATUR', margin, y)
    y += 4
    try {
      doc.addImage(ata.signature_data as string, 'PNG', margin, y, 60, 24)
    } catch (err) {
      console.error('[ata/pdf] kunde inte rita signatur:', err)
    }
    doc.setDrawColor(203, 213, 225)
    doc.setLineWidth(0.3)
    doc.line(margin, y + 25, margin + 60, y + 25)
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_PRIMARY)
    doc.text(`Signerad av ${ata.signed_by_name || '–'}`, margin, y + 30)
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(datum(ata.signed_at), margin, y + 34)

    // Stämpel
    const stampW = 52
    const stampX = pageWidth - margin - stampW
    doc.setDrawColor(...ACCENT_RGB)
    doc.setLineWidth(0.8)
    doc.roundedRect(stampX, y + 4, stampW, 14, 2, 2)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...ACCENT_RGB)
    doc.text('SIGNERAD — LÅST', stampX + stampW / 2, y + 13, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    y += 40
  } else if (!arUtkast) {
    ensureSpace(10)
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(
      ata.status === 'declined'
        ? 'Kunden har avböjt detta tilläggsarbete.'
        : `Skickad till kund ${datum(ata.sent_at) || ''} — väntar på signering.`.replace('  ', ' '),
      margin,
      y,
    )
    y += 8
  }

  // ── Vattenstämpel på varje sida ──
  if (arUtkast) {
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(48)
      doc.setTextColor(215, 215, 215)
      doc.setFont('helvetica', 'bold')
      doc.text('UTKAST — ej skickad', pageWidth / 2, pageHeight / 2, { align: 'center', angle: 45 })
      doc.setFont('helvetica', 'normal')
    }
  }

  // Sidfoten (firma · org.nr · F-skatt · kontakt + sidnummer) på varje sida.
  drawBrandFooter(doc, brand)

  // Stämpeln — bara sista sidan, under sidfoten.
  stampAttributionOnPdf(doc, input.attribution ?? buildAttribution(null))

  return Buffer.from(doc.output('arraybuffer'))
}
