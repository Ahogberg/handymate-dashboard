/**
 * Facit för onboardingens teamintro (2026-08-09, B7-genomgångens fynd).
 *
 * Två fel: Matte — den man faktiskt pratar med (Jarvis-first) — saknades i
 * introt, och desktop visade sex agenter i ett telefonformat-kort med inre
 * scroll där halva teamet var osynligt.
 *
 *   npx playwright test tests/onboarding-teamintro.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const STEG = 'app/onboarding/components/Step1MeetTheTeam.tsx'

test('Matte finns och leder reveal-ordningen', () => {
  const s = read(STEG)
  expect(s).toContain("REVEAL_ORDER = ['matte', 'lisa', 'karin', 'daniel', 'lars', 'hanna']")
  expect(s).toContain('matte: {')
})

test('copyn räknar rätt — Matte och fem specialister', () => {
  const s = read(STEG)
  expect(s).toContain('Matte och fem specialister')
  expect(s, 'gamla femman är kvar').not.toContain('Fem medarbetare.')
})

test('desktop får två kolumner; mobilen behåller stapeln', () => {
  const s = read(STEG)
  expect(s).toContain("gridTemplateColumns: '1fr 1fr'")
})

test('breda kortet gäller BARA teamsteget', () => {
  const page = read('app/onboarding/page.tsx')
  expect(page).toContain("data-wide={step === 0 ? 'true' : undefined}")
  const css = read('app/onboarding/onboarding.css')
  expect(css).toContain(".ob-card-wrap[data-wide='true']")
  // Bredden bor i en media query — mobilen påverkas inte alls.
  const wideIdx = css.indexOf(".ob-card-wrap[data-wide='true']")
  const mediaIdx = css.lastIndexOf('@media (min-width: 768px)', wideIdx)
  expect(mediaIdx, 'breda varianten ligger utanför desktop-median').toBeGreaterThan(-1)
})

test('Lisas förbjudna copy är fortfarande borta', () => {
  // "Svarar i telefonen" låter som talande röst-AI — produkten har ingen.
  // Regeln gäller faktisk UI-copy — inte en kommentar som FÖRKLARAR förbudet
  // (filen har en sådan: "OBS Lisa: 'Svarar i telefonen' är FÖRBJUDEN copy…").
  // Samma mönster som steg 3-specen nedan: rensa bort kommentarer innan vi mäter.
  const utanKommentarer = read(STEG)
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  expect(utanKommentarer).not.toContain('Svarar i telefonen')
})

test.describe('fältvakten och spärren är samma sanning (B7-fyndet)', () => {
  test('saknade-fält-listan använder checkOrgNumber — inte en egen längdkoll', () => {
    const s = read('app/onboarding/components/Step2Business.tsx')
    const fn = s.slice(s.indexOf('const missing: string[] = []'), s.indexOf('return missing'))
    expect(fn).toContain('checkOrgNumber(data.orgNumber).valid')
    expect(fn, 'längdkollen är kvar som egen sanning').not.toContain("length !== 11")
    // Fel kontrollsiffra vid rätt längd får ett EGET besked — det var
    // exakt det läget som gav "0 fält saknas" på en död knapp.
    expect(fn).toContain('kontrollsiffran stämmer inte')
  })
})

test.describe('steg 3 — inga döda knappar, ingen röst-copy', () => {
  const STEG3 = 'app/onboarding/components/Step3HowYouWork.tsx'

  test('"svara rätt i telefonen" är borta — Lisa har ingen röst', () => {
    const s = read(STEG3)
    expect(s.replace(/^\s*\{\/\*[\s\S]*?\*\/\}/gm, '')).not.toContain('svara rätt i telefonen')
    // Repin 2026-09-07: 5a01bfc0 (PR #14) bytte ingressen till jobbtyper →
    // offertunderlag. Fortfarande ingen röst-copy; den nya ingressen pinnas
    // så att en återinförd "svara rätt i telefonen"-formulering inte kan
    // smyga in via en tom/omskriven ob-sub.
    expect(s).toContain('Dina jobbtyper följer med till nya affärer och hjälper oss att förbereda rätt offertunderlag.')
  })

  test('knappen är klickbar i ogiltigt läge och SÄGER vad som saknas', () => {
    const s = read(STEG3)
    // OBS: 'aria-disabled={!valid}' INNEHÅLLER textmässigt substrängen
    // 'disabled={!valid}' — en enkel .not.toContain träffar då sin egen
    // korrekta aria-variant. Kräv att 'disabled' inte föregås av 'aria-'.
    expect(s, 'disabled-knapp utan besked är tillbaka').not.toMatch(/(?<!aria-)disabled=\{!valid\}/)
    expect(s).toContain('aria-disabled={!valid}')
    // Repin 2026-09-07: 5a01bfc0 (PR #14) — specialitet heter jobbtyp; beskedet
    // säger fortfarande exakt vad som saknas.
    expect(s).toContain('välj minst en jobbtyp')
    expect(s).toContain('markera minst en arbetsdag')
  })
})

test.describe('steg 4 — numret: synligt, ärligt, begripligt', () => {
  const STEG4 = 'app/onboarding/components/Step4PhoneNumber.tsx'

  test('overflow-klippet är borta — Kolla igen-knappen syns', () => {
    const s = read(STEG4)
    const kort = s.slice(s.indexOf('Reveal card'), s.indexOf("phase === 'reserving'"))
    expect(kort).not.toContain("overflow: 'hidden'")
  })

  test('misslyckad reservation lovar inte ett nummer eller bakgrundsaktivering (F15)', () => {
    const s = read(STEG4)
    const pending = s.slice(s.indexOf("phase === 'pending' ? ("), s.indexOf("animation: 'ob-pop-in", s.indexOf("phase === 'pending' ? (")))
    expect(pending).toContain('Inget nummer har kunnat tilldelas ännu')
    expect(pending).toContain('fungerar först när ett nummer har tilldelats')
    expect(pending).toContain('Försök tilldela nummer igen')
    expect(pending).not.toContain('Ditt nummer är reserverat')
    expect(pending).not.toContain('aktiveras i bakgrunden')
  })

  test('valen förklarar vad som händer med kundens nummer', () => {
    const s = read(STEG4)
    expect(s).toContain('Kunder ringer ditt vanliga nummer som idag')
    expect(s).toContain('ditt privata nummer förblir privat')
  })
})

test.describe('rundturen — tipset täcker inte sitt eget motiv', () => {
  test('varje toursteg bär en placering och kortet läser den', () => {
    const s = read('app/onboarding/components/Step6LiveTour.tsx')
    // Antalet toursteg är INTE invarianten — TourStep-typen deklarerar också
    // "placement: 'top' | 'bottom'" och den unionen matchar samma regex, så
    // en hårdkodad totalsumma över hela filen räknar med typdefinitionen som
    // om den vore ett femte steg (stale facit). Den egentliga regeln: varje
    // objekt i TOUR_STEPS-arrayen (identifierat via "id:") ska bära exakt en
    // placering — isolera därför arrayen innan vi räknar.
    const arrStart = s.indexOf('const TOUR_STEPS')
    const arrEnd = s.indexOf('export default function Step6LiveTour')
    expect(arrStart, 'TOUR_STEPS hittades inte').toBeGreaterThan(-1)
    const arr = s.slice(arrStart, arrEnd)
    const stegCount = (arr.match(/id: '/g) || []).length
    const placeringCount = (arr.match(/placement: '(top|bottom)'/g) || []).length
    expect(placeringCount, 'varje toursteg-objekt måste bära en placering').toBe(stegCount)
    // Placeringslogiken (kortet på motsatt sida om spotlighten) lyftes ur
    // Step6 till components/tour/TourPrimitives.tsx (2026-08-13) — Step6
    // importerar SpotlightOverlay därifrån i stället för att äga logiken
    // själv, se docs/design/FORSTA-30-MINUTERNA.md DEL 1.
    expect(s, 'Step6 ska importera den delade rundtursmekaniken, inte äga en egen kopia')
      .toContain("import { TourTarget, SpotlightOverlay, type TourStepBase } from '@/components/tour/TourPrimitives'")
    const primitives = read('components/tour/TourPrimitives.tsx')
    expect(primitives).toContain("step.placement === 'top' ? { top: 60 } : { bottom: 24 }")
    // Matte-knappen bor nere till höger — dess tips får ALDRIG ligga i botten.
    const matte = arr.slice(arr.indexOf("id: 'matte'"), arr.indexOf("id: 'approve'"))
    expect(matte).toContain("placement: 'top'")
  })
})

test.describe('touren kan aldrig hålla någon fången (B7-fyndet: evighetsloopen)', () => {
  test('säkerhetsnätet tvingar fram avslutat läge om statet hänger', () => {
    const s = read('app/onboarding/components/Step6LiveTour.tsx')
    expect(s).toContain("setTourStep(s => (s === -1 ? -2 : s)), 5000")
  })

  test('en ständig utväg finns under hela turen', () => {
    const s = read('app/onboarding/components/Step6LiveTour.tsx')
    expect(s).toContain('Hoppa till start')
    // Utvägen renderas när touren INTE är klar — motsatt villkor mot CTA:n.
    // Repin 2026-09-07: c7c33661 (PR #13, mobil) gömmer knappen bara medan
    // välkomst-toasten ligger över samma hörn. Toasten släcks av en
    // OVILLKORLIG timer (2,8 s) — den kan aldrig bli permanent, så utvägen
    // finns under hela turen; säkerhetsnätet på 5 s ovan är kvar orört.
    const utvag = s.indexOf('Hoppa till start')
    const villkor = s.lastIndexOf('{!finished && !showToast && (', utvag)
    expect(villkor, 'utvägen är gated bakom fel villkor').toBeGreaterThan(-1)
    expect(s, 'toasten måste släckas av en timer, annars gömmer den utvägen för alltid')
      .toContain('setTimeout(() => setShowToast(false), 2800)')
  })
})
