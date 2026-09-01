/**
 * Fas E (offertskaparen-design-polish, 2026-09-01) — tomt-läge för en
 * offert utan rader, plus en oberoende copy-fix som bundlades i samma
 * etapp.
 *
 * ═══ Del 1: Desktopens tomt-läge (QuoteDocument.tsx) ═══
 *
 * Tidigare renderades en tabell med bara en huvudrad och en tom <tbody>
 * när items.length === 0 — en frånvaro av en affordans, inte en. Nu
 * ersätts tabellen (bara i mode==='edit' && !sheetMode) av en streckad
 * ruta: "+ Lägg till rad"-knappen (samma handler som förut) + villkorligt
 * en "eller beskriv jobbet"-länk.
 *
 * OBS för assertionerna: MODERN_DOCUMENT_CSS (inbäddad i <style> i VARJE
 * rendering, oavsett mode/items) innehåller själva selektorerna
 * ".empty-items"/".empty-items-hint"/".empty-items-link" — ett löst
 * `toContain('empty-items')` hade alltså ALLTID slagit till, även när
 * rutan aldrig monteras. Provet matchar därför mot den FAKTISKA
 * öppningstaggen (`<div class="empty-items">`), inte den lösa
 * delsträngen.
 *
 * Länken (`onOpenAiHelp`) är en GENUIN produktasymmetri, inte en bugg:
 * AI-beskrivningsflödet finns bara i create-flödet (QuoteBuilder.tsx).
 * QuoteEditView.tsx skickar aldrig denna prop — provet nedan bevisar att
 * frånvaron av propen ger frånvaron av länken, inte en trasig länk.
 *
 * items.length > 0 tar en OFÖRÄNDRAD väg (samma <table>/<tbody> som innan
 * denna etapp) — ett regressionsprov täcker det uttryckligen.
 *
 * ═══ Del 2: "Att betala" (QuoteTotalsSection.tsx) ═══
 *
 * Etiketten hette tidigare "Kund betalar" — bytt till "Att betala" för att
 * matcha QuoteDocument.tsx:s egen statiska totalsumma (samma sträng syns
 * på två ställen nu, inte olika ord för samma sak). Källskannar filen
 * (samma facit-stil som tests/quotes-mer-i-flodet.spec.ts) i stället för
 * att montera komponenten: QuoteTotalsSection.tsx saknar (avsiktligt,
 * ingen anledning att lägga till den bara för ett textprov) pragmat
 * `/** @jsxImportSource react *\/` som QuoteDocument.tsx/
 * ReservationSuggestionBox.tsx bär av samma skäl som deras egna docblock
 * anger — utan det tar Playwrights egen komponenttest-JSX-runtime över
 * filens JSX i stället för Reacts, och renderToStaticMarkup kastar.
 *
 *   npx playwright test tests/quote-document-empty-state.spec.ts --no-deps
 */
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'
import { renderToStaticMarkup as renderToStaticMarkupUntyped } from 'react-dom/server.browser'
import { createElement, type ReactElement } from 'react'
import QuoteDocument from '../components/quotes/document/QuoteDocument'
import type { QuoteTemplateData, QuoteTemplateItem } from '../lib/quote-templates/types'
import type { InvoiceTemplateData } from '../lib/invoice-templates/types'

const renderToStaticMarkup = renderToStaticMarkupUntyped as unknown as (element: ReactElement) => string

function baseItems(): QuoteTemplateItem[] {
  return [
    { itemType: 'item', id: 'i1', name: 'Rivning golv', quantity: 8, unit: 'tim', unitPrice: 650, total: 5200 },
  ]
}

function fixture(items: QuoteTemplateItem[]): QuoteTemplateData {
  return {
    business: {
      name: 'Bygg & Co AB', orgNumber: '556677-8899', address: 'Verkstadsgatan 4, 123 45 Storstad',
      contactName: 'Anna Andersson', phone: '070-1234567', email: 'anna@byggco.se',
      fSkatt: true, accentColor: '#0F766E',
    },
    customer: { name: 'Kalle Kund' },
    quote: {
      number: 'OF-2026-0042', issuedDate: '3 augusti 2026', validUntilDate: '2 september 2026',
      title: 'Badrumsrenovering', items,
      subtotalExVat: 5200, vatAmount: 1300, totalIncVat: 6500, amountToPay: 6500,
      paymentTerms: '30 dagar netto',
    },
    displayLevel: 'full', showQuantities: true, showUnitPrices: true,
  }
}

function renderDoc(
  items: QuoteTemplateItem[],
  mode: 'static' | 'edit',
  opts: { sheetMode?: boolean; onOpenAiHelp?: () => void } = {},
) {
  return renderToStaticMarkup(
    createElement(QuoteDocument, {
      data: { ...fixture(items), docType: 'quote' as const },
      mode,
      sheetMode: opts.sheetMode,
      onAddRow: () => {},
      onOpenAiHelp: opts.onOpenAiHelp,
    })
  )
}

const EMPTY_BOX_OPEN_TAG = '<div class="empty-items">'

test.describe('Tomt-läge i edit-läge, oskalad canvas (Fas E)', () => {
  test('items.length === 0 → streckad ruta med "+ Lägg till rad", ingen tabell', () => {
    const html = renderDoc([], 'edit')
    expect(html).toContain(EMPTY_BOX_OPEN_TAG)
    expect(html).toContain('class="add-row-btn"')
    expect(html).toContain('+ Lägg till rad')
    expect(html).not.toContain('<table>')
  })

  test('utan onOpenAiHelp (redigeringsvyns läge) → ingen "beskriv jobbet"-länk, bara knappen', () => {
    const html = renderDoc([], 'edit')
    expect(html).toContain(EMPTY_BOX_OPEN_TAG)
    expect(html).not.toContain('class="empty-items-link"')
    expect(html).not.toContain('class="empty-items-hint"')
    expect(html).not.toContain('beskriv jobbet')
  })

  test('med onOpenAiHelp (create-flödets läge) → "eller beskriv jobbet så bygger vi utkastet"-länken finns', () => {
    const html = renderDoc([], 'edit', { onOpenAiHelp: () => {} })
    expect(html).toContain('class="empty-items-hint"')
    expect(html).toContain('class="empty-items-link"')
    expect(html).toContain('beskriv jobbet')
    expect(html).toContain('så bygger vi utkastet')
  })

  test('items.length > 0 → tabellen renderas OFÖRÄNDRAT, ingen tomruta', () => {
    const html = renderDoc(baseItems(), 'edit', { onOpenAiHelp: () => {} })
    expect(html).toContain('<table>')
    expect(html).toContain('Rivning golv')
    expect(html).not.toContain(EMPTY_BOX_OPEN_TAG)
    // Den fristående "+ Lägg till rad"-knappen (utanför tomrutan) ska
    // fortfarande finnas exakt en gång — ingen dubblett.
    const matches = html.match(/class="add-row-btn"/g) || []
    expect(matches.length).toBe(1)
  })

  test('static-läge med noll rader → OFÖRÄNDRAT (ingen tomruta, kunden ser aldrig en intern uppmaning)', () => {
    const html = renderDoc([], 'static')
    expect(html).not.toContain(EMPTY_BOX_OPEN_TAG)
    expect(html).not.toContain('class="add-row-btn"')
    expect(html).toContain('<table>')
  })

  test('sheetMode (mobil, skalad canvas) med noll rader → OFÖRÄNDRAT här, mobilens egen tomruta renderas OSKALAD av QuoteDocumentSurface.tsx i stället', () => {
    const html = renderDoc([], 'edit', { sheetMode: true, onOpenAiHelp: () => {} })
    expect(html).not.toContain(EMPTY_BOX_OPEN_TAG)
    expect(html).toContain('<table>')
  })
})

function invoiceFixture(items: QuoteTemplateItem[]): InvoiceTemplateData {
  return {
    business: {
      name: 'Bygg & Co AB', orgNumber: '556677-8899', address: 'Verkstadsgatan 4, 123 45 Storstad',
      contactName: 'Anna Andersson', phone: '070-1234567', email: 'anna@byggco.se',
      fSkatt: true, accentColor: '#0F766E',
    },
    customer: { name: 'Kalle Kund' },
    invoice: {
      number: 'FV-2026-0042', invoiceDate: '3 augusti 2026', dueDate: '2 september 2026', paidDate: null,
      status: 'unpaid', daysOverdue: 0, ocrNumber: '420260002',
      title: 'Badrumsrenovering', items,
      subtotalExVat: 0, vatAmount: 0, vatRate: 25, totalIncVat: 0, amountToPay: 0,
      paymentTerms: '30 dagar netto',
      isCreditNote: false,
    },
  } as InvoiceTemplateData
}

/**
 * Slutgranskningsfynd (offertskaparen-design-polish): Fas E:s tomt-läge
 * (ovan) saknade `!isInvoice` — till skillnad från reservationsförslags-
 * rutan (Fas D) och "Sätt pris"-pillen (Fas C), som båda redan gatar på
 * isInvoice. QuoteDocument i mode="edit" är INTE bara offertskaparens egen
 * yta: app/dashboard/invoices/_shared/InvoiceEditor.tsx monterar samma
 * komponent, oförändrad av den här branchen, för sin egen (redan
 * existerande) fakturaredigering. Utan guarden hade en faktura med noll
 * rader tyst börjat visa offertens "+ Lägg till rad"/"beskriv jobbet"-ruta
 * i stället för sin egen tomrads-hantering — en yta helt utanför uppdraget
 * (branchen är uttryckligen bara offertskaparen, se PR-beskrivningen).
 */
test.describe('Fakturans egen editor är OPÅVERKAD av Fas E:s tomt-läge (!isInvoice-guard)', () => {
  test('docType "invoice", noll rader, mode "edit" → OFÖRÄNDRAT: tabellen renderas, ingen offert-tomruta', () => {
    const html = renderToStaticMarkup(
      createElement(QuoteDocument, {
        data: { ...invoiceFixture([]), docType: 'invoice' as const },
        mode: 'edit',
        onAddRow: () => {},
      })
    )
    expect(html).not.toContain(EMPTY_BOX_OPEN_TAG)
    expect(html).not.toContain('class="empty-items-hint"')
    expect(html).not.toContain('beskriv jobbet')
    expect(html).toContain('<table>')
  })

  test('docType "invoice" med rader, mode "edit" → OFÖRÄNDRAT (regressionskontroll för samma gren)', () => {
    const html = renderToStaticMarkup(
      createElement(QuoteDocument, {
        data: {
          ...invoiceFixture([
            { itemType: 'item', id: 'i1', name: 'Rivning golv', quantity: 8, unit: 'tim', unitPrice: 650, total: 5200 },
          ]),
          docType: 'invoice' as const,
        },
        mode: 'edit',
        onAddRow: () => {},
      })
    )
    expect(html).not.toContain(EMPTY_BOX_OPEN_TAG)
    expect(html).toContain('<table>')
    expect(html).toContain('Rivning golv')
  })
})

test.describe('"Att betala" ersätter "Kund betalar" (QuoteTotalsSection.tsx)', () => {
  const SOURCE = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'dashboard', 'quotes', '_shared', 'QuoteTotalsSection.tsx'),
    'utf8',
  )

  test('highlight-boxens etikett är "Att betala"', () => {
    expect(SOURCE).toContain('>Att betala<')
  })

  test('"Kund betalar" renderas inte längre som JSX-text (historikkommentaren om det gamla namnet får finnas kvar)', () => {
    // Matchar mot faktiskt JSX-textinnehåll (`>Kund betalar<`), inte fri
    // text — samma princip som tests/quotes-mer-i-flodet.spec.ts:s
    // "NÄMNER i förbigående ≠ finns kvar i koden". Filens egen
    // historikkommentar ovanför boxen nämner medvetet det gamla namnet.
    expect(SOURCE).not.toMatch(/>Kund betalar</)
  })
})
