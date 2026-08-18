/**
 * Facit för Hemturen (2026-08-13, docs/design/FORSTA-30-MINUTERNA.md DEL 3).
 *
 * Ren källskanning — samma stil som tests/onboarding-teamintro.spec.ts och
 * tests/jarvis-hem.spec.ts. Ingen browser/session krävs:
 *
 *   npx playwright test tests/hemtur.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const HEMTUR = 'components/tour/HemTur.tsx'
const HEM = 'components/jarvis/JarvisHome.tsx'
const PRIMITIVES = 'components/tour/TourPrimitives.tsx'

test.describe('grinden — welcome_tour_seen + localStorage, dubbelt skydd', () => {
  test('turen läser business.welcome_tour_seen ur kontexten', () => {
    const s = read(HEMTUR)
    expect(s).toContain('business.welcome_tour_seen')
    expect(s).toContain("import { useBusiness } from '@/lib/BusinessContext'")
  })

  test('BusinessContext och useAuth exponerar fältet — annars vore gaten död kod', () => {
    const ctx = read('lib/BusinessContext.tsx')
    expect(ctx).toContain('welcome_tour_seen')
    const auth = read('lib/useAuth.ts')
    expect(auth).toContain('welcome_tour_seen')
    const route = read('app/api/auth/route.ts')
    // "check"-svaret måste faktiskt skicka fältet vidare — annars är typen
    // en lögn och business.welcome_tour_seen är alltid undefined i klienten.
    expect(route).toContain('welcome_tour_seen: business.welcome_tour_seen')
  })

  test('localStorage-nyckeln hm_hemtur_klar är det andra skyddet', () => {
    const s = read(HEMTUR)
    expect(s).toContain("SEEN_KEY = 'hm_hemtur_klar'")
    expect(s).toContain('localStorage.getItem(SEEN_KEY)')
    expect(s).toContain('localStorage.setItem(SEEN_KEY')
  })

  test('trasig localStorage failar STÄNGT (ingen tur) — inte öppet', () => {
    // Gaten sitter i en try/catch där catch-grenen returnerar utan att sätta
    // active — annars kunde en blockerad localStorage (privat läge, gamla
    // Safari) ge en tur som aldrig kan komma ihåg att den visats.
    const s = read(HEMTUR)
    const gate = s.slice(s.indexOf('GRINDEN'), s.indexOf('Karins krona-fynd'))
    expect(gate).toContain('catch {')
    expect(gate, 'catch-grenen ska returnera utan att aktivera turen').toContain('return')
  })

  test('onboardingens Step6-förhandsvisning skriver INTE längre welcome_tour_seen', () => {
    // Regression: fanns tidigare i app/onboarding/page.tsx:finish() och
    // gatade bort Hemturen INNAN den ens hunnit visas en enda gång — kolumnen
    // var redan satt när kunden landade på /dashboard. Hemturen är nu ensam
    // ägare av skrivningen.
    const s = read('app/onboarding/page.tsx')
    expect(s, 'onboardingens finish() skriver welcome_tour_seen igen — Hemturen kan aldrig triggas')
      .not.toContain("config: { welcome_tour_seen")
  })
})

test.describe('fem stopp, tre möjliga att auto-hoppa', () => {
  test('exakt fem BASE_STEPS, ett per data-tour-target', () => {
    const s = read(HEMTUR)
    const arrStart = s.indexOf('const BASE_STEPS')
    const arrEnd = s.indexOf('function markSeenOnServer')
    expect(arrStart).toBeGreaterThan(-1)
    const arr = s.slice(arrStart, arrEnd)
    const ids = arr.match(/id: '([a-z-]+)'/g) || []
    expect(ids).toHaveLength(5)
    // Ordning reviderad 2026-08-18: pengar-stoppet EFTER team-stoppet —
    // turen följer sidans verkliga ordning (sektionen flyttades ned).
    expect(ids.map(m => m.replace(/id: '|'/g, ''))).toEqual([
      'hemtur-attn', 'hemtur-team', 'hemtur-pengar', 'hemtur-mote', 'hemtur-skriv',
    ])
  })

  test('varje stopp letar upp sin riktiga DOM-nod via samma attribut det deklarerar', () => {
    const s = read(HEMTUR)
    expect(s).toContain('document.querySelector<HTMLElement>(`[data-tour-target="${step.id}"]`)')
  })

  test('saknad target hoppas över automatiskt — turen spotlightar aldrig tomhet', () => {
    const s = read(HEMTUR)
    const measure = s.slice(s.indexOf('MÄT/LETA UPP'), s.indexOf('SÄKERHETSNÄTET'))
    expect(measure).toContain('if (!el) {')
    expect(measure).toContain('setStepIndex(i => i + 1)')
  })

  test('alla fem targets finns märkta i JarvisHome (eller vidarebefordras av SkrivRad/RailCard)', () => {
    const hem = read(HEM)
    expect(hem).toContain('data-tour-target="hemtur-attn"')
    expect(hem).toContain('data-tour-target="hemtur-pengar"')
    expect(hem).toContain('data-tour-target="hemtur-team"')
    expect(hem).toContain('tourTarget="hemtur-mote"')
    expect(hem).toContain('tourTarget="hemtur-skriv"')

    const railcard = read('components/jarvis/RailCard.tsx')
    expect(railcard).toContain('data-tour-target={tourTarget}')
    const skrivrad = read('components/jarvis/SkrivRad.tsx')
    expect(skrivrad).toContain('data-tour-target={tourTarget}')
  })

  test('pengar-stoppet återanvänder onboardingens instant-value-rutt, fail-safe till generisk text', () => {
    const s = read(HEMTUR)
    expect(s).toContain("fetch('/api/onboarding/instant-value')")
    expect(s).toContain('json?.headline?.text')
    // Fallback-kroppen i BASE_STEPS ska inte vara tom — annars visas
    // ingenting om ägargrinden (403) slår till.
    const base = s.slice(s.indexOf("id: 'hemtur-pengar'"), s.indexOf("id: 'hemtur-mote'"))
    expect(base).toMatch(/body: '.+'/)
  })
})

test.describe('turen kan aldrig hålla någon fången (B7-mönstret)', () => {
  test('5 s-säkerhetsnätet tvingar fram avslut om ingen target hittades', () => {
    const s = read(HEMTUR)
    expect(s).toContain('HANG_TIMEOUT_MS = 5000')
    const net = s.slice(s.indexOf('SÄKERHETSNÄTET'), s.indexOf('if (!active || stepIndex'))
    expect(net).toContain('if (!foundRef.current) finish()')
  })

  test('Hoppa över finns på varje stopp (SpotlightOverlay, delad med Step6)', () => {
    const s = read(PRIMITIVES)
    expect(s).toContain('Hoppa över')
    expect(s).toContain('onClick={onSkip}')
    const hemtur = read(HEMTUR)
    expect(hemtur).toContain('onSkip={finish}')
  })
})

test.describe('avslut skriver flaggan — fire-and-forget mot befintlig rutt', () => {
  test('PUT /api/onboarding med den whitelistade config-formen', () => {
    const s = read(HEMTUR)
    expect(s).toContain("fetch('/api/onboarding', {")
    expect(s).toContain("method: 'PUT'")
    expect(s).toContain('config: { welcome_tour_seen: new Date().toISOString() }')
    // Fire-and-forget: ett fel i skrivningen får aldrig kasta upp i UI:t.
    expect(s).toContain('.catch(() => {')
  })

  test('den whitelistade kolumnen finns kvar i PUT-ruttens ALLOWED_COLUMNS', () => {
    const route = read('app/api/onboarding/route.ts')
    expect(route).toContain("'welcome_tour_seen'")
  })

  test('localStorage sätts INNAN nätverksanropet — turen kommer aldrig igen ens vid serverfel', () => {
    const s = read(HEMTUR)
    const finishFn = s.slice(s.indexOf('function finish()'), s.indexOf('function next()'))
    const localIdx = finishFn.indexOf('localStorage.setItem')
    const serverIdx = finishFn.indexOf('markSeenOnServer()')
    expect(localIdx).toBeGreaterThan(-1)
    expect(serverIdx).toBeGreaterThan(-1)
    expect(localIdx).toBeLessThan(serverIdx)
  })
})

test.describe('monterad i JarvisHome', () => {
  test('HemTur importeras och renderas', () => {
    const hem = read(HEM)
    expect(hem).toContain("import HemTur from '@/components/tour/HemTur'")
    expect(hem).toContain('<HemTur />')
  })
})

test.describe('kedjningen (Company Scan, tasks/jaunty-pondering-hummingbird.md) bryter inte turens egna gates', () => {
  test('HemTur.tsx är helt orört — egen grind (welcome_tour_seen + hm_hemtur_klar), egen flaggskrivning', () => {
    // Regression: kedjningen ska vara ADDITIV (JarvisHome väntar med att
    // rendera <HemTur /> tills skannen stängts) — den ska INTE ha flyttat
    // in i eller ersatt HemTur:s egen gate-logik. Samma påståenden som
    // testerna ovan bevisar redan detta, men skrivs ut explicit här så en
    // framtida ändring som smyger bort HemTur:s gate fångas direkt.
    const s = read(HEMTUR)
    expect(s).toContain('business.welcome_tour_seen')
    expect(s).toContain("SEEN_KEY = 'hm_hemtur_klar'")
    expect(s).toContain("config: { welcome_tour_seen: new Date().toISOString() }")
  })

  test('JarvisHome väntar med HemTur tills CompanyScan stängts — HemTur renderas villkorat, inte ovillkorat', () => {
    const hem = read(HEM)
    expect(hem).toContain('const [scanKlar, setScanKlar] = useState(false)')
    expect(hem).toContain('{scanKlar && <HemTur />}')
    // CompanyScan står FÖRE i JSX-trädet — det är hela kedjningen.
    const scanIdx = hem.indexOf('<CompanyScan onClose=')
    const hemturIdx = hem.indexOf('{scanKlar && <HemTur />}')
    expect(scanIdx).toBeGreaterThan(-1)
    expect(scanIdx).toBeLessThan(hemturIdx)
  })

  test('CompanyScan.tsx skriver ALDRIG welcome_tour_seen — Hemturen är ensam ägare av den flaggan', () => {
    const scan = read('components/tour/CompanyScan.tsx')
    expect(scan).not.toContain("config: { welcome_tour_seen")
  })
})
