/**
 * Facit: Dokumentfamiljen (PDF) — varumärket i jsPDF-dokumenten
 * (lib/branding/pdf.ts, yta 2 i varumärkeslagret, 2026-09-07).
 *
 *   npx playwright test tests/pdf-varumarke.spec.ts --project=chromium --no-deps
 *
 * Källskanning + ren rendering — ingen webbläsare, ingen databas. Vaktar att
 *   1. de fyra fältdokumenten (byggdagbok, egenkontroll, arbetsorder, ÄTA)
 *      och jobbrapporten ritar sidhuvud, sidfot OCH stämpel via helpern —
 *      ingen har kvar Handymates teal hårdkodad som accent,
 *   2. faktura-fallbacken (generateInvoicePDF) tar accent + logga ur
 *      firman — båda anroparna skickar dem,
 *   3. helpern faktiskt ritar det den lovar: logga, firma, org.nr,
 *      dokumenttyp, "Sida i av n", F-skatt bara när den är sann,
 *   4. loggan faller tyst bort vid fel/okänt format — dokumentet får aldrig
 *      fallera på loggan,
 *   5. get-branding bär address + f_skatt_registered (kolumnlistan och
 *      Branding) så sidhuvud/sidfot inte behöver egna queries.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import jsPDF from 'jspdf'
import {
  accentRgb,
  brandFooterText,
  drawBrandFooter,
  drawBrandHeader,
  loadPdfLogo,
  pdfBrandingFrom,
  PDF_LOGO_MAX_H,
  PDF_LOGO_MAX_W,
} from '../lib/branding/pdf'
import { brandingFromConfig, BRANDING_COLUMNS, type Branding } from '../lib/branding/get-branding'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

/** Renderare som ska rita hela varumärket (sidhuvud + sidfot + stämpel) via helpern. */
const FALTDOKUMENT = [
  'app/api/projects/[id]/logs/pdf/route.ts',        // byggdagbok
  'app/api/form-submissions/[id]/pdf/route.ts',     // egenkontroll / skyddsrond / besiktning
  'app/api/work-orders/[id]/pdf/route.ts',          // arbetsorder
  'lib/ata/pdf.ts',                                 // ÄTA
  'lib/job-report.ts',                              // jobbrapport
]

/** 1×1 px PNG (transparent) — nog för att jsPDF ska kunna läsa bildens mått. */
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function brandOf(over: Partial<Branding> = {}): Branding {
  return {
    ...brandingFromConfig({
      business_name: 'Testfirma AB',
      org_number: '556677-8899',
      address: 'Verkstadsgatan 4, 123 45 Teststad',
      public_phone: '070-123 45 67',
      contact_email: 'info@testfirma.se',
      accent_color: '#123456',
      f_skatt_registered: true,
      referral_code: 'TEST-1234',
    }),
    ...over,
  }
}

test.describe('källskanning — fältdokumenten ritar varumärket via helpern', () => {
  for (const rel of FALTDOKUMENT) {
    test(`${rel} använder drawBrandHeader + drawBrandFooter + stämpeln`, () => {
      const src = kod(rel)
      expect(src).toMatch(/from '(@\/lib\/|(\.\.\/)+)branding\/pdf'/)
      expect(src).toContain('drawBrandHeader(doc, brand, {')
      expect(src).toContain('drawBrandFooter(doc, brand')
      expect(src).toContain('stampAttributionOnPdf(doc,')
    })

    test(`${rel} har ingen hårdkodad Handymate-teal kvar`, () => {
      const src = kod(rel)
      expect(src).not.toContain('[15, 118, 110]')
      expect(src).not.toContain('setFillColor(15, 118, 110)')
      expect(src).not.toContain("'#0F766E'")
    })
  }

  test('ÄTA-kontexten laddar varumärket EN gång via loadPdfBranding (ingen egen kolumnlista)', () => {
    const src = kod('lib/ata/pdf-data.ts')
    expect(src).toContain("loadPdfBranding(supabase, ata.business_id, 'ata/pdf')")
    expect(src).not.toContain("from('business_config')")
    expect(src).not.toContain('attribution_link_enabled')
  })

  test('byggdagboken och jobbrapporten laddar via loadPdfBranding, arbetsorder/egenkontroll bygger ur raden', () => {
    expect(kod('app/api/projects/[id]/logs/pdf/route.ts')).toContain("loadPdfBranding(supabase, businessId, 'projects/logs/pdf')")
    expect(kod('lib/job-report.ts')).toContain("loadPdfBranding(supabase, businessId, 'job-report')")
    // Hela raden finns redan (select('*')) — bara loggan hämtas, ingen extra query.
    expect(kod('app/api/work-orders/[id]/pdf/route.ts')).toContain("pdfBrandingFrom(brandingFromConfig(business), await loadPdfLogo(business.logo_url, 'work-orders/pdf'))")
    expect(kod('app/api/form-submissions/[id]/pdf/route.ts')).toContain("pdfBrandingFrom(brandingFromConfig(business), await loadPdfLogo(business.logo_url, 'form-submissions/pdf'))")
  })

  test('egenkontrollen sätter dokumenttyp efter mallens kategori', () => {
    const src = kod('app/api/form-submissions/[id]/pdf/route.ts')
    expect(src).toContain("egenkontroll: 'Egenkontroll'")
    expect(src).toContain("safety: 'Skyddsrond'")
    expect(src).toContain("inspection: 'Besiktningsprotokoll'")
    expect(src).toContain("|| 'Protokoll'")
  })

  test('jobbrapporten laddar varumärket färskt vid godkännande — inte ur payloaden', () => {
    const src = kod('lib/job-report.ts')
    // Stämpel-facit (facit-attribution-pdf) kräver loadAttribution kvar; brand laddas bredvid.
    expect(src).toContain('await loadAttribution(supabase, businessId)')
    expect(src).toContain('generateJobReportPdf(reportData, { attribution, brand })')
  })
})

test.describe('källskanning — faktura-fallbacken tar accent + logga ur firman', () => {
  test('generateInvoicePDF använder hexToRgb(business.accent_color) och ritar logo_base64', () => {
    const src = kod('lib/pdf-generator.ts')
    const invoiceFn = src.slice(src.indexOf('export function generateInvoicePDF'), src.indexOf('export interface BusinessPdfData'))
    expect(invoiceFn).toContain('const accent = hexToRgb(business.accent_color)')
    expect(invoiceFn).toContain('doc.addImage(business.logo_base64, business.logo_format')
    expect(invoiceFn).not.toContain('ACCENT_RGB')
  })

  for (const rel of ['app/api/invoices/pdf/route.ts', 'lib/invoices/send-invoice.ts']) {
    test(`${rel} skickar accent_color + logga till fallbacken`, () => {
      const src = kod(rel)
      expect(src).toContain('accent_color: businessConfig?.accent_color || undefined')
      expect(src).toContain('logo_base64: logo?.data')
      expect(src).toContain('logo_format: logo?.format')
      expect(src).toContain('loadPdfLogo(businessConfig?.logo_url')
      expect(src).not.toContain("accent_color: '#0F766E'")
      // Stämpel-facit: hela raden → buildAttribution direkt.
      expect(src).toContain('{ attribution: buildAttribution(businessConfig) }')
    })
  }
})

test.describe('get-branding bär det dokumenten behöver', () => {
  test('kolumnlistan har address + f_skatt_registered', () => {
    const cols = BRANDING_COLUMNS.split(',').map(s => s.trim())
    expect(cols).toContain('address')
    expect(cols).toContain('f_skatt_registered')
  })

  test('fSkattRegistered är bara true på === true; address trimmas', () => {
    expect(brandingFromConfig({ f_skatt_registered: true }).fSkattRegistered).toBe(true)
    expect(brandingFromConfig({ f_skatt_registered: false }).fSkattRegistered).toBe(false)
    expect(brandingFromConfig({ f_skatt_registered: null }).fSkattRegistered).toBe(false)
    expect(brandingFromConfig(null).fSkattRegistered).toBe(false)
    expect(brandingFromConfig({ address: '  Gatan 1  ' }).address).toBe('Gatan 1')
    expect(brandingFromConfig({ address: '   ' }).address).toBeUndefined()
  })
})

test.describe('helpern — rena funktioner', () => {
  test('accentRgb: giltig hex → RGB, ogiltig/tom → Handymates teal', () => {
    expect(accentRgb('#123456')).toEqual([18, 52, 86])
    expect(accentRgb('123456')).toEqual([18, 52, 86])
    expect(accentRgb('#FFFFFF')).toEqual([255, 255, 255])
    expect(accentRgb('red')).toEqual([15, 118, 110])
    expect(accentRgb('#12345')).toEqual([15, 118, 110])
    expect(accentRgb('')).toEqual([15, 118, 110])
    expect(accentRgb(null)).toEqual([15, 118, 110])
    expect(accentRgb(undefined)).toEqual([15, 118, 110])
  })

  test('pdfBrandingFrom tar accenten ur Branding', () => {
    const b = pdfBrandingFrom(brandOf())
    expect(b.accent).toEqual([18, 52, 86])
    expect(b.logo).toBeNull()
    expect(b.branding.businessName).toBe('Testfirma AB')
  })

  test('brandFooterText: F-skatt bara när den är sann, tomma delar utelämnas', () => {
    expect(brandFooterText(brandOf())).toBe(
      'Testfirma AB · Org.nr 556677-8899 · Godkänd för F-skatt · 070-123 45 67 · info@testfirma.se',
    )
    expect(brandFooterText(brandOf({ fSkattRegistered: false }))).not.toContain('F-skatt')
    expect(brandFooterText(brandOf({ orgNumber: undefined, contactPhone: undefined, contactEmail: undefined, fSkattRegistered: false })))
      .toBe('Testfirma AB')
  })
})

test.describe('loadPdfLogo — faller tyst, aldrig kastar', () => {
  const realFetch = globalThis.fetch
  test.afterEach(() => { globalThis.fetch = realFetch })

  function fakeFetch(status: number, contentType: string, bytes = Buffer.from('x')) {
    globalThis.fetch = (async () => ({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? contentType : null) },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    })) as unknown as typeof fetch
  }

  test('ingen url → null utan nätverk', async () => {
    globalThis.fetch = (async () => { throw new Error('ska inte anropas') }) as unknown as typeof fetch
    await expect(loadPdfLogo(null)).resolves.toBeNull()
    await expect(loadPdfLogo('')).resolves.toBeNull()
  })

  test('PNG → data-URL med format PNG; JPEG → JPEG', async () => {
    fakeFetch(200, 'image/png', Buffer.from('png'))
    await expect(loadPdfLogo('https://x/logo.png')).resolves.toEqual({
      data: `data:image/png;base64,${Buffer.from('png').toString('base64')}`,
      format: 'PNG',
    })
    fakeFetch(200, 'image/jpeg', Buffer.from('jpg'))
    await expect(loadPdfLogo('https://x/logo.jpg')).resolves.toMatchObject({ format: 'JPEG' })
  })

  test('SVG/WEBP (tillåtna vid uppladdning) → null, 404 → null, nätverksfel → null', async () => {
    fakeFetch(200, 'image/svg+xml')
    await expect(loadPdfLogo('https://x/logo.svg')).resolves.toBeNull()
    fakeFetch(200, 'image/webp')
    await expect(loadPdfLogo('https://x/logo.webp')).resolves.toBeNull()
    fakeFetch(404, 'image/png')
    await expect(loadPdfLogo('https://x/saknas.png')).resolves.toBeNull()
    globalThis.fetch = (async () => { throw new Error('nere') }) as unknown as typeof fetch
    await expect(loadPdfLogo('https://x/logo.png')).resolves.toBeNull()
  })
})

test.describe('helpern — riktig jsPDF-rendering', () => {
  /** jsPDF skriver texten okomprimerad i innehållsströmmen — "(…) Tj". */
  const pdfText = (doc: jsPDF) => doc.output()

  test('sidhuvud: firma, org.nr, adress, kontakt, dokumenttyp i versaler, titel, meta', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const y = drawBrandHeader(doc, pdfBrandingFrom(brandOf()), {
      docType: 'Byggdagbok',
      title: 'Badrum Andersson',
      meta: ['Kund: Anna Andersson', 'Exporterad 2026-09-07'],
    })
    const out = pdfText(doc)
    expect(out).toContain('(Testfirma AB) Tj')
    expect(out).toContain('(Org.nr 556677-8899) Tj')
    expect(out).toContain('(Verkstadsgatan 4, 123 45 Teststad) Tj')
    expect(out).toContain('(070-123 45 67 ')          // "070-… · info@…" — mittpunkten är icke-ASCII
    expect(out).toContain('(BYGGDAGBOK) Tj')
    expect(out).toContain('(Badrum Andersson) Tj')
    expect(out).toContain('(Kund: Anna Andersson) Tj')
    expect(out).toContain('(Exporterad 2026-09-07) Tj')
    // Innehållet börjar under linjen — aldrig i sidhuvudet.
    expect(y).toBeGreaterThan(20 + PDF_LOGO_MAX_H)
    expect(y).toBeLessThan(70)
  })

  test('sidhuvud utan org.nr/adress/kontakt ritar inga tomma rader och kraschar inte', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const y = drawBrandHeader(doc, pdfBrandingFrom(brandOf({
      orgNumber: undefined, address: undefined, contactPhone: undefined, contactEmail: undefined,
    })), { docType: 'Arbetsorder', title: 'AO-2026-0042' })
    const out = pdfText(doc)
    expect(out).not.toContain('(Org.nr')
    expect(out).toContain('(ARBETSORDER) Tj')
    expect(out).toContain('(AO-2026-0042) Tj')
    expect(y).toBeGreaterThan(20)
  })

  test('sidhuvud med logga: bilden ritas inom 35×14 mm och texten flyttas åt höger', () => {
    const brand = pdfBrandingFrom(brandOf(), { data: PNG_1PX, format: 'PNG' })
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const calls: Array<[number, number, number, number]> = []
    const orig = doc.addImage.bind(doc)
    ;(doc as any).addImage = (img: any, fmt: any, x: number, y: number, w: number, h: number) => {
      calls.push([x, y, w, h])
      return orig(img, fmt, x, y, w, h)
    }
    drawBrandHeader(doc, brand, { docType: 'ÄTA', title: 'ÄTA-3' })
    expect(calls).toHaveLength(1)
    const [x, y, w, h] = calls[0]
    expect(x).toBe(20)
    expect(y).toBe(20)
    expect(w).toBeLessThanOrEqual(PDF_LOGO_MAX_W)
    expect(h).toBeLessThanOrEqual(PDF_LOGO_MAX_H)
    expect(pdfText(doc)).toContain('/Subtype /Image')
    expect(pdfText(doc)).toContain('(Testfirma AB) Tj')
  })

  test('trasig logga: dokumentet renderas ändå, utan bild', () => {
    const brand = pdfBrandingFrom(brandOf(), { data: 'data:image/png;base64,QUJD', format: 'PNG' })
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const warn = console.error
    console.error = () => {}
    try {
      expect(() => drawBrandHeader(doc, brand, { docType: 'Egenkontroll', title: 'Våtrum' })).not.toThrow()
    } finally {
      console.error = warn
    }
    expect(pdfText(doc)).toContain('(Testfirma AB) Tj')
    expect(pdfText(doc)).toContain('(EGENKONTROLL) Tj')
  })

  test('sidfot på varje sida: företagsraden + "Sida i av n"; F-skatt bara när sann', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    doc.addPage()
    doc.addPage()
    drawBrandFooter(doc, pdfBrandingFrom(brandOf()))
    const out = pdfText(doc)
    expect(out).toContain('(Sida 1 av 3) Tj')
    expect(out).toContain('(Sida 2 av 3) Tj')
    expect(out).toContain('(Sida 3 av 3) Tj')
    expect(out.match(/\(Testfirma AB /g)?.length).toBe(3)
    expect(out).toContain('F-skatt')
    // Lämnar dokumentet på sista sidan så stämpeln hamnar rätt.
    expect(doc.getCurrentPageInfo().pageNumber).toBe(3)

    const utan = new jsPDF({ unit: 'mm', format: 'a4' })
    drawBrandFooter(utan, pdfBrandingFrom(brandOf({ fSkattRegistered: false })))
    expect(pdfText(utan)).not.toContain('F-skatt')
  })

  test('accentfärgen används för dokumenttyp och linje — inte Handymates teal', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    drawBrandHeader(doc, pdfBrandingFrom(brandOf({ accentColor: '#C0392B' })), { docType: 'Byggdagbok', title: 'X' })
    const out = pdfText(doc)
    // jsPDF skriver färger som decimaltal 0–1: 192/255=0.753, 57/255=0.224, 43/255=0.169
    expect(out).toMatch(/0\.753 0\.224 0\.169 (rg|RG)/)
    expect(out).not.toMatch(/0\.059 0\.463 0\.431 (rg|RG)/) // #0F766E
  })
})
