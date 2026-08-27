/**
 * Facit för Etapp R — "Onboarding-wow: första uppdraget"
 * (tasks/jaunty-pondering-hummingbird.md). Källkodsskanning, browserlöst,
 * samma idiom som tests/reaktiverings-insikt.spec.ts / tests/onboarding-goals.spec.ts.
 *
 * ReaktiveringsInsikt-mönstret (setPendingPrompt+setActiveTab('chat')+
 * setIsOpen(true), aldrig auto-send) förutsätter JobbuddyProvider — som
 * bara finns i app/dashboard/layout.tsx, inte i onboardingens egen layout.
 * Beaten i Step6LiveTour kan därför inte anropa useJobbuddy() direkt: den
 * skriver i stället en väntande prompt till sessionStorage
 * (lib/onboarding/first-mission-handoff.ts), och
 * components/jarvis/FirstMissionHandoff.tsx (monterad i dashboard-layouten)
 * läser+nollar den en gång och kör då EXAKT ReaktiveringsInsikt-mekaniken.
 * Facit-sviten låser hela kedjan i tre delar, en fil per steg.
 *
 * Körs: npx playwright test tests/onboarding-first-mission.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { buildFirstMissionPrompt } from '../lib/onboarding/first-mission-handoff'

const ROOT = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

const step6 = read('app/onboarding/components/Step6LiveTour.tsx')
const handoffLib = read('lib/onboarding/first-mission-handoff.ts')
const handoffConsumer = read('components/jarvis/FirstMissionHandoff.tsx')
const dashboardLayout = read('app/dashboard/layout.tsx')
const uppdragsrad = read('components/jarvis/home/Uppdragsrad.tsx')

/** Normaliserar NBSP/narrow-NBSP (Intl.NumberFormat('sv-SE')) till vanligt mellanslag. */
const deNbsp = (s: string) => s.replace(/[  ]/g, ' ')

test.describe('Step6LiveTour.tsx — uppdragsbandets tooltip berättar kedjornas historia', () => {
  test('tooltip-texten innehåller nyckelfrasen om planbygget', () => {
    expect(step6).toContain('bygger teamet en plan ur dina egna siffror')
  })

  test('tour-steget refererar den riktiga ankarpunkten (uppdragsband)', () => {
    // Både id:t i TOUR_STEPS/TourTarget OCH kommentaren som pekar mot
    // components/jarvis/home/Uppdragsrad.tsx ska nämna ankaret.
    expect(step6).toContain("id: 'uppdragsband'")
    expect(step6).toContain('data-tour="uppdragsband"')
  })

  test('godkännande-stoppet är chefsramat — inget går ut utan hantverkarens ja', () => {
    const approveStep = step6.indexOf("id: 'approve'")
    expect(approveStep).toBeGreaterThan(-1)
    expect(step6.indexOf('Inget går ut utan ditt ja', approveStep)).toBeGreaterThan(approveStep)
  })
})

test.describe('Step6LiveTour.tsx — Första-uppdraget-beaten', () => {
  test('erbjuder knappen "Ge teamet ditt första uppdrag"', () => {
    expect(step6).toContain('Ge teamet ditt första uppdrag')
  })

  test('är skippbar — "Utforska själv" finns och kör samma onFinish', () => {
    expect(step6).toContain('Utforska själv')
  })

  test('ärlighetsregeln: copyn lovar aldrig ett färdigt facit, bara att teamet redan tittar', () => {
    expect(step6).toContain('ju mer data som kommer in, desto vassare förslag')
  })

  test('beaten skriver via handoff-bryggan, aldrig direkt setPendingPrompt/fetch-send i Step6', () => {
    // Step6LiveTour saknar JobbuddyProvider (se filhuvudkommentaren i
    // lib/onboarding/first-mission-handoff.ts) — den får ALDRIG anropa
    // setPendingPrompt eller useJobbuddy() själv.
    expect(step6).not.toContain('setPendingPrompt')
    expect(step6).not.toContain('useJobbuddy')
    expect(step6).toContain('writeFirstMissionPrompt(buildFirstMissionPrompt(')
  })

  test('inga send-/execute-mönster i filen (bara läsande instant-value-fetchen och den befintliga finalize-POST:en)', () => {
    const fetchCalls = Array.from(step6.matchAll(/fetch\(([^)]*)\)/g)).map(m => m[1])
    expect(fetchCalls.length).toBeGreaterThan(0)
    for (const call of fetchCalls) {
      expect(call).not.toMatch(/\/api\/(agent|jobbkompisen|jarvis)\//)
    }
  })
})

test.describe('lib/onboarding/first-mission-handoff.ts — handoff-bryggan', () => {
  test('buildFirstMissionPrompt: mål satt → sv-SE-formaterat belopp i frågan (NBSP-medvetet)', () => {
    const prompt = deNbsp(buildFirstMissionPrompt(1200000))
    expect(prompt).toContain('Vi siktar på 1 200 000 kr i år.')
    expect(prompt).toContain('Vad är det viktigaste vi kan göra den här veckan för att komma närmare?')
  })

  test('buildFirstMissionPrompt: inget mål (undefined/0/negativt) → generisk fråga, aldrig ett påhittat mål', () => {
    expect(buildFirstMissionPrompt(undefined)).toBe('Vad är det viktigaste vi kan göra den här veckan?')
    expect(buildFirstMissionPrompt(0)).toBe('Vad är det viktigaste vi kan göra den här veckan?')
    expect(buildFirstMissionPrompt(-500)).toBe('Vad är det viktigaste vi kan göra den här veckan?')
  })

  test('write/read är sessionStorage-baserat och konsumeras en gång (samma idiom som step2-draft.ts)', () => {
    expect(handoffLib).toContain('sessionStorage.setItem')
    expect(handoffLib).toContain('sessionStorage.getItem')
    expect(handoffLib).toContain('sessionStorage.removeItem')
  })
})

test.describe('components/jarvis/FirstMissionHandoff.tsx — konsumenten kör ReaktiveringsInsikt-mekaniken EXAKT', () => {
  test('läser+nollar via handoff-bryggan', () => {
    expect(handoffConsumer).toContain('readAndClearFirstMissionPrompt')
  })

  test('förifyller och öppnar chatten — aldrig auto-send', () => {
    expect(handoffConsumer).toContain('setPendingPrompt(prompt)')
    expect(handoffConsumer).toContain("setActiveTab('chat')")
    expect(handoffConsumer).toContain('setIsOpen(true)')
  })

  test('renderar ingenting (return null)', () => {
    expect(handoffConsumer).toContain('return null')
  })

  test('monterad i dashboard-layouten, inuti JobbuddyProvider', () => {
    const providerStart = dashboardLayout.indexOf('<JobbuddyProvider>')
    const providerEnd = dashboardLayout.indexOf('</JobbuddyProvider>')
    const mountIndex = dashboardLayout.indexOf('<FirstMissionHandoff')
    expect(providerStart).toBeGreaterThan(-1)
    expect(mountIndex).toBeGreaterThan(providerStart)
    expect(mountIndex).toBeLessThan(providerEnd)
  })
})

test.describe('components/jarvis/home/Uppdragsrad.tsx — stabilt ankare för turer', () => {
  test('roten i alla fyra lägen är märkt data-tour="uppdragsband"', () => {
    const matches = uppdragsrad.match(/data-tour=\{TOUR_ANCHOR\}/g) || []
    expect(matches.length).toBe(4)
    expect(uppdragsrad).toContain("const TOUR_ANCHOR = 'uppdragsband'")
  })
})

test.describe('Step6LiveTour — inga påhittade tal i mock-dashboarden (2026-08-27)', () => {
  const liveTour = fs.readFileSync(path.join(ROOT, 'app/onboarding/components/Step6LiveTour.tsx'), 'utf8')

  test('teambadgen och statrutan räknas ur TEAM — aldrig ett hårdkodat "5 aktiva"', () => {
    expect(liveTour).not.toMatch(/\d+ aktiva/)
    expect(liveTour).toContain('{teamRow.length} på plats')
    expect(liveTour).toContain("String(TEAM.length), 'i ditt team'")
  })

  test('setup-rutan är en mock av den riktiga Kom igång-railen — inget påhittat "2/5 klart" eller 40 %-stapel', () => {
    expect(liveTour).not.toContain('2/5')
    expect(liveTour).not.toContain("width: '40%'")
    expect(liveTour).not.toContain('Komplettera setup')
    expect(liveTour).toContain('Kom igång')
  })
})
