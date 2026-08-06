/**
 * Facit-tester för etapp A4 (2026-08-06): ÄTA-villkor och betalplan i
 * kunddokumentet.
 *
 * ═══ VARFÖR DE HÄR TESTERNA FINNS ═══
 *
 * `quotes.ata_terms` och `quotes.payment_plan` har funnits i databasen och som
 * egna fält i offertredigeraren under lång tid. INGEN renderare läste dem.
 * Hantverkaren fyllde alltså i vad som gäller vid tilläggsarbete, och lade upp
 * en delbetalningsplan, och kunden såg aldrig något av det. Arbetet var
 * bortkastat och offerten juridiskt tunnare än hantverkaren trodde.
 *
 * Det är samma familj av fel som logotypsbuggen: data samlas in, lagras korrekt
 * och försvinner tyst på vägen ut. Ingenting kraschar, så ingen upptäcker det.
 * Enda försvaret är ett test som påstår att fältet FAKTISKT syns för kunden —
 * i varje väg som når kunden, inte bara i den vi råkade titta på.
 *
 * Därför körs samma fixtur genom ALLA TRE mallarna. Modern (QuoteDocument),
 * Premium och Friendly väljs av `quote.template_style` och en Premium-kund
 * skulle annars kunna tappa fälten utan att någon märkte det.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/quote-ata-payment-plan.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { selectTemplate, buildQuoteTemplateData } from '../lib/quote-templates'
import type { QuoteTemplateData } from '../lib/quote-templates/types'

const STYLES = ['modern', 'premium', 'friendly'] as const

const ATA_TEXT = 'Tillägg utöver offert debiteras 650 kr per timme efter skriftligt godkännande.'

function fixture(overrides: Partial<QuoteTemplateData['quote']> = {}): QuoteTemplateData {
  return {
    isSigned: false,
    signatureCta: 'hidden',
    referencePerson: 'Anna Andersson',
    business: {
      name: 'Bygg & Co AB', orgNumber: '556677-8899', address: 'Verkstadsgatan 4, 123 45 Storstad',
      contactName: 'Anna Andersson', phone: '070-1234567', email: 'anna@byggco.se', website: null,
      bankgiro: '123-4567', plusgiro: null, swish: '1234567', fSkatt: true, momsRegnr: 'SE556677889901',
      accentColor: '#0F766E', logoUrl: null, tagline: 'Din lokala hantverkare',
    },
    customer: {
      name: 'Kalle Kund', address: 'Kundvägen 1', postalCode: '123 45', city: 'Storstad',
      phone: '070-9876543', email: 'kalle@kund.se', personnummer: null, reference: null,
    },
    quote: {
      number: 'OF-2026-0042', dealNumber: null,
      issuedDate: '3 augusti 2026', validUntilDate: '2 september 2026',
      title: 'Badrumsrenovering', description: null,
      items: [
        { itemType: 'item', id: 'i1', name: 'Rivning badrum', quantity: 1, unit: 'st', unitPrice: 20800, total: 20800 },
      ],
      subtotalExVat: 20800, vatAmount: 5200, totalIncVat: 26000, amountToPay: 26000,
      paymentTerms: '30 dagar netto',
      ataTerms: ATA_TEXT,
      paymentPlan: [
        { label: 'Vid beställning', percent: 30, amount: 7800, dueDescription: 'Faktureras direkt' },
        { label: 'Vid slutbesiktning', percent: 70, amount: 18200, dueDescription: null },
      ],
      ...overrides,
    },
    displayLevel: 'full', showQuantities: true, showUnitPrices: true,
  }
}

/** Strippar taggar och CSS så vi mäter vad KUNDEN läser, inte markupen. */
function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

for (const style of STYLES) {
  test.describe(`${style} — ÄTA-villkor`, () => {
    test('texten når kunden', () => {
      const text = visibleText(selectTemplate(style)(fixture()))
      expect(text).toContain(ATA_TEXT)
    })

    test('rubriken är utskriven, inte branschförkortningen ÄTA', () => {
      // Kunden är en privatperson som renoverar badrum. "ÄTA" är jargong hen
      // inte nödvändigtvis kan, och ett villkor som inte förstås är inget
      // villkor. CLAUDE.md: inga tekniska termer synliga för slutanvändaren.
      const text = visibleText(selectTemplate(style)(fixture()))
      expect(text).toContain('Ändringar och tilläggsarbeten')
    })

    test('inget block alls när fältet är tomt', () => {
      const text = visibleText(selectTemplate(style)(fixture({ ataTerms: null })))
      expect(text).not.toContain('Ändringar och tilläggsarbeten')
    })
  })

  test.describe(`${style} — betalplan`, () => {
    test('varje del når kunden med sin etikett', () => {
      const text = visibleText(selectTemplate(style)(fixture()))
      expect(text).toContain('Betalplan')
      expect(text).toContain('Vid beställning')
      expect(text).toContain('Vid slutbesiktning')
    })

    test('beloppen når kunden — en betalplan utan kronor är meningslös', () => {
      const text = visibleText(selectTemplate(style)(fixture()))
      // Svensk tusenavgränsare är ett icke-brytande mellanslag; jämför på
      // siffrorna så testet inte går sönder på formateringsdetaljer.
      const digitsOnly = text.replace(/\D/g, '')
      expect(digitsOnly).toContain('7800')
      expect(digitsOnly).toContain('18200')
    })

    test('valfri förfallobeskrivning visas när den finns', () => {
      const text = visibleText(selectTemplate(style)(fixture()))
      expect(text).toContain('Faktureras direkt')
    })

    test('inget block alls när planen är tom', () => {
      const text = visibleText(selectTemplate(style)(fixture({ paymentPlan: [] })))
      expect(text).not.toContain('Betalplan')
    })

    test('en plan i rena kronor visar aldrig noll procent', () => {
      // percent: 0 är giltigt — hantverkaren kan dela upp i fasta belopp.
      // Att då skriva ut "0 %" ser ut som ett räknefel i kundens ögon.
      const text = visibleText(selectTemplate(style)(fixture({
        paymentPlan: [
          { label: 'Förskott', percent: 0, amount: 10000, dueDescription: null },
          { label: 'Slutbetalning', percent: 0, amount: 16000, dueDescription: null },
        ],
      })))
      expect(text).toContain('Förskott')
      expect(text).not.toContain('0 %')
    })
  })
}

test.describe('data-buildern — vägen från databasen till dokumentet', () => {
  test('ata_terms och payment_plan mappas från de råa databasfälten', () => {
    const data = buildQuoteTemplateData(
      {
        quote_number: 'OF-1', title: 'Jobb', items: [], quote_items: [],
        ata_terms: ATA_TEXT,
        payment_plan: [{ label: 'Förskott', percent: 50, amount: 5000, due_description: 'Vid start' }],
      } as any,
      null as any,
      null as any,
    )
    expect(data.quote.ataTerms).toBe(ATA_TEXT)
    expect(data.quote.paymentPlan).toEqual([
      { label: 'Förskott', percent: 50, amount: 5000, dueDescription: 'Vid start' },
    ])
  })

  test('en trasig rad i payment_plan fäller inte hela offerten', () => {
    // Samma defensiva hållning som reservationssnapshoten: hellre en rad
    // mindre i betalplanen än ett dokument som inte går att rendera.
    const data = buildQuoteTemplateData(
      {
        quote_number: 'OF-1', title: 'Jobb', items: [], quote_items: [],
        payment_plan: [
          { label: 'Bra rad', percent: 50, amount: 5000 },
          { percent: 50, amount: 5000 },
          { label: 'Saknar belopp', percent: 50 },
          null,
        ],
      } as any,
      null as any,
      null as any,
    )
    expect(data.quote.paymentPlan).toHaveLength(1)
    expect(data.quote.paymentPlan![0].label).toBe('Bra rad')
  })

  test('saknade fält blir null, aldrig strängen undefined i dokumentet', () => {
    const data = buildQuoteTemplateData(
      { quote_number: 'OF-1', title: 'Jobb', items: [], quote_items: [] } as any,
      null as any,
      null as any,
    )
    expect(data.quote.ataTerms).toBeNull()
    expect(data.quote.paymentPlan).toBeNull()
  })
})
