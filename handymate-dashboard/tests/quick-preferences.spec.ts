/**
 * Facit-tester för Snabboffertens inlärning (etapp D, 2026-08-06).
 *
 * Trösklarna är rena funktioner just för att de ska gå att pröva utan
 * webbläsare — och för att de är lätta att få fel på ett sätt ingen märker:
 * en off-by-one på skip-tröskeln gör bara att sekvensen försvinner en offert
 * för tidigt, vilket ser ut som en slump snarare än som en bugg.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/quick-preferences.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  shouldSkipSequence,
  shouldAskPreferred,
  SKIP_SEQUENCE_AFTER,
  ASK_PREFERRED_AFTER,
} from '../lib/quotes/quick-preferences'

test.describe('när sekvensen slutar vara startläget', () => {
  test('de första fyra offerterna får hela sekvensen', () => {
    for (let i = 0; i < SKIP_SEQUENCE_AFTER; i++) {
      expect(shouldSkipSequence(i), `efter ${i} offerter`).toBe(false)
    }
  })

  test('femte offerten landar i översikten', () => {
    expect(shouldSkipSequence(SKIP_SEQUENCE_AFTER)).toBe(true)
  })

  test('och alla därefter', () => {
    expect(shouldSkipSequence(40)).toBe(true)
  })

  test('en trasig eller nollställd räknare ger sekvensen, inte översikten', () => {
    // Fail-soft-riktningen spelar roll: en ny användare som får översikten
    // direkt har aldrig sett granskningen och vet inte att den finns.
    expect(shouldSkipSequence(0)).toBe(false)
  })
})

test.describe('frågan om standardväg ställs EN gång', () => {
  test('ställs exakt vid tröskeln', () => {
    expect(shouldAskPreferred(ASK_PREFERRED_AFTER, false)).toBe(true)
  })

  test('inte före', () => {
    expect(shouldAskPreferred(ASK_PREFERRED_AFTER - 1, false)).toBe(false)
  })

  test('inte efter — annars tjatar den tills någon svarar', () => {
    // Med >= i stället för === hade frågan kommit tillbaka varje gång, vilket
    // är precis den sortens tjat som får folk att sluta läsa dialoger.
    expect(shouldAskPreferred(ASK_PREFERRED_AFTER + 1, false)).toBe(false)
    expect(shouldAskPreferred(99, false)).toBe(false)
  })

  test('aldrig om den redan ställts', () => {
    expect(shouldAskPreferred(ASK_PREFERRED_AFTER, true)).toBe(false)
  })
})

test.describe('trösklarna hänger ihop', () => {
  test('frågan kommer FÖRE sekvensen slutar visas', () => {
    // Annars hade vi frågat "vill du alltid börja så här?" om ett flöde
    // hantverkaren redan slutat se.
    expect(ASK_PREFERRED_AFTER).toBeLessThan(SKIP_SEQUENCE_AFTER)
  })
})
