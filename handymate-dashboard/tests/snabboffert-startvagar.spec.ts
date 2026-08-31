/**
 * Snabboffertens startvägs-invariant (Andreas krav, låst 2026-08-17):
 *
 *   "Oavsett om man väljer att få utkast med AI, att skapa en ny själv
 *    eller med en sparad mall ska man ALLTID hamna i vår nya
 *    offertskapare."
 *
 * ═══ HISTORIK (Fas 1, offert-omtaget 2026-08-31) ═══
 *
 * Fram till 2026-08-31 betydde "vår nya offertskapare" en sektionsvis
 * tvingad granskningssekvens (`enterQuickReview()` → quickMode 'review'/
 * 'overview'). Den granskningen är borttagen — grundaren konstaterade att
 * den inte fungerade i praktiken. Invarianten själv består oförändrad
 * (alla tre starterna ska konvergera på EN plats, aldrig glida isär), bara
 * MÅLET bytte: alla tre landar nu direkt i den fulla canvas-editorn
 * (quickMode = null) via den delade `finishQuickStart()` — se
 * `app/dashboard/quotes/_shared/QuoteBuilder.tsx`. Det är alltså numera
 * HELT OK att slutsteget sätter quickMode till null, så länge det sker
 * via den delade funktionen och inte via en egen, parallell genväg per
 * startväg (vilket är precis vad testerna nedan låser).
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
  path.join(__dirname, '..', 'app', 'dashboard', 'quotes', '_shared', 'QuoteBuilder.tsx'),
  'utf8',
)
const INTAKE = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'dashboard', 'quotes', 'new', 'components', 'quick', 'QuickIntake.tsx'),
  'utf8',
)

test.describe('alla tre starterna landar i samma fulla editor', () => {
  test('AI-vägen: buildQuickDraft slutar i finishQuickStart', () => {
    const fn = PAGE.slice(PAGE.indexOf('async function buildQuickDraft'))
    const body = fn.slice(0, fn.indexOf('\n  }'))
    expect(body, 'AI-utkastet ska landa i editorn via den delade funktionen').toContain('finishQuickStart()')
    expect(body, 'AI-vägen får aldrig sätta quickMode(null) direkt, förbi den delade funktionen').not.toContain('setQuickMode(null)')
  })

  test('Bygg själv-vägen: startBlankQuickDraft slutar i finishQuickStart', () => {
    const fn = PAGE.slice(PAGE.indexOf('function startBlankQuickDraft'))
    const body = fn.slice(0, fn.indexOf('\n  }'))
    expect(body, 'blankstarten ska landa i editorn via den delade funktionen').toContain('finishQuickStart()')
    expect(body).not.toContain('setQuickMode(null)')
  })

  test('mallvägen: VARJE onSelectTemplate-hanterare kör finishQuickStart', () => {
    // Båda monteringsställena av QuoteNewStartChooser — ett mallval får
    // aldrig landa i editorn via en egen, parallell genväg.
    const handlers = PAGE.match(/onSelectTemplate=\{[^}]*\}\}/g) || []
    expect(handlers.length, 'minst ett monteringsställe för mallväljaren').toBeGreaterThanOrEqual(1)
    for (const h of handlers) {
      expect(h, `mallval utan den delade avslutningen: ${h}`).toContain('finishQuickStart()')
    }
  })

  test('finishQuickStart() finns bara en gång och landar i editorn', () => {
    // Den delade svansen ska bara definieras EN gång — annars kan mall-,
    // blank- och AI-vägarna glida isär från varandra igen.
    const defs = PAGE.match(/function finishQuickStart\(\)/g) || []
    expect(defs.length, 'finishQuickStart ska definieras exakt en gång').toBe(1)
    const fn = PAGE.slice(PAGE.indexOf('function finishQuickStart()'))
    const body = fn.slice(0, fn.indexOf('\n  }'))
    expect(body).toContain('setQuickMode(null)')
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
