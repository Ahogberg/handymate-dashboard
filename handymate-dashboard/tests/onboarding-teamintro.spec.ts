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
  expect(read(STEG)).not.toContain('Svarar i telefonen')
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
    expect(s, 'disabled-knapp utan besked är tillbaka').not.toContain('disabled={!valid}')
    expect(s).toContain('aria-disabled={!valid}')
    expect(s).toContain('välj minst en specialitet')
    expect(s).toContain('markera minst en arbetsdag')
  })
})
