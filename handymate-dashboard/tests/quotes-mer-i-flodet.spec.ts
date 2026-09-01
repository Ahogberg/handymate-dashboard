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
const BUILDER_HEADER = fs.readFileSync(
  path.join(QUOTES_DIR, '_shared', 'QuoteBuilderHeader.tsx'),
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
  // Design-polish-etappen (offertskaparen-design-polish, 2026-08-31) flyttade
  // remsans RENDERING in i QuoteBuilderHeader.tsx (header-rad 2, samma sticky-
  // wrapper som rad 1) så den slutar scrolla bort under headern. Den låg
  // tidigare i en egen <div className="mb-4"> direkt i QuoteBuilder.tsx —
  // det stället testas inte längre, bara den nya monteringspunkten.
  test('QuoteCompletenessStrip monteras i QuoteBuilderHeader, alltid synlig (ingen quickMode-gate)', () => {
    const mountIdx = BUILDER_HEADER.indexOf('<QuoteCompletenessStrip')
    expect(mountIdx, 'QuoteCompletenessStrip monteras inte i QuoteBuilderHeader.tsx').toBeGreaterThan(-1)
  })

  test('QuoteBuilder.tsx skickar completenessSummaries till headern, inte bakom en quickMode-gate', () => {
    const mountIdx = BUILDER.indexOf('<QuoteBuilderHeader')
    expect(mountIdx, 'QuoteBuilderHeader monteras inte i QuoteBuilder.tsx').toBeGreaterThan(-1)
    const propsBlock = BUILDER.slice(mountIdx, BUILDER.indexOf('/>', mountIdx))
    // Slutgranskningsfix (offertskaparen-design-polish, "Helt tomt läge"):
    // proppen är sedan dess villkorad på hasQuoteContent (DESIGN-SPEC.md),
    // inte längre den råa completenessSummaries-referensen rakt av — se
    // egen test.describe nedan för hasQuoteContent-villkoret självt. Det
    // som fortfarande gäller, och som denna test bevakar, är att INGEN
    // quickMode-gate ligger emellan (se assertionen längre ner).
    expect(propsBlock).toContain('completenessSummaries={hasQuoteContent ? completenessSummaries : undefined}')
    // Ingen `{quickMode === '...' && (` precis före monteringen — headern
    // (och därmed chip-raden) ska vara ovillkorlig så fort man är i den
    // fulla editorn (quickMode null-grenen, dit alla tre starterna redan
    // konvergerat).
    const before = BUILDER.slice(Math.max(0, mountIdx - 200), mountIdx)
    expect(before).not.toContain("quickMode === 'overview'")
    expect(before).not.toContain("quickMode === 'review'")
  })

  test('edit-läget (QuoteEditView.tsx) får också en completeness-remsa — inte bara create-läget', () => {
    const EDIT_VIEW = fs.readFileSync(path.join(QUOTES_DIR, '_shared', 'QuoteEditView.tsx'), 'utf8')
    const mountIdx = EDIT_VIEW.indexOf('<QuoteBuilderHeader')
    expect(mountIdx, 'QuoteBuilderHeader monteras inte i QuoteEditView.tsx').toBeGreaterThan(-1)
    const propsBlock = EDIT_VIEW.slice(mountIdx, EDIT_VIEW.indexOf('/>', mountIdx))
    expect(propsBlock).toContain('completenessSummaries={hasQuoteContent ? completenessSummaries : undefined}')
    expect(propsBlock).toContain('onSelectSection={onSelectSection}')
  })
})

test.describe('"Helt tomt läge" (DESIGN-SPEC.md) — completeness-remsan döljs helt, inte bara attention-styling', () => {
  // Slutgranskningsfynd (offertskaparen-design-polish): DESIGN-SPEC.md
  // (rad ~62-65) kräver att BÅDE header-radens strip och mobilens
  // bottenfälts-chiprad döljs HELT när offerten saknar meningsfullt
  // innehåll (`items.length > 0 || selectedCustomer`) — inte bara att
  // attention/amber-styling stängs av. Utan detta visade en helt ny, tom
  // offert en amber "Offerten har inga rader"-chip i bottenfältet SAMTIDIGT
  // som Fas E:s lugna tomt-läge i canvasen — två motsägande budskap på
  // samma skärm, den vanligaste "dag ett"-vägen (ny offert, mobil).
  const EDIT_VIEW = fs.readFileSync(path.join(QUOTES_DIR, '_shared', 'QuoteEditView.tsx'), 'utf8')
  const BOTTOM_BAR = fs.readFileSync(path.join(QUOTES_DIR, '_shared', 'QuoteBuilderBottomBar.tsx'), 'utf8')

  test('QuoteBuilder.tsx (create) och QuoteEditView.tsx beräknar exakt samma villkor', () => {
    const NEEDLE = 'const hasQuoteContent = items.length > 0 || !!selectedCustomer'
    expect(BUILDER, 'hasQuoteContent saknas i QuoteBuilder.tsx').toContain(NEEDLE)
    expect(EDIT_VIEW, 'hasQuoteContent saknas i QuoteEditView.tsx').toContain(NEEDLE)
  })

  test('QuoteBuilder.tsx trådar hasQuoteContent in i QuoteBuilderBottomBar', () => {
    const mountIdx = BUILDER.indexOf('<QuoteBuilderBottomBar')
    expect(mountIdx, 'QuoteBuilderBottomBar monteras inte i QuoteBuilder.tsx').toBeGreaterThan(-1)
    const propsBlock = BUILDER.slice(mountIdx, BUILDER.indexOf('/>', mountIdx))
    expect(propsBlock).toContain('hasQuoteContent={hasQuoteContent}')
  })

  test('QuoteEditView.tsx trådar hasQuoteContent in i QuoteBuilderBottomBar', () => {
    const mountIdx = EDIT_VIEW.indexOf('<QuoteBuilderBottomBar')
    expect(mountIdx, 'QuoteBuilderBottomBar monteras inte i QuoteEditView.tsx').toBeGreaterThan(-1)
    const propsBlock = EDIT_VIEW.slice(mountIdx, EDIT_VIEW.indexOf('/>', mountIdx))
    expect(propsBlock).toContain('hasQuoteContent={hasQuoteContent}')
  })

  test('QuoteBuilderBottomBar.tsx: chip-raden är gated på hasQuoteContent, knapparna är det INTE', () => {
    expect(BOTTOM_BAR).toContain('hasQuoteContent: boolean')
    expect(BOTTOM_BAR).toContain('{hasQuoteContent && (')

    // Knapparnas rot-<div> (den som håller Spara utkast/Skicka offert) ska
    // finnas UTANFÖR den villkorade chip-raden — dvs. efter dess stängande
    // `)}`, inte inuti den.
    const gateIdx = BOTTOM_BAR.indexOf('{hasQuoteContent && (')
    const buttonsIdx = BOTTOM_BAR.indexOf('<div className="relative flex items-stretch gap-2">')
    expect(buttonsIdx, 'knapparnas rot-div hittades inte').toBeGreaterThan(-1)
    expect(buttonsIdx, 'knapparna ligger inuti (eller före) chip-radens villkor')
      .toBeGreaterThan(gateIdx)

    const saveDraftIdx = BOTTOM_BAR.indexOf('onClick={onSaveDraft}')
    const sendQuoteIdx = BOTTOM_BAR.indexOf('onClick={onSendQuote}')
    expect(saveDraftIdx).toBeGreaterThan(buttonsIdx)
    expect(sendQuoteIdx).toBeGreaterThan(buttonsIdx)
  })
})
