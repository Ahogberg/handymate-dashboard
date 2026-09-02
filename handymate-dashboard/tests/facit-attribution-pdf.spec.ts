/**
 * Facit: Handymate-stämpeln i PDF-renderarna
 * (lib/branding/attribution.ts, sql/v200).
 *
 *   npx playwright test tests/facit-attribution-pdf.spec.ts --project=chromium --no-deps
 *
 * Källskanning + ren rendering — ingen webbläsare, ingen databas. Vaktar att
 *   1. varje PDF-renderare (HTML→Chromium-mallarna OCH jsPDF-fallbackarna)
 *      hämtar stämpeln från helpern — ingen yta bygger sin egen sträng,
 *   2. ingen av dem har kvar den gamla klartexten ("Genererad via Handymate"),
 *   3. jsPDF-vägen ritar en klickbar länk (doc.textWithLink) när url finns,
 *   4. anropare med hela business_config-raden bygger direkt, anropare med
 *      kolumnlista laddar via loadAttribution (aldrig attribution_link_enabled
 *      i en kolumnlista — PostgREST fäller hela selecten före v200),
 *   5. mallarna faktiskt renderar stämpeln, sist i dokumentet, med länk när
 *      referral_code finns och utan när länken är avstängd.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { renderModernHtml } from '../lib/quote-templates/render-react'
import { renderPremium } from '../lib/quote-templates/premium'
import { renderFriendly } from '../lib/quote-templates/friendly'
import { renderModernInvoiceHtml } from '../lib/invoice-templates/render-react'
import { renderPremium as renderInvoicePremium } from '../lib/invoice-templates/premium'
import { renderFriendly as renderInvoiceFriendly } from '../lib/invoice-templates/friendly'
import { buildAttribution, ATTRIBUTION_TEXT } from '../lib/branding/attribution'
import type { QuoteTemplateData } from '../lib/quote-templates/types'
import type { InvoiceTemplateData } from '../lib/invoice-templates/types'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')
const IMPORT_RE = /from '(@\/lib\/|(\.\.\/)+)branding\/attribution'/

/** HTML→PDF-mallarna (puppeteer, lib/pdf/render-html-to-pdf.ts). */
const HTML_RENDERARE = [
  'components/quotes/document/QuoteDocument.tsx', // modern (offert + faktura) via render-react
  'lib/quote-templates/premium.ts',
  'lib/quote-templates/friendly.ts',
  'lib/invoice-templates/premium.ts',
  'lib/invoice-templates/friendly.ts',
]

/** jsPDF-renderarna (fallback + ÄTA + jobbrapport). */
const JSPDF_RENDERARE = [
  'lib/pdf-generator.ts',   // generateInvoicePDF + generateQuotePDF
  'lib/ata/pdf.ts',         // generateAtaPDF
  'lib/job-report.ts',      // generateJobReportPdf
]

test.describe('stämpeln kommer från helpern', () => {
  for (const rel of [...HTML_RENDERARE, ...JSPDF_RENDERARE]) {
    test(`${rel} importerar från lib/branding/attribution`, () => {
      expect(kod(rel)).toMatch(IMPORT_RE)
    })

    test(`${rel} har ingen egen Handymate-klartext kvar`, () => {
      const src = kod(rel)
      expect(src).not.toContain('via Handymate')
      expect(src).not.toContain('Genererad via Handymate')
      expect(src).not.toContain('Powered by Handymate')
    })
  }

  for (const rel of HTML_RENDERARE) {
    test(`${rel} renderar attributionDocumentHtml med fallback utan länk`, () => {
      expect(kod(rel)).toContain('attributionDocumentHtml(data.attribution ?? buildAttribution(null))')
    })
  }

  for (const rel of JSPDF_RENDERARE) {
    test(`${rel} ritar stämpeln via stampAttributionOnPdf`, () => {
      expect(kod(rel)).toContain('stampAttributionOnPdf(doc,')
    })
  }

  test('jsPDF-helpern ritar en klickbar länk (textWithLink) på sista sidan', () => {
    const src = kod('lib/branding/attribution.ts')
    expect(src).toContain('export function stampAttributionOnPdf')
    expect(src).toContain('doc.setPage(doc.getNumberOfPages())')
    expect(src).toMatch(/if \(url\) doc\.textWithLink\(text, x, y, \{ url, align: 'center' \}\)/)
    expect(src).toMatch(/else doc\.text\(text, x, y, \{ align: 'center' \}\)/)
    // Grå (#6b7280) och liten (8pt) — ska inte konkurrera med dokumentet.
    expect(src).toContain('[107, 114, 128]')
    expect(src).toContain('PDF_STAMP_FONT_PT = 8')
  })

  test('puppeteer-vägen använder ingen footerTemplate (länkar i footerTemplate är inte klickbara)', () => {
    const src = kod('lib/pdf/render-html-to-pdf.ts')
    expect(src).not.toContain('footerTemplate')
    expect(src).not.toContain('displayHeaderFooter')
  })
})

test.describe('underlaget hämtas rätt', () => {
  test('data-builders sätter stämpeln från config (rätt när config är hela raden)', () => {
    expect(kod('lib/quote-templates/data-builder.ts')).toContain('attribution: buildAttribution(config)')
    expect(kod('lib/invoice-templates/data-builder.ts')).toContain('attribution: buildAttribution(config)')
  })

  test('ytor med hela business_config-raden i scope bygger direkt (ingen extra query)', () => {
    // getAuthenticatedBusiness → select('*'); invoices/pdf + send-invoice hämtar businessConfig med '*'
    expect(kod('app/api/quotes/pdf/route.ts')).toContain('const attribution = buildAttribution(business)')
    expect(kod('app/api/quotes/pdf/route.ts')).toContain('attribution = buildAttribution(business)')
    expect(kod('app/api/quotes/preview-html/route.ts')).toContain('templateData.attribution = buildAttribution(business)')
    expect(kod('app/api/invoices/[id]/reminder-pdf/route.ts')).toContain('const attribution = buildAttribution(business)')
    expect(kod('app/api/invoices/pdf/route.ts')).toContain('{ attribution: buildAttribution(businessConfig) }')
    expect(kod('lib/invoices/send-invoice.ts')).toContain('{ attribution: buildAttribution(businessConfig) }')
    expect(kod('app/api/ata/[id]/pdf/route.ts')).toContain('attribution: buildAttribution(business)')
  })

  test('ytor utan raden laddar via loadAttribution (EN query, aldrig i loop)', () => {
    expect(kod('app/api/quotes/pdf/route.ts')).toContain('await loadAttribution(supabase, quote.business_id)')
    expect(kod('app/api/quotes/public/[token]/route.ts')).toContain('await loadAttribution(supabase, quote.business_id)')
    expect(kod('app/api/portal/[token]/invoices/[id]/route.ts')).toContain('await loadAttribution(supabase, customer.business_id)')
    expect(kod('app/api/ata/sign/[token]/pdf/route.ts')).toContain('await loadAttribution(supabase, ata.business_id)')
    expect(kod('lib/job-report.ts')).toContain('await loadAttribution(supabase, businessId)')
  })

  test('attribution_link_enabled ligger aldrig i en explicit kolumnlista', () => {
    for (const rel of [
      'app/api/quotes/pdf/route.ts',
      'app/api/quotes/preview-html/route.ts',
      'app/api/invoices/[id]/reminder-pdf/route.ts',
      'app/api/portal/[token]/invoices/[id]/route.ts',
      'lib/business/quote-surface-select.ts',
      'lib/ata/pdf-data.ts',
    ]) {
      expect(kod(rel), rel).not.toContain('attribution_link_enabled')
    }
  })

  test('buildInvoicePdfBuffer tar valfri attribution-override', () => {
    const src = kod('lib/invoices/build-invoice-pdf.ts')
    expect(src).toContain('attribution?: Attribution')
    expect(src).toContain('if (opts?.attribution) templateData.attribution = opts.attribution')
  })
})

// ── Rendering: stämpeln finns, sist, med/utan länk ─────────────────────────

const MED_LANK = buildAttribution({ referral_code: 'bygg-co', attribution_link_enabled: true })
const UTAN_LANK = buildAttribution({ referral_code: 'bygg-co', attribution_link_enabled: false })

function offert(attribution?: QuoteTemplateData['attribution']): QuoteTemplateData {
  return {
    attribution,
    isSigned: false,
    signatureCta: 'hidden',
    business: {
      name: 'Bygg & Co AB', orgNumber: '556677-8899', address: 'Verkstadsgatan 4, 123 45 Storstad',
      contactName: 'Anna Andersson', phone: '070-1234567', email: 'anna@byggco.se',
      bankgiro: '123-4567', fSkatt: true, accentColor: '#0F766E',
    },
    customer: { name: 'Kalle Kund', address: 'Kundvägen 1', postalCode: '123 45', city: 'Storstad', phone: null, email: null },
    quote: {
      number: 'OF-2026-0042', issuedDate: '3 augusti 2026', validUntilDate: '2 september 2026',
      title: 'Badrumsrenovering', description: null,
      items: [{ itemType: 'item', id: 'i1', name: 'Rivning', quantity: 8, unit: 'tim', unitPrice: 650, total: 5200 }],
      subtotalExVat: 5200, vatAmount: 1300, totalIncVat: 6500, amountToPay: 6500,
      paymentTerms: '30 dagar netto',
    },
    displayLevel: 'full', showQuantities: true, showUnitPrices: true,
  }
}

function faktura(attribution?: InvoiceTemplateData['attribution']): InvoiceTemplateData {
  return {
    attribution,
    business: {
      name: 'Bygg & Co AB', orgNumber: '556677-8899', address: 'Verkstadsgatan 4, 123 45 Storstad',
      contactName: 'Anna Andersson', phone: '070-1234567', email: 'anna@byggco.se',
      bankgiro: '123-4567', fSkatt: true, accentColor: '#0F766E',
    },
    customer: { name: 'Kalle Kund', address: 'Kundvägen 1', postalCode: '123 45', city: 'Storstad', phone: null, email: null },
    invoice: {
      number: 'F-2026-0042', status: 'unpaid', daysOverdue: 0,
      invoiceDate: '3 augusti 2026', dueDate: '2 september 2026', ocrNumber: '12345678',
      title: 'Badrumsrenovering',
      items: [{ itemType: 'item', id: 'i1', name: 'Rivning', quantity: 8, unit: 'tim', unitPrice: 650, total: 5200 }],
      subtotalExVat: 5200, vatAmount: 1300, vatRate: 25, totalIncVat: 6500, amountToPay: 6500,
      paymentTerms: '30 dagar netto',
    },
    swishQrDataUrl: null,
  }
}

const MALLAR: Array<[string, (a?: QuoteTemplateData['attribution']) => string]> = [
  ['offert modern', a => renderModernHtml(offert(a))],
  ['offert premium', a => renderPremium(offert(a))],
  ['offert friendly', a => renderFriendly(offert(a))],
  ['faktura modern', a => renderModernInvoiceHtml(faktura(a))],
  ['faktura premium', a => renderInvoicePremium(faktura(a))],
  ['faktura friendly', a => renderInvoiceFriendly(faktura(a))],
]

test.describe('mallarna renderar stämpeln sist', () => {
  for (const [namn, render] of MALLAR) {
    test(`${namn}: med länk när referral_code finns`, () => {
      const html = render(MED_LANK)
      expect(html).toContain('class="hm-attribution"')
      expect(html).toContain(`href="${MED_LANK.url}"`)
      expect(MED_LANK.url).toMatch(/\/via\/bygg-co$/)
      // Exakt en stämpel, och den ligger efter det sista synliga innehållet
      // (footer/footer-card) — inget dokumentinnehåll efter den.
      expect(html.match(/class="hm-attribution"/g)?.length).toBe(1)
      const efter = html.slice(html.indexOf('<div class="hm-attribution"'))
      expect(efter).not.toMatch(/class="(footer|footer-card|card footer-card)"/)
      expect(efter.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).toBe(ATTRIBUTION_TEXT)
    })

    test(`${namn}: utan länk när företaget stängt av den`, () => {
      const html = render(UTAN_LANK)
      expect(html).toContain('class="hm-attribution"')
      expect(html).not.toContain('/via/bygg-co')
      expect(html).toContain(ATTRIBUTION_TEXT)
    })

    test(`${namn}: texten utan länk när attribution saknas (legacy-anropare)`, () => {
      const html = render(undefined)
      expect(html).toContain('class="hm-attribution"')
      expect(html).not.toContain('/via/')
      expect(html).toContain(ATTRIBUTION_TEXT)
    })
  }
})
