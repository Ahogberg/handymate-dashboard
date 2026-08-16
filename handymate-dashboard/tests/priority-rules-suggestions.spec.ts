/**
 * Facit för föreslagna startprinciper i PriorityRulesSection
 * (app/dashboard/settings/page.tsx, 2026-08-16→17 natt — se tasks/todo.md
 * "NBA-prioriteringsprinciper ur Christoffers intervju"). Ingen
 * @testing-library/react/jsdom finns i det här repot (samma disciplin som
 * tests/next-best-action.spec.ts) — facit källskannar den renderade
 * komponentens källkod i stället för att mounta den. Det här verifierar
 * ÄRLIGHETSKRAVET: en klickning på ett förslagschip måste gå genom exakt
 * samma POST-väg som en manuellt skriven+skickad princip — ingen egen
 * insert-väg, ingen bakgrundsseedning.
 *
 *   npx playwright test tests/priority-rules-suggestions.spec.ts --no-deps --project=chromium
 */
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'

const ROOT = path.resolve(__dirname, '..')
const SOURCE = fs.readFileSync(path.join(ROOT, 'app/dashboard/settings/page.tsx'), 'utf8')

// Isolerar SUGGESTED_PRIORITY_RULES-konstanten + hela PriorityRulesSection
// (nästa funktion i filen är PreferencesTab) så assertions inte råkar
// träffa den strukturellt lika, men separata, BusinessRulesSection ovanför.
const startIdx = SOURCE.indexOf('const SUGGESTED_PRIORITY_RULES = [')
const endIdx = SOURCE.indexOf('\nfunction PreferencesTab')
if (startIdx === -1 || endIdx === -1) {
  throw new Error('Kunde inte hitta SUGGESTED_PRIORITY_RULES/PriorityRulesSection i settings/page.tsx — har koden flyttats?')
}
const BLOCK = SOURCE.slice(startIdx, endIdx)

const SUGGESTED_TEXTS = [
  'En stor obesvarad offert som kunden visat intresse för väger tyngre än en enskild sen påminnelse, om beloppet är klart större.',
  'Om något imorgon kräver ett beslut innan arbetet kan fortsätta ute hos kund, gör det före sådant utan lika hård tidsgräns.',
  'Enkla, redan färdiga åtgärder skickas direkt — det frigör tid till det som kräver mer eftertanke.',
  'En stor offert som riskerar gå till en konkurrent efter flera dagars tystnad prioriteras högt.',
]

test.describe('PriorityRulesSection — föreslagna startprinciper', () => {
  test('alla fyra exakta chip-texter ur tasks/todo.md finns i konstanten', () => {
    for (const text of SUGGESTED_TEXTS) {
      expect(BLOCK).toContain(text)
    }
  })

  test('chipsen renderas bara när rules.length === 0 (efter att loading är klar)', () => {
    expect(BLOCK).toContain('!loading && rules.length === 0')
  })

  test('rubriken "Förslag att komma igång" finns ovanför chipsen', () => {
    const heading = BLOCK.indexOf('Förslag att komma igång')
    const gate = BLOCK.indexOf('!loading && rules.length === 0')
    expect(heading).toBeGreaterThan(-1)
    expect(heading).toBeGreaterThan(gate) // rubriken renderas inuti samma villkorsblock
  })

  test('klick på ett chip anropar handleAdd(text) — ingen separat insert-funktion', () => {
    expect(BLOCK).toContain('onClick={() => handleAdd(text)}')
    // Ingen egen fetch-anrop i chip-blocket — bara i handleAdd självt.
    const suggestionsBlockStart = BLOCK.indexOf('Förslag att komma igång')
    const suggestionsBlockEnd = BLOCK.indexOf('<div className="flex items-start gap-2">')
    const suggestionsJsx = BLOCK.slice(suggestionsBlockStart, suggestionsBlockEnd)
    expect(suggestionsJsx).not.toContain('fetch(')
  })

  test('handleAdd har EN POST-väg mot /api/priority-rules som både textarean och chipsen delar', () => {
    const postCalls = BLOCK.match(/method: 'POST'/g) || []
    expect(postCalls.length).toBe(1)
    expect(BLOCK).toContain("fetch('/api/priority-rules', {")
    expect(BLOCK).toContain('body: JSON.stringify({ ruleText: text })')
  })

  test('handleAdd(overrideText) tar chip-texten in via samma trim-logik som den manuella texten', () => {
    expect(BLOCK).toContain('async function handleAdd(overrideText?: string)')
    expect(BLOCK).toContain('const text = (overrideText ?? newRule).trim()')
  })

  test('textareans "Lägg till"-knapp anropar samma handleAdd (ingen egen väg)', () => {
    expect(BLOCK).toContain('onClick={() => handleAdd()}')
  })

  test('chip-knappen visar "Sparar..." och är disabled medan just det chippet är i flight', () => {
    expect(BLOCK).toContain('disabled={saving}')
    expect(BLOCK).toContain("pendingSuggestion === text ? 'Sparar...' : text")
  })
})
