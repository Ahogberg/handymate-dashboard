import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { hasQuoteStartSignal, readQuoteStartParams } from '../lib/quotes/start-params'

/**
 * Offertstarten är en skärm (rivningen A3, 2026-09-17).
 *
 * Sju ytor revs ur starten: mellanskärmen, headerlänken, mallistan,
 * arbetsprovsbannern, kundunderlagspanelen, offertguiden och helskärmsfrågan
 * om återställning. Kvar: intaget med jobbtypsremsan, två knappar, och en
 * adressrad med EN dialekt. Facit låser att det inte växer tillbaka.
 *
 *   npx playwright test tests/offertstarten-en-skarm.spec.ts --no-deps
 */
const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const finns = (p: string) => fs.existsSync(path.join(ROOT, p))
const utanKommentarer = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const BUILDER = utanKommentarer(read('app/dashboard/quotes/_shared/QuoteBuilder.tsx'))
const params = (q: string) => new URLSearchParams(q)

test.describe('adressraden — en läsare, en dialekt', () => {
  test('customer_id är dialekten; customerId läses tyst för gamla länkar', () => {
    expect(readQuoteStartParams(params('customer_id=c1')).customerId).toBe('c1')
    expect(readQuoteStartParams(params('customerId=c2')).customerId).toBe('c2')
    expect(readQuoteStartParams(params('customer_id=c1&customerId=c2')).customerId, 'repots form vinner').toBe('c1')
    expect(readQuoteStartParams(null).customerId).toBeNull()
  })

  test('description, preparation_id och relief är startsignaler — de öppnade tidigare ett tomt intag', () => {
    expect(hasQuoteStartSignal(readQuoteStartParams(params('')))).toBe(false)
    for (const q of ['description=Byt%20dörrar', 'preparation_id=p1', 'relief=x', 'customer_id=c', 'deal_id=d', 'lead_id=l', 'title=t', 'transcript=x']) {
      expect(hasQuoteStartSignal(readQuoteStartParams(params(q))), `${q} ska räknas`).toBe(true)
    }
  })

  test('tomma och överlånga värden blir null', () => {
    expect(readQuoteStartParams(params('customer_id=%20%20')).customerId).toBeNull()
    expect(readQuoteStartParams(params(`title=${'x'.repeat(301)}`)).title).toBeNull()
    expect(readQuoteStartParams(params(`description=${'x'.repeat(4000)}`)).description).toHaveLength(4000)
  })

  test('ingen ingång i repot skriver customerId längre', () => {
    const kod = ['app', 'components', 'lib']
      .flatMap(dir => alla(path.join(ROOT, dir)))
      .filter(f => /\.(ts|tsx)$/.test(f) && !f.includes('node_modules'))
    const syndare = kod.filter(f => /quotes\/new\?[^`'"]*customerId=/.test(fs.readFileSync(f, 'utf8')))
    expect(syndare.map(f => path.relative(ROOT, f)), 'ingångar som skriver camelCase').toEqual([])
    // Och minst de fem kända skriver customer_id.
    for (const fil of ['app/dashboard/pipeline/components/DealCard.tsx', 'app/dashboard/pipeline/components/DealModal.tsx',
                       'app/dashboard/customers/[id]/page.tsx', 'components/customer-preparation/CustomerPreparations.tsx']) {
      expect(read(fil), `${fil} skriver customer_id`).toMatch(/quotes\/new\?[^`'"]*customer_id=/)
    }
  })

  test('QuoteBuilder läser adressraden genom läsaren, inte fält för fält', () => {
    expect(BUILDER).toContain('readQuoteStartParams(searchParams)')
    expect(BUILDER, 'kallstartsgrinden går genom samma läsare').toContain('startSignalOf(readQuoteStartParams(searchParams))')
    expect(BUILDER).not.toContain("searchParams?.get('customerId')")
    expect(BUILDER).not.toContain("searchParams?.get('customer_id')")
    // description når intagets ruta, inte bara offerten.
    expect(BUILDER).toContain('setQuickInput(prev => prev || prefillDescription)')
  })
})

test.describe('kundunderlaget går direkt i rutan', () => {
  test('?preparation_id laddas i mount-effekten och fyller intag, AI-text och underlag', () => {
    expect(BUILDER).toContain('void loadPreparationQuoteInput(customerId, preparationId)')
    const idx = BUILDER.indexOf('void loadPreparationQuoteInput(customerId, preparationId)')
    const block = BUILDER.slice(idx, idx + 700)
    for (const s of ['setQuickInput(', 'setAiTextInput(', 'setSourceTranscript(']) expect(block).toContain(s)
    expect(block, 'ett läsfel blir synligt').toContain('setReliefError(')
    expect(finns('components/customer-preparation/QuotePreparationInput.tsx')).toBe(false)
    expect(BUILDER).not.toContain('QuotePreparationInput')
  })
})

test.describe('återställningen sker automatiskt', () => {
  test('hooken körs med autoRestore och en onReset; helskärmsfrågan är borta', () => {
    expect(BUILDER).toContain('autoRestore: true,')
    expect(BUILDER).toContain('onReset: () => {')
    expect(BUILDER).not.toContain('Du har en påbörjad offert')
    expect(BUILDER).not.toContain('recovery.pending')
    expect(BUILDER, 'Börja om finns i statusraden').toContain('onClick={recovery.discardRestored}')
    const hook = utanKommentarer(read('app/dashboard/quotes/_shared/useQuoteRecovery.ts'))
    expect(hook).toContain('if (copy && autoRestore) {')
    expect(hook).toContain('current.current.onRestore(copy.value)')
    expect(hook, 'gamla kontraktet står kvar för quote-experience.ui').toContain('return {pending,status,restored,clear,restore,discard,discardRestored}')
  })
})

test.describe('det rivna finns inte kvar', () => {
  test('komponenterna är raderade och importeras inte', () => {
    for (const fil of ['components/onboarding/WorkSampleResume.tsx', 'components/onboarding/FirstQuoteGuide.tsx',
                       'components/customer-preparation/QuotePreparationInput.tsx',
                       'app/dashboard/quotes/new/components/quick/QuickBlankStart.tsx',
                       'app/dashboard/quotes/new/components/QuoteNewStartChooser.tsx']) {
      expect(finns(fil), `${fil} ska vara raderad`).toBe(false)
    }
    for (const namn of ['WorkSampleResume', 'FirstQuoteGuide', 'workSampleDraft', 'QuotePreparationInput', 'QuickBlankStart', 'QuoteNewStartChooser']) {
      expect(BUILDER, `${namn} ska vara borta`).not.toContain(namn)
    }
    // Statusraden efter upplägget står kvar — det var guidens enda värde.
    expect(BUILDER).toContain('Ditt underlag är på plats.')
    // Onboardingens arbetsprov lever vidare där det hör hemma.
    expect(finns('components/onboarding/WorkSampleStart.tsx')).toBe(true)
    expect(read('lib/onboarding/work-sample.ts')).toContain('export function readWorkSample')
  })

  test('kontraktsgrinden kör facit lokalt och i CI', () => {
    expect(JSON.parse(read('package.json')).scripts['test:contracts']).toContain('tests/offertstarten-en-skarm.spec.ts')
    expect(fs.readFileSync(path.join(ROOT, '..', '.github/workflows/contracts.yml'), 'utf8')).toContain('tests/offertstarten-en-skarm.spec.ts')
  })
})

function alla(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === '.next' ? [] : alla(p)
    return [p]
  })
}
