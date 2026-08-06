/**
 * Facit-tester för sektionsgranskningens handler-delmängder (etapp C3, 2026-08-06).
 *
 * ═══ VARFÖR NYCKLARNA TESTAS EXAKT ═══
 *
 * Dokumentmotorn gatar varje redigerbart fält på att motsvarande handler finns.
 * Det betyder att den här kartan ÄR redigeringsbehörigheten — inte en
 * beskrivning av den.
 *
 * Läcker en nyckel IN i fel sektion blir ett fält redigerbart mitt i en dimmad
 * yta: hantverkaren kan ändra något han inte tittar på, utan att märka det.
 * Läcker en nyckel UT ur sin sektion blir just den yta han granskar
 * oredigerbar, och hela granskningssteget meningslöst.
 *
 * Därför jämförs nycklarna med toEqual mot en explicit lista, inte med
 * "innehåller". Ett test som bara kollar närvaro hade släppt igenom läckage.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/section-handlers.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  sectionHandlers,
  sectionSummary,
  nextSection,
  SECTION_ORDER,
  SECTION_LABELS,
  SECTION_HINTS,
  type QuoteSection,
} from '../lib/quotes/section-handlers'
import type { QuoteDocumentHandlers } from '../components/quotes/document/types'

const noop = () => {}

/** Ett fullständigt handlers-objekt — allt satt, som new/edit-sidorna gör. */
const FULL: QuoteDocumentHandlers = {
  onTitleChange: noop,
  onDescriptionChange: noop,
  onPaymentTermsChange: noop,
  onTermsChange: noop,
  onValidUntilChange: noop,
  onDiscountChange: noop,
  onNotIncludedChange: noop,
  onItemChange: noop,
  onItemAdd: noop,
  onItemRemove: noop,
  onItemMove: noop,
  onReservationRemove: noop,
  onItemRotRutCycle: noop,
  onOptionDefaultToggle: noop,
}

const keysOf = (section: QuoteSection) => Object.keys(sectionHandlers(section, FULL)).sort()

test.describe('exakta nycklar per sektion — inget läckage åt något håll', () => {
  test('Inkluderat äger raderna, titeln och beskrivningen', () => {
    expect(keysOf('inkluderat')).toEqual([
      'onDescriptionChange',
      'onItemAdd',
      'onItemChange',
      'onItemMove',
      'onItemRemove',
      'onItemRotRutCycle',
      'onOptionDefaultToggle',
      'onTitleChange',
    ])
  })

  test('Exkluderat äger bara villkorstexterna', () => {
    expect(keysOf('exkluderat')).toEqual(['onNotIncludedChange', 'onTermsChange'])
  })

  test('Reservationer äger bara borttagningen', () => {
    expect(keysOf('reservationer')).toEqual(['onReservationRemove'])
  })

  test('Prisbild äger rabatt, betalvillkor och giltighet', () => {
    expect(keysOf('prisbild')).toEqual([
      'onDiscountChange',
      'onPaymentTermsChange',
      'onValidUntilChange',
    ])
  })

  test('ingen handler hör till två sektioner', () => {
    // En handler i två sektioner betyder att samma fält går att redigera från
    // två olika granskningssteg — då är sektionsindelningen inte längre sann.
    const seen = new Set<string>()
    for (const section of SECTION_ORDER) {
      for (const key of keysOf(section)) {
        expect(seen.has(key), `${key} finns i mer än en sektion`).toBe(false)
        seen.add(key)
      }
    }
  })

  test('varje sektion kan faktiskt redigera något', () => {
    for (const section of SECTION_ORDER) {
      expect(keysOf(section).length, `${section} har inga handlers`).toBeGreaterThan(0)
    }
  })
})

test.describe('helhetsvyn', () => {
  test('null ger tillbaka HELA objektet', () => {
    expect(Object.keys(sectionHandlers(null, FULL)).sort()).toEqual(Object.keys(FULL).sort())
  })

  test('null ger samma REFERENS — annars renderar dokumentet om i onödan', () => {
    expect(sectionHandlers(null, FULL)).toBe(FULL)
  })
})

test.describe('saknade handlers hos anroparen', () => {
  test('en handler som inte finns hoppas över i stället för att sättas undefined', () => {
    // `{ onItemAdd: undefined }` och `{}` beter sig likadant i dokumentmotorn,
    // men bara det senare gör det uppenbart vid felsökning att handlern
    // aldrig fanns.
    const partial: QuoteDocumentHandlers = { onItemChange: noop }
    const result = sectionHandlers('inkluderat', partial)
    expect(Object.keys(result)).toEqual(['onItemChange'])
    expect('onItemAdd' in result).toBe(false)
  })

  test('ett tomt anroparobjekt ger ett tomt resultat, aldrig en krasch', () => {
    expect(sectionHandlers('prisbild', {})).toEqual({})
  })
})

test.describe('granskningsordningen', () => {
  test('Andreas taxonomi i rätt följd', () => {
    expect(SECTION_ORDER).toEqual(['inkluderat', 'exkluderat', 'reservationer', 'prisbild'])
  })

  test('varje sektion har en svensk etikett och en förklaring', () => {
    for (const section of SECTION_ORDER) {
      expect(SECTION_LABELS[section]?.length).toBeGreaterThan(0)
      expect(SECTION_HINTS[section]?.length).toBeGreaterThan(0)
    }
  })

  test('sista sektionen leder till helheten, inte runt i en cirkel', () => {
    expect(nextSection('inkluderat')).toBe('exkluderat')
    expect(nextSection('reservationer')).toBe('prisbild')
    expect(nextSection('prisbild')).toBeNull()
  })
})

const baseSummary = {
  itemCount: 8,
  itemsWithoutPrice: 0,
  notIncludedFilled: true,
  reservationCount: 2,
  reservationSuggestions: 0,
  amountToPay: 46500,
  deductionMissingPersonnummer: false,
  paymentPlanValid: true,
  hasPaymentPlan: false,
}

test.describe('sammanfattningen i granskningsbaren', () => {
  test('Inkluderat visar antal rader och summa', () => {
    const s = sectionSummary('inkluderat', baseSummary)
    expect(s.text).toContain('8 rader')
    expect(s.text.replace(/\D/g, '')).toContain('46500')
    expect(s.attention).toBeNull()
  })

  test('en enda rad böjs korrekt på svenska', () => {
    expect(sectionSummary('inkluderat', { ...baseSummary, itemCount: 1 }).text).toContain('1 rad ')
  })

  test('rader utan pris kräver åtgärd — de blir 0 kr i offerten', () => {
    const s = sectionSummary('inkluderat', { ...baseSummary, itemsWithoutPrice: 2 })
    expect(s.attention).toBe('2 rader utan pris')
  })

  test('en offert utan rader är alltid ett hinder', () => {
    expect(sectionSummary('inkluderat', { ...baseSummary, itemCount: 0 }).attention).not.toBeNull()
  })
})

test.describe('SPARSAMHET — tomt är inte fel', () => {
  test('tomt "ej inkluderat" kräver INGEN åtgärd', () => {
    // En offert kan mycket väl sakna avgränsningar. Att färga det amber hade
    // lärt hantverkaren att ignorera färgen.
    expect(sectionSummary('exkluderat', { ...baseSummary, notIncludedFilled: false }).attention).toBeNull()
  })

  test('inga reservationer kräver INGEN åtgärd', () => {
    expect(sectionSummary('reservationer', { ...baseSummary, reservationCount: 0 }).attention).toBeNull()
  })

  test('men OSEDDA förslag gör det — de är ett obesvarat beslut', () => {
    const s = sectionSummary('reservationer', { ...baseSummary, reservationCount: 0, reservationSuggestions: 3 })
    expect(s.attention).toBe('3 förslag att ta ställning till')
  })

  test('en helt normal offert ger noll varningar i alla fyra sektionerna', () => {
    for (const section of SECTION_ORDER) {
      expect(sectionSummary(section, baseSummary).attention, section).toBeNull()
    }
  })
})

test.describe('Prisbild — bara verkliga hinder', () => {
  test('saknat personnummer stoppar avdraget och måste synas', () => {
    const s = sectionSummary('prisbild', { ...baseSummary, deductionMissingPersonnummer: true })
    expect(s.attention).toContain('Personnummer')
  })

  test('en betalplan som inte går ihop måste synas', () => {
    const s = sectionSummary('prisbild', { ...baseSummary, hasPaymentPlan: true, paymentPlanValid: false })
    expect(s.attention).toContain('går inte ihop')
  })

  test('ogiltig betalplan spelar ingen roll när ingen plan finns', () => {
    const s = sectionSummary('prisbild', { ...baseSummary, hasPaymentPlan: false, paymentPlanValid: false })
    expect(s.attention).toBeNull()
  })

  test('personnummerhindret väger tyngre än betalplanen när båda finns', () => {
    // Bara ett meddelande får plats i baren. Avdraget är pengar för kunden;
    // en betalplan som inte summerar är en formalia hantverkaren rättar snabbt.
    const s = sectionSummary('prisbild', {
      ...baseSummary,
      deductionMissingPersonnummer: true,
      hasPaymentPlan: true,
      paymentPlanValid: false,
    })
    expect(s.attention).toContain('Personnummer')
  })
})
