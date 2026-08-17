/**
 * Snabboffertens startvägs-invariant (Andreas krav, låst 2026-08-17):
 *
 *   "Oavsett om man väljer att få utkast med AI, att skapa en ny själv
 *    eller med en sparad mall ska man ALLTID hamna i vår nya
 *    offertskapare" — den sektionsvisa granskningen från 2026-08-14.
 *
 * Alla tre starterna ska konvergera i enterQuickReview(). Den gamla
 * fullständiga editorn får BARA nås via explicita utrymningsvägar
 * ("Öppna editorn direkt"/"Öppna fullständiga editorn") eller den
 * sparade editor-preferensen — aldrig som oavsiktlig landningsyta för
 * någon av de tre riktiga starterna.
 *
 * Källskanning (husets facit-stil): låser strukturen som gör invarianten
 * sann, så en refaktor som bryter den blir röd — inte en tyst regression
 * som återupptäcks av en förvirrad användare.
 *
 *   npx playwright test tests/snabboffert-startvagar.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const PAGE = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'dashboard', 'quotes', 'new', 'page.tsx'),
  'utf8',
)
const INTAKE = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'dashboard', 'quotes', 'new', 'components', 'quick', 'QuickIntake.tsx'),
  'utf8',
)

test.describe('alla tre starterna landar i sektionsgranskningen', () => {
  test('AI-vägen: buildQuickDraft slutar i enterQuickReview', () => {
    const fn = PAGE.slice(PAGE.indexOf('async function buildQuickDraft'))
    const body = fn.slice(0, fn.indexOf('\n  }'))
    expect(body, 'AI-utkastet ska landa i granskningen, inte editorn').toContain('enterQuickReview()')
    expect(body, 'AI-vägen får aldrig sätta quickMode(null) som slutsteg').not.toContain('setQuickMode(null)')
  })

  test('Bygg själv-vägen: startBlankQuickDraft slutar i enterQuickReview', () => {
    const fn = PAGE.slice(PAGE.indexOf('function startBlankQuickDraft'))
    const body = fn.slice(0, fn.indexOf('\n  }'))
    expect(body, 'blankstarten ska landa i granskningen, inte editorn').toContain('enterQuickReview()')
    expect(body).not.toContain('setQuickMode(null)')
  })

  test('mallvägen: VARJE onSelectTemplate-hanterare kör enterQuickReview', () => {
    // Båda monteringsställena av QuoteNewStartChooser — ett mallval får
    // aldrig landa i den fullständiga editorn.
    const handlers = PAGE.match(/onSelectTemplate=\{[^}]*\}\}/g) || []
    expect(handlers.length, 'minst ett monteringsställe för mallväljaren').toBeGreaterThanOrEqual(1)
    for (const h of handlers) {
      expect(h, `mallval utan granskning: ${h}`).toContain('enterQuickReview()')
    }
  })
})

test.describe('intaget — tre riktiga knappar, inte en hjälte och två fotnoter', () => {
  test('Bygg själv är en riktig knapp (fix 2026-08-17), inte en fotnotlänk', () => {
    // Fotnotversionen var text-xs + underline. Knappversionen delar
    // sekundärknapparnas klassform. Låser att onSkipDescription sitter på
    // en knapp med sekundär-styling, inte en underline-länk.
    const skipIdx = INTAKE.indexOf('onClick={onSkipDescription}')
    expect(skipIdx, 'onSkipDescription-knappen finns').toBeGreaterThan(-1)
    const around = INTAKE.slice(skipIdx, skipIdx + 400)
    expect(around, 'ska vara en sekundärknapp, inte en fotnot').toContain('border-2 border-slate-200')
    expect(around).not.toContain('underline')
    expect(around).toContain('Bygg själv')
  })

  test('alla tre startetiketter finns i intaget', () => {
    expect(INTAKE).toContain('Bygg utkast')
    expect(INTAKE).toContain('Bygg själv')
    expect(INTAKE).toContain('Använd en mall')
  })
})

test.describe('vägen tillbaka från editorn', () => {
  test('tillbaka-knappen är INTE grindad på preferredStart (fix 2026-08-17)', () => {
    // Före fixen: preferredStart !== 'quick' && ... — vilket gjorde att
    // default-preferensens användare saknade väg tillbaka helt efter att
    // ha lämnat intaget. Nu: bara editor-läge + tom offert.
    const idx = PAGE.indexOf('Beskriv jobbet i stället')
    expect(idx, 'tillbaka-knappen finns').toBeGreaterThan(-1)
    const guard = PAGE.slice(Math.max(0, idx - 600), idx)
    expect(guard).toContain("quickMode === null && items.length === 0 && (")
    expect(guard, 'preferens-grinden är borttagen').not.toContain("preferredStart !== 'quick' &&")
  })
})
