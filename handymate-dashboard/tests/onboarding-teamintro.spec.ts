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
    expect(s).toContain('svara kunderna rätt')
  })

  test('knappen är klickbar i ogiltigt läge och SÄGER vad som saknas', () => {
    const s = read(STEG3)
    // OBS: 'aria-disabled={!valid}' INNEHÅLLER textmässigt substrängen
    // 'disabled={!valid}' — en enkel .not.toContain träffar då sin egen
    // korrekta aria-variant. Kräv att 'disabled' inte föregås av 'aria-'.
    expect(s, 'disabled-knapp utan besked är tillbaka').not.toMatch(/(?<!aria-)disabled=\{!valid\}/)
    expect(s).toContain('aria-disabled={!valid}')
    expect(s).toContain('välj minst en specialitet')
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

  test('väntetexten säger reserverat — inte tilldelas-snurr', () => {
    const s = read(STEG4)
    expect(s).toContain('Ditt nummer är reserverat')
    expect(s).not.toContain('tilldelas just nu')
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
    expect(s).toContain("step.placement === 'top' ? { top: 60 } : { bottom: 24 }")
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
    const utvag = s.indexOf('Hoppa till start')
    const villkor = s.lastIndexOf('{!finished && (', utvag)
    expect(villkor, 'utvägen är gated bakom fel villkor').toBeGreaterThan(-1)
  })
})
