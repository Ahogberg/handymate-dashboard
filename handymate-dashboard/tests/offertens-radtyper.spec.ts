import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Offertens radtyper — invariant låst i rivningen paket A (2026-09-17).
 *
 * Andreas beslut: listvyn tas bort, dokumentet är enda radeditorn. Innan den
 * kunde rivas måste ALLA radtyper gå att skapa från dokumentet. Fram till nu
 * fanns fyra av dem — tillval, fritext, delsumma och rabatt — bara i listvyns
 * "Fler alternativ", alltså bara på desktop, i en vy som var på väg bort.
 *
 * Tillval är det tyngsta: kundens val av tillval på sin egen offertsida är
 * nästa steg i planen, och hantverkaren skapar dem hemma hos kunden med
 * telefonen i handen.
 *
 * Invarianten: varje radtyp i QuoteItemType går att lägga till från
 * AddRowSheet, och båda monteringsställena (skapa och redigera) kopplar in
 * samma delade addItem.
 *
 *   npx playwright test tests/offertens-radtyper.spec.ts --no-deps
 */

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const utanKommentarer = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const SHEET = read('components/quotes/document/AddRowSheet.tsx')
const BUILDER = read('app/dashboard/quotes/_shared/QuoteBuilder.tsx')
const EDIT = read('app/dashboard/quotes/_shared/QuoteEditView.tsx')

/** Radtyperna som finns i datamodellen, ur lib/types/quote.ts. */
const MODELLENS_TYPER = ['item', 'heading', 'text', 'subtotal', 'discount', 'option']

test.describe('alla radtyper går att skapa från dokumentet', () => {
  test('datamodellens radtyper är de vi tror — annars är listan nedan inaktuell', () => {
    const typer = read('lib/types/quote.ts').match(/type QuoteItemType =([^\n]+)/)?.[1] || ''
    for (const typ of MODELLENS_TYPER) {
      expect(typer, `${typ} ska finnas i QuoteItemType`).toContain(`'${typ}'`)
    }
  })

  test('AddRowSheet erbjuder varje radtyp utom artikelraden', () => {
    const sheet = utanKommentarer(SHEET)
    // 'item' skapas genom artikelvalet och "Lägg till tom rad", inte som knapp.
    expect(sheet).toContain('onAddBlankRow(trimmed)')
    for (const typ of MODELLENS_TYPER.filter(t => t !== 'item')) {
      expect(sheet, `${typ} ska gå att lägga till`).toContain(`type: '${typ}' as const`)
    }
  })

  test('etiketterna är hantverkarens ord, inte kodens', () => {
    for (const etikett of ['Rubrik', 'Tillval', 'Fritext', 'Delsumma', 'Rabatt']) {
      expect(SHEET, `${etikett} saknas`).toContain(`label: '${etikett}'`)
    }
  })

  test('träffytan håller 44 px — knapparna trycks på telefon hemma hos kunden', () => {
    const block = utanKommentarer(SHEET).split('ANDRA_RADTYPER.map')[1]?.slice(0, 700) || ''
    expect(block, 'radtypsknapparna renderas').toContain('onClick={() => addRowType(type)}')
    expect(block).toContain('min-h-[44px]')
  })

  test('båda monteringsställena kopplar in samma delade addItem', () => {
    expect(utanKommentarer(BUILDER), 'skapa-läget').toContain('onAddRowType={addItem}')
    expect(utanKommentarer(EDIT), 'redigera-läget').toContain('onAddRowType={addItem}')
    // Ingen väg får ha en egen, parallell radskapare.
    expect(SHEET).not.toMatch(/item_type:\s*'(heading|option|text|subtotal|discount)'/)
  })

  test('sheeten stänger sig efter att en rad lagts till, oavsett typ', () => {
    const kropp = utanKommentarer(SHEET)
    const addRowType = kropp.slice(kropp.indexOf('const addRowType'), kropp.indexOf('const addRowType') + 160)
    expect(addRowType).toContain('onAddRowType(type)')
    expect(addRowType).toContain('onClose()')
  })
})

/**
 * Listvyn är borta (rivningen paket A, Andreas beslut 2026-09-17: "Ta bort
 * listvyn också"). Dokumentet är enda radeditorn på alla skärmbredder.
 */
const ROW_SHEET = read('components/quotes/document/RowEditSheet.tsx')
const finns = (p: string) => fs.existsSync(path.join(ROOT, p))

test.describe('dokumentet är enda radeditorn', () => {
  test('listvyns filer är raderade', () => {
    for (const fil of [
      'app/dashboard/quotes/_shared/QuoteItemsSection.tsx',
      'app/dashboard/quotes/_shared/QuoteAddRowCombo.tsx',
      'app/dashboard/quotes/_shared/QuoteProductSearchModal.tsx',
      'components/quotes/ItemRow.tsx',
    ]) {
      expect(finns(fil), `${fil} ska vara raderad`).toBe(false)
    }
    // Projektvyn äger grossistmodalen — den filen lever vidare.
    expect(finns('components/ProductSearchModal.tsx'), 'projektvyns modal finns kvar').toBe(true)
  })

  test('ingen vy-växel och ingen mainView-state finns kvar', () => {
    // Kommentarerna får nämna det borttagna — koden får inte.
    for (const fil of [utanKommentarer(BUILDER), utanKommentarer(EDIT)]) {
      expect(fil).not.toContain('mainView')
      expect(fil).not.toContain('setMainView')
      expect(fil).not.toContain('QuoteItemsSection')
    }
    expect(BUILDER, 'Listvy-knappen är borta').not.toMatch(/>\s*Listvy\s*</)
  })

  test('enheterna bor på ett ställe, delat av dokumentraden och radbladet', () => {
    expect(finns('lib/quotes/item-format.ts')).toBe(true)
    for (const fil of ['components/quotes/document/QuoteDocumentRow.tsx',
                       'components/quotes/document/RowEditSheet.tsx']) {
      expect(read(fil), `${fil} läser den delade enhetslistan`)
        .toContain("from '@/lib/quotes/item-format'")
    }
  })

  test('en BEFINTLIG rad går att koppla till en artikel från radbladet', () => {
    // Blockeraren som hittades innan listvyn kunde rivas: kopplingen fanns
    // bara i ItemRow. Den är det som låser upp frågeflödets mängdregel
    // (intakeRowTakesQuantity), så den fick aldrig försvinna med listvyn.
    const sheet = utanKommentarer(ROW_SHEET)
    // Villkoret, inte bara närvaron: en combo bakom `false ?` är ingen combo.
    expect(sheet).toContain('{isEditable && onSelectProductForRow ? (')
    const gren = sheet.slice(sheet.indexOf('{isEditable && onSelectProductForRow ? ('))
    expect(gren.slice(0, 400)).toContain('<QuoteRowProductCombo')
    expect(sheet).toContain('onSelectProduct={product => onSelectProductForRow(item.id, product)}')
    expect(sheet).toContain('onChangeText={text => onUpdate(item.id, \'description\', text)}')
    for (const fil of [utanKommentarer(BUILDER), utanKommentarer(EDIT)]) {
      expect(fil).toContain('onSelectProductForRow={(itemId, product) => { void applyProductToExistingRow(itemId, product) }}')
    }
  })

  test('radbladet kan fortfarande flytta och ta bort rader — sorteringen ersätter drag och släpp', () => {
    const sheet = utanKommentarer(ROW_SHEET)
    expect(sheet).toContain('onMove')
    expect(sheet).toContain('onRemove')
    expect(utanKommentarer(BUILDER), 'flytt sker med id, inte index').toContain('onMove={moveItemById}')
  })
})
