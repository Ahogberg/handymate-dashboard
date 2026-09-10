import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

// Facit för demons onboardingfälla (2026-09-10, Andreas).
//
// "Visa onboardingen" i PresenterBar kör POST /api/admin/demo-onboarding-replay,
// som avsiktligt sätter onboarding_completed_at = NULL och onboarding_step = 1.
// Sedan satt presentatören fast:
//
//   - Dashboardgrinden kräver completed_at ELLER onboarding_step >= 9 och
//     skickar annars vidare till /onboarding.
//   - PresenterBar renderas BARA i app/dashboard/layout.tsx. Knappen som tog
//     dig till guiden fanns alltså inte kvar när du var där.
//   - "← Lämna guiden" leder till /, och därifrån tillbaka till /dashboard →
//     /onboarding. En rundgång, inte en utgång.
//
// Enda vägen tillbaka var att klicka igenom hela guiden. Mot produktionsdatan
// stod demokontot parkerat i exakt det läget (steg 2) med 90 godkännandekort
// och 146 notiser bakom grinden.
//
// Provet vaktar FÄLLAN, inte bara att rutten finns: replayen måste ha en
// spegelbild, spegelbilden måste yta sig PÅ onboardingsidan, och grinden får
// aldrig bli svagare än replayens.

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

const RUTT = 'app/api/admin/demo-onboarding-exit/route.ts'
const REPLAY = 'app/api/admin/demo-onboarding-replay/route.ts'

test('replayen har en spegelbild som återställer det grinden kräver', () => {
  const src = read(RUTT)
  // Dashboardgrinden: completed_at ELLER step >= 9. Utgången måste sätta
  // något som uppfyller den, annars är den bara en omdirigering tillbaka hit.
  expect(src, 'sätter inte onboarding_step').toMatch(/onboarding_step:\s*10/)
  expect(src, 'sätter inte onboarding_completed_at').toContain('onboarding_completed_at')

  const grind = read('app/dashboard/layout.tsx')
  const villkor = grind.match(/const onboardingDone = ([^\n]+)/)
  expect(villkor, 'hittade inte dashboardgrinden — har den bytt form?').toBeTruthy()
  expect(villkor![1], 'grinden ser inte längre på step >= 9').toContain('>= 9')
})

test('utgången är grindad exakt som replayen — aldrig svagare', () => {
  const utgang = read(RUTT)
  const replay = read(REPLAY)
  // Samma tre lås som replayen och demo-reset: inloggad, DEMO_BUSINESS_ID,
  // owner/admin. Ett demokonto-verktyg får inte gå att nå från ett riktigt
  // konto, och inte av en anställd.
  for (const las of ['getAuthenticatedBusiness', 'process.env.DEMO_BUSINESS_ID', 'isOwnerOrAdmin']) {
    expect(utgang, `utgången saknar ${las}`).toContain(las)
    expect(replay, `replayen saknar ${las} — jämförelsen är meningslös`).toContain(las)
  }
  // Saknas DEMO_BUSINESS_ID i miljön ska den neka, inte släppa igenom.
  expect(utgang).toMatch(/!demoBusinessId \|\| business\.business_id !== demoBusinessId/)
})

test('GET:en avgörs av servern och faller till "visa inte"', () => {
  const src = read(RUTT)
  // Onboardingsidan ligger utanför BusinessProvider, så klienten kan inte
  // avgöra det här. Samma lärdom som pushstatusen samma dag: vet vi inte,
  // säger vi nej.
  expect(src).toMatch(/export async function GET/)
  expect(src, 'GET:en returnerar inte visa-fältet ur grinden').toMatch(/visa: g\.ok/)
  // En riktig kund på onboardingen gör inget fel genom att fråga.
  const getKropp = src.slice(src.indexOf('export async function GET'))
  expect(getKropp.slice(0, 300), 'GET:en svarar med felstatus i stället för visa:false').not.toMatch(/status:\s*40[13]/)
})

test('rutten är aldrig statisk — svaret avgör om en knapp visas', () => {
  // Utan force-dynamic kan första svaret efter deploy serveras till ALLA
  // företag (CLAUDE.md, svepet 2026-08-22). Här hade det yttrat sig som en
  // demoknapp hos en riktig kund.
  expect(read(RUTT)).toContain("export const dynamic = 'force-dynamic'")
})

test('knappen ytas PÅ onboardingsidan, inte i dashboarden', () => {
  // Hela felet var att PresenterBar bara finns i dashboardens layout.
  const layout = read('app/onboarding/layout.tsx')
  // Måste vara RENDERAD, inte bara importerad. Ett tidigare utkast av det här
  // provet nöjde sig med strängen 'DemoTillbakaKnapp', som importraden ensam
  // uppfyller — mutationen "ta bort <DemoTillbakaKnapp /> ur navet" passerade.
  expect(layout, 'utgången importeras men renderas inte').toMatch(/<DemoTillbakaKnapp\s*\/>/)
  // Och den ska ligga i utgångsnavet, inte någonstans längre ner på sidan.
  const navBlock = layout.slice(layout.indexOf('<nav className="ob-exit-nav"'), layout.indexOf('</nav>'))
  expect(navBlock, 'utgången ligger utanför utgångsnavet').toMatch(/<DemoTillbakaKnapp\s*\/>/)

  const presenter = read('app/dashboard/layout.tsx')
  expect(presenter, 'PresenterBar har flyttat — då kan det här provet vara inaktuellt').toContain('PresenterBar')
})

test('klienten gissar inte fram knappen', () => {
  const src = read('components/demo/DemoTillbakaKnapp.tsx')
  // Ingen NEXT_PUBLIC-flagga som beslutsunderlag: det är ett klientvärde och
  // säger ingenting om rollen. Servern äger beslutet.
  expect(src, 'komponenten avgör själv om den ska visas').not.toContain('NEXT_PUBLIC_DEMO_BUSINESS_ID')
  expect(src).toMatch(/data\?\.visa === true/)
  // Fel i uppslaget ska ge INGEN knapp, aldrig en synlig.
  const effekt = src.slice(src.indexOf('useEffect'), src.indexOf('if (!visa)'))
  expect(effekt, 'ett misslyckat uppslag måste landa i visa=false').toContain('.catch(')
  expect(src).toMatch(/if \(!visa\) return null/)
})

test('navigeringen efter återställningen är en hel omladdning', () => {
  // En mjuk router.push kan hinna läsa det gamla onboardingläget i
  // dashboardens provider och skicka tillbaka till guiden — alltså exakt
  // fällan igen, men svårare att förstå.
  const src = read('components/demo/DemoTillbakaKnapp.tsx')
  expect(src).toContain("window.location.assign('/dashboard')")
  expect(src, 'en mjuk navigering kan se det gamla läget').not.toMatch(/router\.push\(['"]\/dashboard/)
})

test('utgången rör inte det replayen äger', () => {
  const src = read(RUTT)
  // onboarding_data ska förbli förifylld (replayen lämnar den orörd), och
  // Fortnox-simläget ägs av demo-fortnox-sim. En halv återställning här hade
  // gjort "Återställ demon" otillförlitlig.
  const uppdatering = src.slice(src.indexOf('.update({'), src.indexOf('.eq(\'business_id\''))
  expect(uppdatering, 'utgången rör onboarding_data').not.toContain('onboarding_data')
  expect(uppdatering, 'utgången rör Fortnox-simläget').not.toContain('fortnox_')
})
