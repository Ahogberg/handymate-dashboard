/**
 * Paritetstest — ETAPP 2a (offert-masterplan.md), punkt 3.
 *
 * Verifierade (en gång, vid cutover) att den NYA dokumentmotorn (QuoteDocument
 * → renderModernHtml, lib/quote-templates/render-react.tsx) producerar
 * SEMANTISKT samma kundfacing HTML som den GAMLA mallsträngen
 * (lib/quote-templates/modern.ts, nu RADERAD — pariteten var grön, se commit-
 * historik) för samma QuoteTemplateData — INTE bytesidentisk HTML (attribut-
 * ordning, whitespace och React-specifika markörer skiljer sig oundvikligen
 * mellan en handskriven template-sträng och renderToStaticMarkup), utan:
 *
 *   1. Samma synliga TEXTINNEHÅLL i samma ORDNING (tagg-strippat, whitespace
 *      normaliserat).
 *   2. Samma NYCKELKLASSER förekommer (page, quote-title, row-heading osv).
 *   3. Samma antal <tr>-rader.
 *
 * modern.ts pensionerades EFTER att detta test var grönt (offert-
 * masterplan.md ETAPP 2a, punkt 3: "Först när testet är grönt: radera
 * modern.ts"). Utan filen kvar att importera skulle testet annars sluta
 * kompilera — HTML:en den producerade vid cutovern är därför FRUSEN som
 * fixture-filer (tests/fixtures/quote-document-parity/*.html, genererade av
 * renderModern() innan radering) så testet fortsätter fungera som en
 * permanent regressionsvakt mot dokumentmotorn: om QuoteDocument någon gång
 * av misstag ändrar det etablerade kundfacing-innehållet upptäcks det här.
 *
 * Körs: npx playwright test tests/quote-document-parity.spec.ts --no-deps
 *
 * KÄND, DOKUMENTERAD AVVIKELSE (medvetet, se QuoteDocument.tsx): grön
 * teknik-avdraget saknades helt i modern.ts:s produktion (bara ModernCanvas
 * visade det) — den nya motorn speglar TROGET modern.ts:s gamla beteende
 * (ingen grön-rad i static-läge). Fixturerna nedan sätter därför INTE
 * gronDeduction. Se rapporten för rekommenderad fast-follow.
 *
 * Logo-fallback: modern.ts hade en onerror="…"-JS-sträng inbäddad i <img>
 * för att falla tillbaka till bokstavsikonen om loggan inte laddar. React
 * renderToStaticMarkup kan inte serialisera event-handlers som HTML-
 * attribut (grundläggande SSR-begränsning, inte ett misstag) — denna
 * resiliens tappas i den nya statiska renderaren. Fixturerna testar därför
 * UTAN logoUrl (accepterad, dokumenterad regression — se rapporten).
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { renderModernHtml } from '../lib/quote-templates/render-react'
import type { QuoteTemplateData, QuoteTemplateItem } from '../lib/quote-templates/types'

const FIXTURE_DIR = path.join(__dirname, 'fixtures/quote-document-parity')
function loadFrozenBaseline(name: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, `${name}.html`), 'utf8')
}

function baseItems(): QuoteTemplateItem[] {
  return [
    { itemType: 'heading', name: 'Badrum — etapp 1', quantity: 0, unit: '', unitPrice: 0, total: 0 },
    {
      itemType: 'item', id: 'i1', name: 'Rivning', description: null, quantity: 8, unit: 'tim',
      unitPrice: 650, total: 5200, isRotEligible: true, rotRutType: 'rot',
      components: [{ description: 'Bilning golv', quantityPerUnit: 1, unit: 'tim' }],
    },
    { itemType: 'text', name: 'Arbetet utförs enligt bifogad ritning.', quantity: 0, unit: '', unitPrice: 0, total: 0 },
    { itemType: 'item', id: 'i2', name: 'Kakel 30x60', quantity: 12, unit: 'm2', unitPrice: 450, total: 5400 },
    { itemType: 'subtotal', name: 'Delsumma badrum', quantity: 0, unit: '', unitPrice: 0, total: 10600 },
    {
      itemType: 'option', id: 'o1', optionSelected: true, name: 'Golvvärme', quantity: 1, unit: 'st',
      unitPrice: 8000, total: 8000, isRotEligible: true, rotRutType: 'rot',
    },
    {
      itemType: 'option', id: 'o2', optionSelected: false, name: 'Handdukstork', quantity: 1, unit: 'st',
      unitPrice: 2200, total: 2200,
    },
    { itemType: 'discount', id: 'd1', name: 'Kampanjrabatt', quantity: 1, unit: 'st', unitPrice: 500, total: -500 },
  ]
}

function fixtureFull(): QuoteTemplateData {
  return {
    isSigned: false,
    signatureCta: 'hidden', // modern.ts har ingen signatur-CTA alls — måste matcha exakt
    referencePerson: 'Anna Andersson',
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
    quote: {
      number: 'OF-2026-0042', dealNumber: '#1003', issuedDate: '3 augusti 2026', validUntilDate: '2 september 2026',
      title: 'Badrumsrenovering', description: 'Totalrenovering av badrum inkl. rivning och kakling.',
      items: baseItems(),
      subtotalExVat: 20800, vatAmount: 5200, totalIncVat: 26000,
      rotDeduction: 1560, rutDeduction: 200, amountToPay: 24240,
      paymentTerms: '30 dagar netto', warrantyText: '10 års garanti på allt arbete.',
      notIncluded: 'Målning ingår ej.', termsText: 'Offerten är bindande i 30 dagar från utfärdandedatum.',
    },
    displayLevel: 'full', showQuantities: true, showUnitPrices: true,
  }
}

function fixtureRows(): QuoteTemplateData {
  const f = fixtureFull()
  return {
    ...f,
    referencePerson: null,
    business: { ...f.business, swish: null },
    quote: {
      ...f.quote, dealNumber: null, rotDeduction: undefined, rutDeduction: undefined,
      termsText: null, notIncluded: null, warrantyText: null,
    },
    displayLevel: 'rows', showQuantities: false, showUnitPrices: false,
  }
}

function fixtureSigned(): QuoteTemplateData {
  const f = fixtureFull()
  return { ...f, isSigned: true }
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
  'row-heading', 'row-text', 'row-subtotal', 'row-discount', 'row-option',
  'opt-badge', 'item-name', 'item-desc', 'item-components', 'options-note',
  'total-row', 'total-row grand', 'pay-box', 'swish-mark', 'class="terms"', 'class="footer"',
]

/** Tar bort <style>-block innan klass-substrängs-koll — annars matchar
    CSS-SELEKTORER (".item-name {...}", alltid närvarande i båda) och testet
    blir tandlöst. Efter strippningen kan substrängen bara förekomma i en
    faktisk class="…"-attributsträng i markupen. */
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

for (const [label, fixtureName, fixture] of [
  ['full (alla radtyper, ROT+RUT, swish, referens, ärende)', 'full', fixtureFull] as const,
  ['rows (kolumner dolda, ingen swish, default-villkorstext)', 'rows', fixtureRows] as const,
  ['signerad (options-note ska vara borta i båda)', 'signed', fixtureSigned] as const,
]) {
  test(`renderModernHtml vs frusen modern.ts-baseline — ${label}`, () => {
    const data = fixture()
    const oldHtml = loadFrozenBaseline(fixtureName)
    const newHtml = renderModernHtml(data)

    const oldText = extractText(oldHtml)
    const newText = extractText(newHtml)
    expect(newText).toBe(oldText)

    expect(trCount(newHtml)).toBe(trCount(oldHtml))
    assertKeyClassesMatch(oldHtml, newHtml)
  })
}

test('renderModernHtml producerar giltig fristående HTML (doctype + stängd body/html)', () => {
  const html = renderModernHtml(fixtureFull())
  expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
  expect(html.trim().endsWith('</html>')).toBe(true)
  expect(html).toContain('<div class="quote-document')
})
