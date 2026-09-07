/**
 * Dokumentfamiljen (PDF) — varumärket i jsPDF-dokumenten (yta 2, 2026-09-07).
 *
 * Före den här filen hade varje fältdokument sitt eget sidhuvud: ÄTA:n
 * ritade logotypen, byggdagboken och egenkontrollen bara firmanamnet,
 * arbetsordern ingenting av företaget, och alla fyra hade Handymates teal
 * hårdkodad som accent. Kunden som fått ett offertmail i firmans färg fick
 * sedan ett kvalitetsbevis (egenkontrollen) i en annan firmas färg.
 *
 * Nu ritar alla jsPDF-dokument samma tre saker härifrån:
 *   - sidhuvud: logotyp (PNG/JPEG, max 35×14 mm) + firma + org.nr/adress/
 *     kontakt till vänster, dokumenttyp i accentfärg + titel + meta till höger,
 *     avslutat med en linje i accentfärgen,
 *   - sidfot på varje sida: firma · Org.nr · Godkänd för F-skatt · telefon ·
 *     e-post + "Sida i av n",
 *   - stämpeln "Skickat via Handymate" (lib/branding/attribution.ts) sist.
 *
 * Kontrakt:
 *  - Varumärket kommer ur get-branding (Branding) — ingen egen kolumnlista.
 *  - Logotypen hämtas server-side och faller TYST bort vid fel/okänt format;
 *    ett dokument får aldrig fallera på loggan (samma regel som offerten).
 *  - jsPDF importeras bara som typ — modulen är säker att importera från
 *    filer som också bundlas till klienten.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type jsPDF from 'jspdf'
import { DEFAULT_ACCENT_COLOR, loadBranding, type Branding } from './get-branding'

export type Rgb = readonly [number, number, number]

/** Samma typografitokens som lib/pdf-generator.ts / lib/ata/pdf.ts. */
export const PDF_TEXT_PRIMARY: Rgb = [30, 41, 59]      // #1E293B
export const PDF_TEXT_SECONDARY: Rgb = [148, 163, 184] // #94A3B8
export const PDF_TEXT_MUTED: Rgb = [100, 116, 139]     // #64748B
export const PDF_BORDER: Rgb = [226, 232, 240]         // #E2E8F0
export const PDF_MARGIN = 20
/** Logotypens maxyta i sidhuvudet (mm). */
export const PDF_LOGO_MAX_W = 35
export const PDF_LOGO_MAX_H = 14
/** Sidfotens baslinje (mm från sidans nederkant); stämpeln ligger på 5. */
export const PDF_FOOTER_FROM_BOTTOM = 10

export interface PdfLogo {
  /** data-URL som jsPDF addImage accepterar. */
  data: string
  format: 'PNG' | 'JPEG'
}

/** Allt ett jsPDF-dokument behöver av varumärket, färdighämtat. */
export interface PdfBranding {
  branding: Branding
  logo: PdfLogo | null
  accent: Rgb
}

/** '#0F766E' → [15,118,110]. Ogiltig input → Handymates teal. */
export function accentRgb(hex: string | null | undefined): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim())
  const n = parseInt(m ? m[1] : DEFAULT_ACCENT_COLOR.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Hämtar logotypen som data-URL. Bara PNG/JPEG — jsPDF kan inte rita
 * SVG/WEBP (tillåtna vid uppladdning), då loggas en varning så någon kan
 * se varför dokumentet saknar logga. Kastar aldrig.
 */
export async function loadPdfLogo(url: string | null | undefined, tag = 'branding/pdf'): Promise<PdfLogo | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[${tag}] Loggan kunde inte hämtas:`, res.status)
      return null
    }
    const contentType = res.headers.get('content-type') || ''
    const format: PdfLogo['format'] | null = contentType.includes('png')
      ? 'PNG'
      : (contentType.includes('jpeg') || contentType.includes('jpg')) ? 'JPEG' : null
    if (!format) {
      console.warn(
        `[${tag}] Loggan hoppas över i PDF:en — formatet ${contentType || 'okänt'} stöds inte. Ladda upp PNG eller JPG för att den ska synas.`,
      )
      return null
    }
    const base64 = Buffer.from(await res.arrayBuffer()).toString('base64')
    return { data: `data:${format === 'PNG' ? 'image/png' : 'image/jpeg'};base64,${base64}`, format }
  } catch (err) {
    console.error(`[${tag}] Kunde inte hämta logga för PDF:`, err)
    return null
  }
}

/** Synkron variant när Branding + logga redan finns i scope. */
export function pdfBrandingFrom(branding: Branding, logo: PdfLogo | null = null): PdfBranding {
  return { branding, logo, accent: accentRgb(branding.accentColor) }
}

/** EN query (loadBranding) + loggan. Kastar aldrig — neutralt varumärke vid fel. */
export async function loadPdfBranding(
  supabase: SupabaseClient,
  businessId: string,
  tag = 'branding/pdf',
): Promise<PdfBranding> {
  const branding = await loadBranding(supabase, businessId)
  const logo = await loadPdfLogo(branding.logoUrl, tag)
  return pdfBrandingFrom(branding, logo)
}

export interface BrandHeaderOptions {
  /** Ögonbryn i accentfärg, versaler: 'BYGGDAGBOK', 'EGENKONTROLL', 'ARBETSORDER'. */
  docType: string
  /** Stor titel under ögonbrynet: projektnamn, ordernummer, 'ÄTA-3'. */
  title: string
  /** Små rader under titeln (datum, status …). */
  meta?: string[]
  /** Startposition (mm). Standard: marginalen. */
  y?: number
  /** Sidmarginal (mm) om dokumentet inte använder PDF_MARGIN (jobbrapporten: 15). */
  margin?: number
}

/**
 * Ritar sidhuvudet och returnerar y under den avslutande linjen — där
 * dokumentets eget innehåll börjar. Vänster: logga + firma + org.nr/adress/
 * kontakt. Höger: dokumenttyp (accent) + titel + meta. Höjden anpassas efter
 * den sida som är längst så att inget hamnar under linjen.
 */
export function drawBrandHeader(doc: jsPDF, brand: PdfBranding, opts: BrandHeaderOptions): number {
  const { branding, logo, accent } = brand
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = opts.margin ?? PDF_MARGIN
  const y = opts.y ?? margin
  const rightX = pageWidth - margin

  let textX = margin
  if (logo) {
    try {
      let w = PDF_LOGO_MAX_W
      let h = PDF_LOGO_MAX_H
      const props = doc.getImageProperties(logo.data)
      if (props?.width && props?.height) {
        const ratio = props.width / props.height
        h = PDF_LOGO_MAX_H
        w = h * ratio
        if (w > PDF_LOGO_MAX_W) { w = PDF_LOGO_MAX_W; h = w / ratio }
      }
      doc.addImage(logo.data, logo.format, margin, y, w, h)
      textX = margin + w + 4
    } catch (err) {
      console.error('[branding/pdf] kunde inte rita logga i sidhuvudet:', err)
      textX = margin
    }
  }

  // Vänster: firma + företagsrader. Bredden begränsas så den inte går in i
  // högerspalten (titeln kan vara bred, t.ex. ett långt projektnamn).
  const leftMaxW = pageWidth * 0.55 - textX
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...PDF_TEXT_PRIMARY)
  const nameLines = doc.splitTextToSize(branding.businessName, leftMaxW) as string[]
  nameLines.slice(0, 2).forEach((line, i) => doc.text(line, textX, y + 5 + i * 6))
  const nameBottom = y + 5 + Math.min(nameLines.length, 2) * 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...PDF_TEXT_MUTED)
  const companyLines = [
    branding.orgNumber ? `Org.nr ${branding.orgNumber}` : null,
    branding.address || null,
    [branding.contactPhone, branding.contactEmail].filter(Boolean).join(' · ') || null,
  ].filter(Boolean) as string[]
  companyLines.forEach((line, i) => doc.text(line, textX, nameBottom - 1 + i * 4, { maxWidth: leftMaxW }))
  const leftBottom = Math.max(nameBottom - 1 + Math.max(companyLines.length - 1, 0) * 4, y + PDF_LOGO_MAX_H)

  // Höger: dokumenttyp i accent, titel, meta.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...accent)
  doc.text(opts.docType.toUpperCase(), rightX, y + 3, { align: 'right' })
  doc.setFontSize(18)
  doc.setTextColor(...PDF_TEXT_PRIMARY)
  const titleLines = (doc.splitTextToSize(opts.title, pageWidth * 0.4) as string[]).slice(0, 2)
  titleLines.forEach((line, i) => doc.text(line, rightX, y + 11 + i * 7, { align: 'right' }))
  let rightBottom = y + 11 + (titleLines.length - 1) * 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...PDF_TEXT_MUTED)
  const meta = opts.meta ?? []
  meta.forEach((line, i) => doc.text(line, rightX, rightBottom + 6 + i * 4, { align: 'right' }))
  if (meta.length) rightBottom += 6 + (meta.length - 1) * 4

  // Linjen i accentfärgen — under det som är lägst.
  const lineY = Math.max(leftBottom, rightBottom) + 5
  doc.setDrawColor(...accent)
  doc.setLineWidth(0.4)
  doc.line(margin, lineY, rightX, lineY)
  doc.setTextColor(...PDF_TEXT_PRIMARY)
  return lineY + 8
}

/** Sidfotens vänstertext: firma · Org.nr · Godkänd för F-skatt · telefon · e-post. */
export function brandFooterText(branding: Branding): string {
  return [
    branding.businessName,
    branding.orgNumber ? `Org.nr ${branding.orgNumber}` : null,
    branding.fSkattRegistered ? 'Godkänd för F-skatt' : null,
    branding.contactPhone,
    branding.contactEmail,
  ].filter(Boolean).join(' · ')
}

/**
 * Sidfot på varje sida: företagsraden till vänster, "Sida i av n" till
 * höger. Anropas SIST, när alla sidor finns; lämnar dokumentet på sista
 * sidan. Stämpeln ritas INTE här — varje renderare anropar
 * stampAttributionOnPdf(doc, …) själv, synligt för facit-attribution-pdf.
 */
export function drawBrandFooter(doc: jsPDF, brand: PdfBranding, opts: { margin?: number } = {}): void {
  const { branding } = brand
  const margin = opts.margin ?? PDF_MARGIN
  const pageWidth = doc.internal.pageSize.getWidth()
  const footerY = doc.internal.pageSize.getHeight() - PDF_FOOTER_FROM_BOTTOM
  const pageCount = doc.getNumberOfPages()
  const left = brandFooterText(branding)
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...PDF_TEXT_SECONDARY)
    doc.text(left, margin, footerY, { maxWidth: pageWidth - margin * 2 - 30 })
    doc.text(`Sida ${i} av ${pageCount}`, pageWidth - margin, footerY, { align: 'right' })
  }
}
