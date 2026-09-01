/**
 * Facit-tester för offertens fullständighets-sammanfattning (spår A,
 * 2026-08-06).
 *
 * ═══ HISTORIK (Fas 1, offert-omtaget 2026-08-31) ═══
 *
 * Den här filen hette tidigare `tests/section-handlers.spec.ts` och
 * testade i huvudsak en GATING-mekanism (`sectionHandlers`/`SECTION_KEYS`/
 * `nextSection`) som filtrerade dokumentets handlers till en sektion i
 * taget för en tvingad steg-för-steg-granskning. Den granskningen är
 * borttagen — grundaren konstaterade att den inte fungerade i praktiken.
 * Alla tester av gatingen (exakta handler-nycklar per sektion, helhetsvyns
 * null-genväg, saknade-handlers-fallet, "nästa sektion") är därför
 * BORTTAGNA, inte bara flyttade: den kod de skyddade finns inte kvar.
 *
 * `sectionReviewState`/`unreviewedCount` (kvittots tre-tillstånds-ikon och
 * "hoppat över"-räknare) är av samma skäl borttagna — deras enda konsument
 * var `QuickReceipt.tsx`, som togs bort i samma pass.
 *
 * Kvar: `sectionSummary()` + ordnings-/etikettkonstanterna, som nu
 * konsumeras av en alltid synlig, icke-blockerande chip-rad (se
 * `app/dashboard/quotes/_shared/QuoteCompletenessStrip.tsx`) i stället för
 * av en grind. Dessa tester är OFÖRÄNDRADE i sak — `sectionSummary` gjorde
 * aldrig någon gating, bara sammanfattning.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/quote-completeness.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  sectionSummary,
  sortSectionsByAttention,
  SECTION_ORDER,
  SECTION_LABELS,
  SECTION_HINTS,
  type QuoteSection,
  type SectionSummary,
} from '../lib/quotes/quote-completeness'

test.describe('ämnesordningen', () => {
  test('Andreas taxonomi i rätt följd', () => {
    expect(SECTION_ORDER).toEqual(['inkluderat', 'exkluderat', 'reservationer', 'prisbild'])
  })

  test('varje ämne har en svensk etikett och en förklaring', () => {
    for (const section of SECTION_ORDER) {
      expect(SECTION_LABELS[section]?.length).toBeGreaterThan(0)
      expect(SECTION_HINTS[section]?.length).toBeGreaterThan(0)
    }
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

test.describe('sammanfattningen i chip-raden', () => {
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

  test('en helt normal offert ger noll varningar i alla fyra ämnena', () => {
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
    // Bara ett meddelande får plats i chippen. Avdraget är pengar för kunden;
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

/**
 * Fas B (offertskaparen-design-polish, 2026-08-31): sortSectionsByAttention
 * ordnar mobilens bottenfältschips (QuoteBuilderBottomBar) — bara en
 * bråkdel av den horisontellt scrollbara raden syns innan man scrollar, så
 * det som behöver ögon (attention) ska stå längst till vänster. Ren
 * funktion: samma fyra sektioner in, en ordnad lista ut, ingen sidoeffekt.
 * Tillagd efter kod-granskning av Fas B — testet saknades i första rundan.
 */
const calm = (text: string): SectionSummary => ({ text, attention: null })
const attention = (text: string, reason: string): SectionSummary => ({ text, attention: reason })

test.describe('sortSectionsByAttention — bottenfältets chip-ordning', () => {
  test('allt lugnt (ingen attention) — SECTION_ORDER bevaras oförändrad', () => {
    const summaries: Record<QuoteSection, SectionSummary> = {
      inkluderat: calm('8 rader · 46 500 kr'),
      exkluderat: calm('Inget angivet'),
      reservationer: calm('2 förbehåll'),
      prisbild: calm('46 500 kr'),
    }
    expect(sortSectionsByAttention(summaries)).toEqual(SECTION_ORDER)
  })

  test('attention-sektioner hamnar FÖRST, lugna sektioner EFTER', () => {
    const summaries: Record<QuoteSection, SectionSummary> = {
      inkluderat: calm('8 rader · 46 500 kr'),
      exkluderat: calm('Inget angivet'),
      reservationer: attention('2 förbehåll', '1 förslag att ta ställning till'),
      prisbild: attention('46 500 kr', 'Personnummer saknas för avdraget'),
    }
    const result = sortSectionsByAttention(summaries)
    // De två med attention (reservationer, prisbild) före de två utan
    // (inkluderat, exkluderat) — oavsett var de låg i SECTION_ORDER.
    expect(result.indexOf('reservationer')).toBeLessThan(result.indexOf('inkluderat'))
    expect(result.indexOf('reservationer')).toBeLessThan(result.indexOf('exkluderat'))
    expect(result.indexOf('prisbild')).toBeLessThan(result.indexOf('inkluderat'))
    expect(result.indexOf('prisbild')).toBeLessThan(result.indexOf('exkluderat'))
  })

  test('SECTION_ORDER:s inbördes ordning bevaras INOM varje grupp', () => {
    // SECTION_ORDER = ['inkluderat', 'exkluderat', 'reservationer', 'prisbild'].
    // Ger 'inkluderat' och 'prisbild' attention (i den ordningen i
    // SECTION_ORDER) och 'exkluderat'+'reservationer' lugna — resultatet ska
    // vara ['inkluderat', 'prisbild', 'exkluderat', 'reservationer'], INTE
    // en godtycklig ordning inom respektive grupp.
    const summaries: Record<QuoteSection, SectionSummary> = {
      inkluderat: attention('3 rader · 12 000 kr', '1 rad utan pris'),
      exkluderat: calm('Inget angivet'),
      reservationer: calm('Inga förbehåll'),
      prisbild: attention('12 000 kr', 'Betalplanen går inte ihop'),
    }
    expect(sortSectionsByAttention(summaries)).toEqual(['inkluderat', 'prisbild', 'exkluderat', 'reservationer'])
  })

  test('allt har attention — SECTION_ORDER bevaras (en enda grupp)', () => {
    const summaries: Record<QuoteSection, SectionSummary> = {
      inkluderat: attention('0 rader', 'Offerten har inga rader'),
      exkluderat: attention('Inget angivet', 'Saknas'),
      reservationer: attention('0 förbehåll', 'Förslag väntar'),
      prisbild: attention('0 kr', 'Personnummer saknas'),
    }
    expect(sortSectionsByAttention(summaries)).toEqual(SECTION_ORDER)
  })

  test('exakt en sektion (mitt i SECTION_ORDER) med attention flyttas till fronten, resten oförändrad ordning', () => {
    const summaries: Record<QuoteSection, SectionSummary> = {
      inkluderat: calm('8 rader · 46 500 kr'),
      exkluderat: attention('Inget angivet', 'Glömt bort?'),
      reservationer: calm('2 förbehåll'),
      prisbild: calm('46 500 kr'),
    }
    expect(sortSectionsByAttention(summaries)).toEqual(['exkluderat', 'inkluderat', 'reservationer', 'prisbild'])
  })
})
