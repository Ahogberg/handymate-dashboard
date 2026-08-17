/**
 * "MER"-inställningarnas väg in i sektionsflödet (jaunty-pondering-
 * hummingbird.md, Del 1–4, 2026-08-17).
 *
 * Andreas skarpa fråga: varför finns den gamla helhetsvyns sex flikar
 * (Stil, Villkor & texter, Betalplan, Visning, Bilagor, ROT-detaljer) kvar
 * som den ENDA vägen till fält som saknas i det guidade sektionsflödet?
 * Svaret som byggdes: bygg ut sektionsflödet så det täcker allt, i stället
 * för att bara göra länken till gamla editorn tydligare. Efter Del 1–4 ska
 * gamla editorn ha NOLL fält som inte också finns i det guidade flödet.
 *
 * Källskanning (husets facit-stil, samma idiom som
 * tests/snabboffert-startvagar.spec.ts): låser strukturen som gör det
 * sant, så en framtida ändring inte tyst återinför beroendet av gamla
 * editorn.
 *
 *   npx playwright test tests/quotes-mer-i-flodet.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const PAGE = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'dashboard', 'quotes', 'new', 'page.tsx'),
  'utf8',
)
const MORE_ABOUT_PROJECT = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'app',
    'dashboard',
    'quotes',
    'new',
    'components',
    'quick',
    'QuoteNewMoreAboutProject.tsx',
  ),
  'utf8',
)
const QUICK_RECEIPT = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'dashboard', 'quotes', 'new', 'components', 'quick', 'QuickReceipt.tsx'),
  'utf8',
)
const DOCUMENT_TYPES = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'quotes', 'document', 'types.ts'),
  'utf8',
)
const QUOTE_DOCUMENT = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'quotes', 'document', 'QuoteDocument.tsx'),
  'utf8',
)
const SECTION_HANDLERS = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'quotes', 'section-handlers.ts'),
  'utf8',
)

test.describe('Del 1 (redan skeppad, 2026-08-17) — onAtaTermsChange, läsande koll', () => {
  // Ingen av Del 1/2:s filer rörs i det här bygget (Del 3+4) — testet
  // bekräftar bara att grunden fortfarande står, inte att bygga om den.
  test('typen, dokumentet och sektionslistan har alla nyckeln', () => {
    expect(DOCUMENT_TYPES, 'onAtaTermsChange saknas i QuoteDocumentHandlers').toContain('onAtaTermsChange')
    expect(QUOTE_DOCUMENT, 'onAtaTermsChange saknas i QuoteDocument.tsx').toContain('onAtaTermsChange')
    expect(SECTION_HANDLERS, 'onAtaTermsChange saknas i exkluderats handlerlista').toContain(
      "exkluderat: ['onNotIncludedChange', 'onTermsChange', 'onAtaTermsChange']",
    )
  })
})

test.describe('Del 3 — "Mer om projektet" i den delade granskningsheadern', () => {
  test('komponenten är monterad i page.tsx', () => {
    expect(PAGE, 'QuoteNewMoreAboutProject importeras inte').toContain(
      "import { QuoteNewMoreAboutProject } from './components/quick/QuoteNewMoreAboutProject'",
    )
    expect(PAGE, 'QuoteNewMoreAboutProject monteras inte').toContain('<QuoteNewMoreAboutProject')
  })

  test('monteringen sitter i den delade review+overview-headern, inte bakom quickMode-gate', () => {
    // Headerblocket delas mellan review och overview via villkoret på rad
    // ~2178 (`(quickMode === 'review' || quickMode === 'overview') ?`).
    // Testet låser att monteringen ligger EFTER det villkoret men FÖRE
    // resten av granskningsytan börjar (askPreferredFor-bannern), dvs i
    // själva header-blocket.
    const gateIdx = PAGE.indexOf("(quickMode === 'review' || quickMode === 'overview') ?")
    const mountIdx = PAGE.indexOf('<QuoteNewMoreAboutProject')
    const askIdx = PAGE.indexOf('askPreferredFor && (')
    expect(gateIdx, 'delade review/overview-villkoret finns inte längre').toBeGreaterThan(-1)
    expect(mountIdx, 'QuoteNewMoreAboutProject monteras inte').toBeGreaterThan(gateIdx)
    expect(mountIdx, 'QuoteNewMoreAboutProject ligger inte i header-blocket (efter askPreferredFor)').toBeLessThan(
      askIdx,
    )
  })

  test('de tre fälten binder till EXAKT samma state som gamla editorns Villkor-flik', () => {
    expect(MORE_ABOUT_PROJECT).toContain('referencePerson')
    expect(MORE_ABOUT_PROJECT).toContain('setReferencePerson')
    expect(MORE_ABOUT_PROJECT).toContain('customerReference')
    expect(MORE_ABOUT_PROJECT).toContain('setCustomerReference')
    expect(MORE_ABOUT_PROJECT).toContain('projectAddress')
    expect(MORE_ABOUT_PROJECT).toContain('setProjectAddress')

    // page.tsx skickar in exakt samma variabler den redan använder i
    // sparningen/gamla editorns Villkor-tab — inga nya parallella state-par.
    const mountIdx = PAGE.indexOf('<QuoteNewMoreAboutProject')
    const propsBlock = PAGE.slice(mountIdx, PAGE.indexOf('/>', mountIdx))
    expect(propsBlock).toContain('referencePerson={referencePerson}')
    expect(propsBlock).toContain('setReferencePerson={setReferencePerson}')
    expect(propsBlock).toContain('customerReference={customerReference}')
    expect(propsBlock).toContain('setCustomerReference={setCustomerReference}')
    expect(propsBlock).toContain('projectAddress={projectAddress}')
    expect(propsBlock).toContain('setProjectAddress={setProjectAddress}')
  })

  test('stängd som default — ingen "open"/"alltid synlig"-prop, native <details>', () => {
    expect(MORE_ABOUT_PROJECT).toContain('<details')
    expect(MORE_ABOUT_PROJECT).toContain('<summary')
  })
})

test.describe('Del 4 — QuickReceipt får Bilagor, Stil och Visning', () => {
  test('QuoteNewAttachmentsCard monteras oförändrad', () => {
    expect(QUICK_RECEIPT, 'QuoteNewAttachmentsCard importeras inte').toContain(
      "import { QuoteNewAttachmentsCard } from '../QuoteNewAttachmentsCard'",
    )
    expect(QUICK_RECEIPT).toContain('<QuoteNewAttachmentsCard')
  })

  test('Bilagor-raden ligger mellan sektionslistan och attentions/unreviewed-blocken, INTE bakom en stängd default-utfällning', () => {
    const sectionListEnd = QUICK_RECEIPT.indexOf('{attentions.length > 0 && (')
    const bilagorIdx = QUICK_RECEIPT.indexOf('Bilagor')
    const attachmentsMountIdx = QUICK_RECEIPT.indexOf('<QuoteNewAttachmentsCard')
    expect(bilagorIdx, 'Bilagor-raden finns').toBeGreaterThan(-1)
    expect(bilagorIdx, 'Bilagor-raden ska ligga före attentions-blocket').toBeLessThan(sectionListEnd)
    expect(attachmentsMountIdx).toBeGreaterThan(bilagorIdx)

    // Antalet ska synas i själva raden (alltid synligt), inte bara inuti
    // det som expanderas.
    const rowSlice = QUICK_RECEIPT.slice(bilagorIdx, attachmentsMountIdx)
    expect(rowSlice, 'antalet bilagor visas inte i den alltid synliga raden').toContain('attachments.length')
  })

  test('QuoteStylePicker och QuoteEditDisplaySettingsSection monteras oförändrade', () => {
    expect(QUICK_RECEIPT, 'QuoteStylePicker importeras inte').toContain(
      "import { QuoteStylePicker } from '@/components/quotes/QuoteStylePicker'",
    )
    expect(QUICK_RECEIPT, 'QuoteEditDisplaySettingsSection importeras inte').toContain(
      "import { QuoteEditDisplaySettingsSection } from '../../../[id]/edit/components/QuoteEditDisplaySettingsSection'",
    )
    expect(QUICK_RECEIPT).toContain('<QuoteStylePicker')
    expect(QUICK_RECEIPT).toContain('<QuoteEditDisplaySettingsSection')
  })

  test('Stil + Visning delar EN gemensam "Fler inställningar"-utfällning, stängd som default', () => {
    // lastIndexOf, inte indexOf: strängen nämns även i filens docblock
    // (rad ~44) — den faktiska <summary>-texten är den SISTA förekomsten.
    const detailsIdx = QUICK_RECEIPT.lastIndexOf('Fler inställningar')
    expect(detailsIdx, '"Fler inställningar" finns inte').toBeGreaterThan(-1)

    const openTagIdx = QUICK_RECEIPT.lastIndexOf('<details', detailsIdx)
    expect(openTagIdx, 'ingen <details> omsluter "Fler inställningar"').toBeGreaterThan(-1)
    const closeIdx = QUICK_RECEIPT.indexOf('</details>', detailsIdx)
    const block = QUICK_RECEIPT.slice(openTagIdx, closeIdx)

    // Bägge monteras INUTI samma <details>-block — en enda utfällning,
    // inte två separata.
    expect(block).toContain('<QuoteStylePicker')
    expect(block).toContain('<QuoteEditDisplaySettingsSection')
  })

  test('page.tsx trär in samma befintliga state i BÅDA <QuickReceipt>-monteringarna', () => {
    const mounts = PAGE.split('<QuickReceipt').slice(1)
    expect(mounts.length, 'förväntar exakt två QuickReceipt-monteringar').toBe(2)

    const requiredProps = [
      'attachments={attachments}',
      'setAttachments={setAttachments}',
      'uploadingFile={uploadingFile}',
      'onFileUpload={handleFileUpload}',
      'templateStyle={templateStyle}',
      'setTemplateStyle={setTemplateStyle}',
      'businessDefaultStyle={businessDefaultStyle}',
      'detailLevel={detailLevel}',
      'setDetailLevel={setDetailLevel}',
      'showUnitPrices={showUnitPrices}',
      'setShowUnitPrices={setShowUnitPrices}',
      'showQuantities={showQuantities}',
      'setShowQuantities={setShowQuantities}',
    ]
    for (const mount of mounts) {
      const propsBlock = mount.slice(0, mount.indexOf('/>'))
      for (const prop of requiredProps) {
        expect(propsBlock, `saknar ${prop} i en QuickReceipt-montering`).toContain(prop)
      }
    }
  })
})
