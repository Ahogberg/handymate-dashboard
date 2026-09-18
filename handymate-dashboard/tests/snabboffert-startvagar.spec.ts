import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Snabboffertens startvägar — efter rivningen A3 (2026-09-17).
 *
 * Intaget är den enda startskärmen och har TVÅ vägar ut: "Bygg utkast"
 * (Matte) och "Bygg själv" (rakt in i dokumentet). Båda slutar i samma
 * delade avslutning, finishQuickStart(). Det som revs: headerlänken "Öppna
 * editorn direkt", mellanskärmen QuickBlankStart (titel + kund innan
 * editorn), "Använd en mall" med mallistan QuoteNewStartChooser, och
 * startlägena 'blank' och templatePickerOpen.
 *
 * Det här facit stod tidigare OGATAT utanför test:contracts och låste
 * precis det som revs. Nu i grinden.
 *
 *   npx playwright test tests/snabboffert-startvagar.spec.ts --no-deps
 */
const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const finns = (p: string) => fs.existsSync(path.join(ROOT, p))
const utanKommentarer = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const PAGE = utanKommentarer(read('app/dashboard/quotes/_shared/QuoteBuilder.tsx'))
const INTAKE = utanKommentarer(read('app/dashboard/quotes/new/components/quick/QuickIntake.tsx'))

test.describe('två vägar ut ur intaget, en editor', () => {
  test('AI-vägen: buildQuickDraft slutar i finishQuickStart', () => {
    const fn = PAGE.slice(PAGE.indexOf('async function buildQuickDraft'))
    const body = fn.slice(0, fn.indexOf('\n  }'))
    expect(body).toContain('finishQuickStart()')
    expect(body, 'aldrig setQuickMode(null) förbi den delade funktionen').not.toContain('setQuickMode(null)')
  })

  test('Bygg själv: texten följer med (leaveQuickMode(true)) och landar via finishQuickStart', () => {
    expect(PAGE).toContain('onBuildYourself={() => { leaveQuickMode(true); finishQuickStart() }}')
    // 'blank' lever kvar som återställningens scope-namn — det är inte ett
    // startläge. Startlägena är exakt tre plus null.
    expect(PAGE, 'inget blank-startläge').toContain("useState<'intake' | 'building' | 'fragor' | null>(null)")
    expect(PAGE).not.toContain("setQuickMode('blank')")
    expect(PAGE).not.toContain("quickMode === 'blank'")
    expect(PAGE).not.toContain('startBlankQuickDraft')
  })

  test('upplägg-vägen: jobbtypsstarten och Övriga upplägg slutar i finishQuickStart', () => {
    // Från main 2026-09-17: mallistan är borta, och vägen till ett upplägg är
    // jobbtypsremsan. Den får aldrig landa i editorn via en egen genväg.
    expect(PAGE).not.toContain('QuoteNewStartChooser')
    expect(PAGE).not.toContain('onSelectTemplate=')
    // applyJobTypeStart kan inte avsluta själv: frågeflödet lägger sig emellan
    // (2026-09-17) och avslutningen sker i applyVerifiedJobTypeStart när
    // frågorna besvarats eller hoppats över. Invarianten är densamma — ingen
    // väg får ta en egen genväg förbi finishQuickStart.
    for (const namn of ['function applyVerifiedJobTypeStart', 'async function applyOvrigtUpplagg']) {
      const fn = PAGE.slice(PAGE.indexOf(namn))
      const body = fn.slice(0, fn.indexOf('\n  }'))
      expect(body, `${namn} ska landa i editorn via den delade funktionen`).toContain('finishQuickStart()')
      expect(body).not.toContain('setQuickMode(null)')
    }
    const start = PAGE.slice(PAGE.indexOf('async function applyJobTypeStart'))
    expect(start.slice(0, start.indexOf('\n  }')), 'starten delegerar, tar ingen genväg')
      .toContain('applyVerifiedJobTypeStart(start, null)')
  })

  test('finishQuickStart() finns bara en gång och landar i editorn', () => {
    expect((PAGE.match(/function finishQuickStart\(\)/g) || []).length).toBe(1)
    const fn = PAGE.slice(PAGE.indexOf('function finishQuickStart()'))
    expect(fn.slice(0, fn.indexOf('\n  }'))).toContain('setQuickMode(null)')
  })

  test('leaveQuickMode bär fortfarande med skriven text', () => {
    const idx = PAGE.indexOf('function leaveQuickMode')
    expect(idx).toBeGreaterThan(-1)
    const kropp = PAGE.slice(idx, idx + 600)
    expect(kropp).toContain('if (typed && !description.trim()) setDescription(typed)')
    expect(kropp).toContain('if (typed && !sourceTranscript) setSourceTranscript(typed)')
  })
})

test.describe('intaget — två riktiga knappar', () => {
  test('Bygg utkast och Bygg själv finns; Bygg själv är en sekundärknapp', () => {
    expect(INTAKE).toContain('Bygg utkast')
    const idx = INTAKE.indexOf('onClick={onBuildYourself}')
    expect(idx, 'Bygg själv-knappen finns').toBeGreaterThan(-1)
    const around = INTAKE.slice(idx, idx + 400)
    expect(around).toContain('border-2 border-slate-200')
    expect(around).not.toContain('underline')
    expect(around).toContain('Bygg själv')
  })

  test('de rivna knapparna är borta ur intaget', () => {
    for (const borta of ['Öppna editorn direkt', 'Använd en mall', 'onOpenFullEditor', 'onUseTemplate', 'onSkipDescription']) {
      expect(INTAKE, `${borta} ska vara borta`).not.toContain(borta)
    }
    expect(INTAKE).toContain('Bygg utkast')
    expect(INTAKE).toContain('Bygg själv')
  })
})

test.describe('det rivna finns inte kvar', () => {
  test('filerna är raderade och importeras ingenstans', () => {
    for (const fil of [
      'app/dashboard/quotes/new/components/quick/QuickBlankStart.tsx',
      'app/dashboard/quotes/new/components/QuoteNewStartChooser.tsx',
    ]) expect(finns(fil), `${fil} ska vara raderad`).toBe(false)
    for (const namn of ['QuickBlankStart', 'QuoteNewStartChooser', 'templatePickerOpen', 'setTemplatePickerOpen']) {
      expect(PAGE, `${namn} ska vara borta ur QuoteBuilder`).not.toContain(namn)
    }
  })

  test('kallstarten går rakt till intaget, utan gren', () => {
    const idx = PAGE.indexOf('quickStartDoneRef.current = true')
    expect(idx).toBeGreaterThan(-1)
    const efter = PAGE.slice(idx, idx + 400)
    expect(efter).toContain("setQuickMode('intake')")
    expect(efter).not.toContain('getPreferredStart')
  })

  test('startvanan är fortfarande borta (A1)', () => {
    for (const spar of ["from '@/lib/quotes/quick-preferences'", 'preferredStart', 'askPreferredFor', '<QuickStartPreferenceBanner']) {
      expect(PAGE).not.toContain(spar)
    }
    expect(finns('lib/quotes/quick-preferences.ts')).toBe(false)
  })

  test('facit är gatat — det stod utanför grinden och låste det som revs', () => {
    expect(JSON.parse(read('package.json')).scripts['test:contracts']).toContain('tests/snabboffert-startvagar.spec.ts')
    expect(fs.readFileSync(path.join(ROOT, '..', '.github/workflows/contracts.yml'), 'utf8')).toContain('tests/snabboffert-startvagar.spec.ts')
  })
})
