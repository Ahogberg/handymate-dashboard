/**
 * "MER"-raden som EN väg in, inte flera (jaunty-pondering-hummingbird.md
 * Del 1-4, 2026-08-17; premissen vänd i Fas 1, offert-omtaget 2026-08-31).
 *
 * ═══ HISTORIK ═══
 *
 * Fram till 2026-08-31 fanns TVÅ ytor för samma fält: den gamla
 * helhetsvyns "Mer"-flikar (Stil/Villkor/Betalplan/Visning/Bilagor/ROT) OCH
 * en parallell uppsättning i en tvingad steg-för-steg-granskning
 * (`QuoteNewMoreAboutProject` i granskningens header, `QuickReceipt` med
 * sin egen Stil/Visning/Bilagor-utfällning i kvittot). Del 1-4 (2026-08-17)
 * byggde ut granskningen så den täckte allt — men grundaren konstaterade
 * sedan att själva granskningen inte fungerade i praktiken och den togs
 * bort helt.
 *
 * Andreas ursprungliga fråga — "varför finns fälten på TVÅ ställen?" — får
 * nu ett enklare svar: det gör de inte. `QuickReceipt.tsx` och
 * `QuoteNewMoreAboutProject.tsx` är BORTA (raderade filer, inte bara
 * otestade), och "Mer"-raden i den enda kvarvarande editorn
 * (`QuoteBuilder.tsx`) är den ENDA vägen till Stil/Villkor & texter/
 * Betalplan/Visning/Bilagor/ROT-detaljer.
 *
 * Källskanning (husets facit-stil): låser att de borttagna filerna
 * faktiskt är borta och inte refererade, och att referens-/adressfälten
 * (som `QuoteNewMoreAboutProject` tidigare exponerade separat) fortfarande
 * binder till exakt samma state via "Mer → Villkor & texter"
 * (`QuoteStandardTextsSection`).
 *
 *   npx playwright test tests/quotes-mer-i-flodet.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const QUOTES_DIR = path.join(__dirname, '..', 'app', 'dashboard', 'quotes')
const BUILDER = fs.readFileSync(path.join(QUOTES_DIR, '_shared', 'QuoteBuilder.tsx'), 'utf8')
const DOCUMENT_TYPES = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'quotes', 'document', 'types.ts'),
  'utf8',
)
const QUOTE_DOCUMENT = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'quotes', 'document', 'QuoteDocument.tsx'),
  'utf8',
)
const NEW_CUSTOMER_SECTION = fs.readFileSync(
  path.join(QUOTES_DIR, 'new', 'components', 'QuoteNewCustomerSection.tsx'),
  'utf8',
)

test.describe('Del 1 (redan skeppad, 2026-08-17) — onAtaTermsChange, läsande koll', () => {
  test('typen och dokumentet har fortfarande nyckeln', () => {
    expect(DOCUMENT_TYPES, 'onAtaTermsChange saknas i QuoteDocumentHandlers').toContain('onAtaTermsChange')
    expect(QUOTE_DOCUMENT, 'onAtaTermsChange saknas i QuoteDocument.tsx').toContain('onAtaTermsChange')
  })

  // RIVNING PAKET C (2026-09-17, rad 2.16): lib/quotes/quote-completeness.ts
  // (dit gating-mekanismen flyttade och sedan trimmades till rena
  // sammanfattningsfunktioner) är själv raderad — inget kvar att källskanna
  // för SECTION_KEYS/sectionHandlers/nextSection.
})

test.describe('QuickReceipt och QuoteNewMoreAboutProject är raderade filer', () => {
  test('filerna finns inte längre på disk', () => {
    expect(fs.existsSync(path.join(QUOTES_DIR, 'new', 'components', 'quick', 'QuickReceipt.tsx'))).toBe(false)
    expect(fs.existsSync(path.join(QUOTES_DIR, 'new', 'components', 'quick', 'QuoteNewMoreAboutProject.tsx'))).toBe(false)
    expect(fs.existsSync(path.join(QUOTES_DIR, 'new', 'components', 'quick', 'QuickReviewBar.tsx'))).toBe(false)
    expect(fs.existsSync(path.join(QUOTES_DIR, 'new', 'components', 'quick', 'PaymentPlanSheet.tsx'))).toBe(false)
  })

  test('QuoteBuilder.tsx varken importerar eller monterar någon av dem', () => {
    // Matchar mot faktiska import-/JSX-mönster, inte fri text — QuoteBuilder.tsx
    // NÄMNER de borttagna filnamnen i sina egna "det här ersätter X"-
    // kommentarer, vilket är önskvärd historik, inte ett kvarvarande beroende.
    for (const name of ['QuickReceipt', 'QuoteNewMoreAboutProject', 'QuickReviewBar', 'PaymentPlanSheet']) {
      expect(BUILDER, `${name} importeras`).not.toMatch(new RegExp(`from '[^']*${name}'`))
      expect(BUILDER, `${name} monteras`).not.toMatch(new RegExp(`<${name}[\\s/>]`))
    }
  })
})

test.describe('"Mer"-raden är den ENDA vägen till de tre kvarvarande panelerna', () => {
  // Rivning paket B (2026-09-17, rad 2.3–2.6, 2.10): Stil/Villkor &
  // texter/ROT-detaljer är inte längre Mer-paneler. Stil flyttade till
  // firmadefaulten i inställningar, Villkor & texter till dokumentets egna
  // textfält, ROT-detaljer till avdragsväxeln vid dokumentets summering.
  test('de tre kvarvarande panelerna monteras i QuoteBuilder.tsx, en gång var', () => {
    const panels = [
      'QuotePaymentPlanSection',
      'QuoteDisplaySettingsSection',
      'QuoteNewAttachmentsCard',
    ]
    for (const panel of panels) {
      const mounts = BUILDER.match(new RegExp(`<${panel}[\\s/>]`, 'g')) || []
      expect(mounts.length, `${panel} ska monteras exakt en gång`).toBe(1)
    }
  })

  test('de tre borttagna panelerna monteras INTE längre i QuoteBuilder.tsx eller QuoteEditView.tsx', () => {
    const EDIT_VIEW = fs.readFileSync(path.join(QUOTES_DIR, '_shared', 'QuoteEditView.tsx'), 'utf8')
    for (const panel of ['QuoteStylePicker', 'QuoteStandardTextsSection', 'QuoteRotSection', 'QuoteTotalsSection']) {
      expect(BUILDER, `${panel} monteras fortfarande i QuoteBuilder.tsx`).not.toMatch(new RegExp(`<${panel}[\\s/>]`))
      expect(EDIT_VIEW, `${panel} monteras fortfarande i QuoteEditView.tsx`).not.toMatch(new RegExp(`<${panel}[\\s/>]`))
    }
  })

  test('QuoteRotSection.tsx, QuoteStandardTextsSection.tsx och QuoteTotalsSection.tsx är raderade filer', () => {
    for (const name of ['QuoteRotSection.tsx', 'QuoteStandardTextsSection.tsx', 'QuoteTotalsSection.tsx']) {
      expect(fs.existsSync(path.join(QUOTES_DIR, '_shared', name)), `${name} finns fortfarande`).toBe(false)
    }
  })

  test('referens-/adressfälten binder till samma state i kundkortet (flyttade dit från Mer → Villkor & texter)', () => {
    // Fälten satt tidigare i den borttagna QuoteStandardTextsSection. Nu
    // binder de i stället i QuoteNewCustomerSection — kundkortet — men mot
    // EXAKT samma state (referencePerson/customerReference/projectAddress).
    expect(NEW_CUSTOMER_SECTION).toContain('referencePerson')
    expect(NEW_CUSTOMER_SECTION).toContain('setReferencePerson')
    expect(NEW_CUSTOMER_SECTION).toContain('customerReference')
    expect(NEW_CUSTOMER_SECTION).toContain('setCustomerReference')
    expect(NEW_CUSTOMER_SECTION).toContain('projectAddress')
    expect(NEW_CUSTOMER_SECTION).toContain('setProjectAddress')

    const mountIdx = BUILDER.indexOf('<QuoteNewCustomerSection')
    expect(mountIdx, 'QuoteNewCustomerSection monteras inte i QuoteBuilder.tsx').toBeGreaterThan(-1)
    const propsBlock = BUILDER.slice(mountIdx, BUILDER.indexOf('/>', mountIdx))
    expect(propsBlock).toContain('referencePerson={referencePerson}')
    expect(propsBlock).toContain('setReferencePerson={setReferencePerson}')
    expect(propsBlock).toContain('customerReference={customerReference}')
    expect(propsBlock).toContain('setCustomerReference={setCustomerReference}')
    expect(propsBlock).toContain('projectAddress={projectAddress}')
    expect(propsBlock).toContain('setProjectAddress={setProjectAddress}')
  })

  test('avdragsväxeln flyttade till dokumentets summering (QuoteDocument.tsx), inte en egen panel', () => {
    expect(DOCUMENT_TYPES).toContain('onDeductionTypeChange')
    expect(QUOTE_DOCUMENT).toContain('onDeductionTypeChange')
    expect(BUILDER).toContain('onDeductionTypeChange: type => setItems(prev => applyGlobalDeductionType(prev, type))')
  })
})

// RIVNING PAKET C (2026-09-17, rad 2.16): completeness-chipraden
// (QuoteCompletenessStrip, header-rad 2, bottenfältets chip-rad,
// hasQuoteContent-gatingen och lib/quotes/quote-completeness.ts) är
// borttagen i sin helhet — Skicka-knappens egen orsakstext ("Välj kund
// först") räcker. De två test.describe-block som källskannade den
// ("completeness-chipraden ersätter kvittots granskningskrav" och
// "Helt tomt läge") är borttagna med den; se
// tests/quote-builder-single-cta-surface.spec.ts för Skicka-knappens
// orsakstext (oförändrad av denna rivning).
