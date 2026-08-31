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
const QUOTE_COMPLETENESS = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'quotes', 'quote-completeness.ts'),
  'utf8',
)
const STANDARD_TEXTS_SECTION = fs.readFileSync(
  path.join(QUOTES_DIR, '_shared', 'QuoteStandardTextsSection.tsx'),
  'utf8',
)

test.describe('Del 1 (redan skeppad, 2026-08-17) — onAtaTermsChange, läsande koll', () => {
  test('typen och dokumentet har fortfarande nyckeln', () => {
    expect(DOCUMENT_TYPES, 'onAtaTermsChange saknas i QuoteDocumentHandlers').toContain('onAtaTermsChange')
    expect(QUOTE_DOCUMENT, 'onAtaTermsChange saknas i QuoteDocument.tsx').toContain('onAtaTermsChange')
  })

  test('den forna gating-kartan (SECTION_KEYS) är verkligen borta, inte bara omdöpt', () => {
    // Fas 1: lib/quotes/section-handlers.ts → quote-completeness.ts, med
    // gating-mekanismen (SECTION_KEYS/sectionHandlers/nextSection) helt
    // borttagen, inte flyttad. Om den smyger tillbaka hit har någon
    // återinfört en handler-filtrerande grind. Matchar mot faktisk KOD
    // (deklaration/anrop), inte fri text — filens egen historik-docblock
    // NÄMNER namnen i förbigående utan att det betyder att de finns kvar.
    expect(QUOTE_COMPLETENESS).not.toMatch(/\bSECTION_KEYS\s*[:=]/)
    expect(QUOTE_COMPLETENESS).not.toMatch(/\bfunction sectionHandlers\s*\(/)
    expect(QUOTE_COMPLETENESS).not.toMatch(/\bfunction nextSection\s*\(/)
  })
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

test.describe('"Mer"-raden är den ENDA vägen till de sex panelerna', () => {
  test('alla sex paneler monteras i QuoteBuilder.tsx, en gång var', () => {
    const panels = [
      'QuoteStylePicker',
      'QuoteStandardTextsSection',
      'QuotePaymentPlanSection',
      'QuoteDisplaySettingsSection',
      'QuoteNewAttachmentsCard',
      'QuoteRotSection',
    ]
    for (const panel of panels) {
      const mounts = BUILDER.match(new RegExp(`<${panel}[\\s/>]`, 'g')) || []
      expect(mounts.length, `${panel} ska monteras exakt en gång`).toBe(1)
    }
  })

  test('referens-/adressfälten binder till samma state i "Mer → Villkor & texter" som förr i QuoteNewMoreAboutProject', () => {
    // Fälten fanns tidigare på TVÅ ställen (Mer-panelen OCH den borttagna
    // QuoteNewMoreAboutProject). Nu finns bara ett — men det stället ska
    // fortfarande binda till EXAKT samma state (referencePerson/
    // customerReference/projectAddress) som innan.
    expect(STANDARD_TEXTS_SECTION).toContain('referencePerson')
    expect(STANDARD_TEXTS_SECTION).toContain('setReferencePerson')
    expect(STANDARD_TEXTS_SECTION).toContain('customerReference')
    expect(STANDARD_TEXTS_SECTION).toContain('setCustomerReference')
    expect(STANDARD_TEXTS_SECTION).toContain('projectAddress')
    expect(STANDARD_TEXTS_SECTION).toContain('setProjectAddress')

    const mountIdx = BUILDER.indexOf('<QuoteStandardTextsSection')
    expect(mountIdx, 'QuoteStandardTextsSection monteras inte i QuoteBuilder.tsx').toBeGreaterThan(-1)
    const propsBlock = BUILDER.slice(mountIdx, BUILDER.indexOf('/>', mountIdx))
    expect(propsBlock).toContain('referencePerson={referencePerson}')
    expect(propsBlock).toContain('setReferencePerson={setReferencePerson}')
    expect(propsBlock).toContain('customerReference={customerReference}')
    expect(propsBlock).toContain('setCustomerReference={setCustomerReference}')
    expect(propsBlock).toContain('projectAddress={projectAddress}')
    expect(propsBlock).toContain('setProjectAddress={setProjectAddress}')
  })
})

test.describe('completeness-chipraden ersätter kvittots granskningskrav', () => {
  test('QuoteCompletenessStrip monteras alltid, inte bakom en quickMode-gate', () => {
    const mountIdx = BUILDER.indexOf('<QuoteCompletenessStrip')
    expect(mountIdx, 'QuoteCompletenessStrip monteras inte').toBeGreaterThan(-1)
    // Ingen `{quickMode === '...' && (` precis före monteringen — chippen
    // ska vara ovillkorlig så fort man är i den fulla editorn (quickMode
    // null-grenen, dit alla tre starterna redan konvergerat).
    const before = BUILDER.slice(Math.max(0, mountIdx - 200), mountIdx)
    expect(before).not.toContain("quickMode === 'overview'")
    expect(before).not.toContain("quickMode === 'review'")
  })
})
