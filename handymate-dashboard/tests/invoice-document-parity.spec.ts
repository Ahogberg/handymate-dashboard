/**
 * Paritetstest — ETAPP 6a (offert-masterplan.md, faktura-sprinten).
 *
 * Verifierar att den NYA dokumentmotorn (QuoteDocument i docType='invoice'-
 * läge → renderModernInvoiceHtml, lib/invoice-templates/render-react.tsx)
 * producerar SEMANTISKT samma kundfacing innehåll som den GAMLA mallsträngen
 * (lib/invoice-templates/modern.ts, nu RADERAD — se commit-historik) för
 * samma InvoiceTemplateData. modern.ts pensionerades EFTER att detta test
 * var grönt. HTML:en den producerade vid cutovern är frusen som fixture-
 * filer (tests/fixtures/invoice-document-parity/*.html).
 *
 * METODIK — SKILJER SIG MEDVETET från tests/quote-document-parity.spec.ts:
 * offertens test gör en exakt textjämförelse (samma innehåll i samma
 * ORDNING) eftersom E2a INTE flyttade om något — bara bytte renderare för
 * OFÖRÄNDRAD layout. ETAPP 6a gjorde en avsiktlig layoutförbättring i samma
 * steg: OCR-raden, betalinstruktionerna, sen-notisen och kreditfaktura/
 * betald-banderollen flyttades från TVÅ separata positioner i gamla mallen
 * (refs-block FÖRE titeln; sen-notis+betalbox EFTER totalerna) till EN
 * sammanhållen sektion (InvoicePaymentSection, EFTER totalerna) —
 * masterplanens egen beskrivning grupperar dem som en enhet ("OCR-rad ...
 * betalinstruktioner ... förfallodatum-prominens + late-notice-kort"). En
 * rak text-i-samma-ordning-jämförelse (offertens metodik) skulle falla på
 * denna AVSIKTLIGA omstrukturering — inte en regression — så testet mäter
 * här "semantisk jämförelse" (masterplanens egen ordval) som NÄRVARO av
 * rätt innehåll snarare än bytesidentisk ordning:
 *
 *   1. Strukturell parity: samma antal <tr>-rader, samma nyckelklasser.
 *   2. Innehållsparity: varje betydelsebärande textstycke ur den GAMLA
 *      frysta baselinen (header, parter, titel, radnamn+belopp, summeringar,
 *      villkorstext, footer — DEN ÅTERANVÄNDA KÄRNAN) återfinns i den NYA
 *      renderns text. Detta fångar en riktig regression (fält som tappas,
 *      fel belopp, fel etikett) lika säkert som en ordningskänslig diff,
 *      utan att falla på den medvetna omflyttningen.
 *   3. Kritiska betalningsfält (OCR, belopp, förfallodatum, bankgiro,
 *      Swish-nummer, dröjsmålsränta, kreditskäl, betald-datum) verifieras
 *      explicit per fixture — bevisar att ingen data tappades när
 *      InvoicePaymentSection samlade ihop dem.
 *
 * Körs: npx playwright test tests/invoice-document-parity.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { renderModernInvoiceHtml } from '../lib/invoice-templates/render-react'
import type { InvoiceTemplateData, InvoiceTemplateItem } from '../lib/invoice-templates/types'

const FIXTURE_DIR = path.join(__dirname, 'fixtures/invoice-document-parity')
function loadFrozenBaseline(name: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, `${name}.html`), 'utf8')
}

function baseItems(): InvoiceTemplateItem[] {
  return [
    { name: 'Rivning badrum', description: 'Bilning golv + väggar', quantity: 8, unit: 'tim', unitPrice: 650, total: 5200 },
    { name: 'Kakel 30x60', quantity: 12, unit: 'm2', unitPrice: 450, total: 5400 },
    { name: 'Blandare', quantity: 1, unit: 'st', unitPrice: 1800, total: 1800 },
  ]
}

function fixtureFull(): InvoiceTemplateData {
  return {
    business: {
      name: 'Bygg & Co AB', orgNumber: '556677-8899', address: 'Verkstadsgatan 4, 123 45 Storstad',
      contactName: 'Anna Andersson', phone: '070-1234567', email: 'anna@byggco.se', website: null,
      bankgiro: '123-4567', plusgiro: null, swish: '1234567', fSkatt: true, momsRegnr: 'SE556677889901',
      accentColor: '#0F766E', logoUrl: null, tagline: 'Din lokala hantverkare',
    },
    customer: {
      name: 'Kalle Kund', address: 'Kundvägen 1', postalCode: '123 45', city: 'Storstad',
      phone: '070-9876543', email: 'kalle@kund.se', personnummer: '19800101-1234', reference: null,
    },
    invoice: {
      number: 'FV-2026-0042', invoiceDate: '3 augusti 2026', dueDate: '2 september 2026', paidDate: null,
      status: 'unpaid', daysOverdue: 0, ocrNumber: '420260002',
      title: 'Badrumsrenovering', description: 'Slutfaktura för utfört arbete enligt offert.',
      items: baseItems(),
      subtotalExVat: 12400, vatAmount: 3100, vatRate: 25, totalIncVat: 15500,
      rotDeduction: 1560, rutDeduction: undefined, rotRutType: 'rot',
      amountToPay: 13940,
      paymentTerms: '30 dagar netto', introductionText: null, conclusionText: 'Tack för förtroendet!',
      quoteReference: 'OF-2026-0042', ourReference: 'Anna Andersson', yourReference: 'Kalle Kund',
      isCreditNote: false,
    },
    swishQrDataUrl: 'data:image/png;base64,AAAA',
  } as InvoiceTemplateData
}

function fixtureOverdue(): InvoiceTemplateData {
  const f = fixtureFull()
  return {
    ...f,
    invoice: {
      ...f.invoice,
      status: 'overdue', daysOverdue: 12,
      lateInterest: 45.5, lateInterestRate: 8, reminderFee: 60,
      amountToPay: f.invoice.amountToPay + 45.5 + 60,
    },
  } as InvoiceTemplateData
}

function fixtureCredit(): InvoiceTemplateData {
  const f = fixtureFull()
  return {
    ...f,
    invoice: {
      ...f.invoice,
      number: 'FV-2026-0043', title: 'Kreditfaktura — Badrumsrenovering', isCreditNote: true,
      items: f.invoice.items.map(i => ({ ...i, unitPrice: -i.unitPrice, total: -i.total })),
      subtotalExVat: -12400, vatAmount: -3100, totalIncVat: -15500,
      rotDeduction: -1560, amountToPay: -13940,
    },
    swishQrDataUrl: null,
  } as InvoiceTemplateData
}

function fixturePaid(): InvoiceTemplateData {
  const f = fixtureFull()
  return {
    ...f,
    invoice: { ...f.invoice, status: 'paid', paidDate: '10 augusti 2026' },
  } as InvoiceTemplateData
}

/** Strippar <style>/<script>-block + alla taggar, normaliserar whitespace. */
function extractText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function trCount(html: string): number {
  return (html.match(/<tr[\s>]/g) || []).length
}

const KEY_CLASSES = [
  'class="page"', 'class="quote-title"', 'class="header"', 'class="parties"',
  'item-name', 'item-desc', 'total-row', 'total-row grand', 'class="terms"', 'class="footer"',
]

function stripStyleBlocks(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '')
}

function assertKeyClassesMatch(oldHtml: string, newHtml: string) {
  const oldBody = stripStyleBlocks(oldHtml)
  const newBody = stripStyleBlocks(newHtml)
  for (const cls of KEY_CLASSES) {
    const inOld = oldBody.includes(cls)
    const inNew = newBody.includes(cls)
    expect(inNew, `nyckelklass "${cls}": förekomst i ny renderare ska matcha gamla (gammal=${inOld})`).toBe(inOld)
  }
}

/**
 * Den ÅTERANVÄNDA kärnans betydelsebärande textstycken — plockade direkt
 * ur den frysta gamla baselinen (INTE omskrivna av handen, se testkroppen)
 * så att jämförelsen bevisligen mäter mot facit och inte mot en förhandsifylld
 * förväntan. Payment-/refs-/sen-notis-frasers rader exkluderas explicit
 * (de hör till den medvetet omflyttade sektionen, verifieras separat via
 * criticalStrings nedan).
 */
function coreContentPhrases(oldHtml: string): string[] {
  const text = extractText(oldHtml)
  // Klipp bort allt FÖRE "Avsändare" (titel/head/print-bar/brand — redan
  // dubbelkollat via KEY_CLASSES) och dela på gemensamma skiljetecken för
  // att få hanterbara, distinkta fraser att leta efter var för sig.
  const from = text.indexOf('Avsändare')
  const core = from > -1 ? text.slice(from) : text
  return core
    .split(/(?<=[.!?])\s+|\s{2,}/)
    .map(s => s.trim())
    .filter(s => s.length > 3)
}

for (const [label, fixtureName, fixture, criticalStrings] of [
  [
    'full (item-rader, ROT, Swish, referenser)', 'full', fixtureFull,
    ['4202 6000 2', '13 940 kr', '2 september 2026', '123-4567', '1234567', '−1 560 kr'],
  ] as const,
  [
    'overdue (dröjsmålsränta + påminnelseavgift + försenad-notis)', 'overdue', fixtureOverdue,
    ['12 dagar försenad', '+ 46 kr', '+ 60 kr', 'Fakturan är försenad', '14 046 kr'],
  ] as const,
  [
    'credit (kreditfaktura, negativa belopp)', 'credit', fixtureCredit,
    ['Kreditfaktura', '−13 940 kr', '−1 560 kr'],
  ] as const,
  [
    'paid (betald-kvitto, ingen betalinstruktion)', 'paid', fixturePaid,
    ['Fakturan är betald', '10 augusti 2026'],
  ] as const,
]) {
  test(`renderModernInvoiceHtml vs frusen modern.ts-baseline — ${label}`, () => {
    const data = fixture()
    const oldHtml = loadFrozenBaseline(fixtureName)
    const newHtml = renderModernInvoiceHtml(data)
    const newText = extractText(newHtml)

    // 1. Strukturell parity.
    expect(trCount(newHtml)).toBe(trCount(oldHtml))
    assertKeyClassesMatch(oldHtml, newHtml)

    // 2. Innehållsparity för den ÅTERANVÄNDA kärnan — varje meningsfull
    // fras ur den gamla baselinen ska finnas i den nya texten. (Fraser som
    // hör till det medvetet omflyttade betal-/refs-/sen-notis-blocket kan
    // saknas här om de råkar delas mitt itu av split-regexen — det är okej,
    // de fångas separat och exakt av criticalStrings nedan.)
    const missing = coreContentPhrases(oldHtml).filter(phrase => !newText.includes(phrase))
    // Tillåt att fraser ur SJÄLVA det omplacerade blocket (innehåller "OCR",
    // "Bankgiro", "Belopp", "Förfaller", "Betalning", "Swish", "dagar
    // försenad", "Dröjsmålsränta", "Påminnelseavgift", "betald") saknas här
    // — de existerar, bara omgrupperade, och verifieras exakt av
    // criticalStrings. Allt ANNAT måste finnas oförändrat.
    const paymentBlockMarkers = /OCR|Bankgiro|Plusgiro|Belopp|Förfaller|Betalning|Swish|försenad|Dröjsmålsränta|Påminnelseavgift|betald|Betald/i
    const realMisses = missing.filter(phrase => !paymentBlockMarkers.test(phrase))
    expect(realMisses, `kärninnehåll saknas i ny render: ${JSON.stringify(realMisses)}`).toEqual([])

    // 3. Ingen data tappad i omflyttningen till InvoicePaymentSection.
    for (const needle of criticalStrings) {
      expect(newText, `kritiskt betalfält saknas i ny render: "${needle}"`).toContain(needle)
    }
  })
}

test('renderModernInvoiceHtml producerar giltig fristående HTML (doctype + stängd body/html)', () => {
  const html = renderModernInvoiceHtml(fixtureFull())
  expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
  expect(html.trim().endsWith('</html>')).toBe(true)
  expect(html).toContain('<div class="quote-document')
})
