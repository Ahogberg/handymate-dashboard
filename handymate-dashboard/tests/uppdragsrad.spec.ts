/**
 * FACIT — components/jarvis/home/Uppdragsrad.tsx (Goal-to-Plan V1, Etapp C,
 * tasks/jaunty-pondering-hummingbird.md).
 *
 * Källkodsskanning, samma idiom som tests/reaktiverings-insikt.spec.ts:
 * raden handoffar in i Matte-chatten (setPendingPrompt), har aldrig en
 * egen godkänn/avvisa-mekanism, och lägger ALDRIG ihop klassernas belopp
 * till en gemensam siffra (ingen reduce( över klassbelopp — se
 * progressParts, som bygger en LISTA av delar, punktseparerad).
 *
 * Körs: npx playwright test tests/uppdragsrad.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'jarvis', 'home', 'Uppdragsrad.tsx'),
  'utf8',
)

test.describe('Uppdragsrad.tsx — startsidans andra fråga', () => {
  test('rubriken "Vad vill du att vi får gjort?" finns', () => {
    expect(src).toContain('Vad vill du att vi får gjort?')
  })

  test('chip/pill-klick förifyller via setPendingPrompt (Jobbkompisens handoff-mekanism)', () => {
    expect(src).toContain('setPendingPrompt')
  })

  test('öppnar chatten via setActiveTab + setIsOpen (samma mönster som ReaktiveringsInsikt)', () => {
    expect(src).toContain('setActiveTab')
    expect(src).toContain('setIsOpen')
  })

  test('innehåller inte de vanliga beslutsknapparnas etiketter', () => {
    expect(src).not.toContain('Godkänn')
    expect(src).not.toContain('Skicka')
    expect(src).not.toContain('Avvisa')
  })

  test('lägger aldrig ihop klassbelopp — ingen reduce( i filen', () => {
    expect(src).not.toContain('reduce(')
  })

  test('progressdelarna radas upp punktseparerat (join med \' · \'), inte hopslagna', () => {
    expect(src).toContain("' · '")
  })

  test('aktivt-uppdrag-raden visar rubriken "Uppdrag:" och en öppna-länk', () => {
    expect(src).toContain('Uppdrag:')
    expect(src).toContain('Öppna')
  })

  test('den signal-lösa pillen erbjuder en öppen text, inte ett påhittat förslag', () => {
    expect(src).toContain('Skriv vad du vill uppnå')
  })
})
