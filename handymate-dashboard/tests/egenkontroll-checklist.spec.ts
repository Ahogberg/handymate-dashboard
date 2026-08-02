/**
 * Egenkontroll-agenten — Etapp 1d facit-tester (tasks/easoft-gap-plan.md).
 * Körs: npx playwright test tests/egenkontroll-checklist.spec.ts --no-deps
 *
 * Testar den rena, exporterade funktionen i
 * lib/egenkontroll/suggest-checklist.ts:
 *   - pickChecklistSuggestion (vilken branschmall, om någon, som föreslås)
 *
 * INGEN DB, INGET Supabase — suggestChecklistForProject (som gör I/O)
 * testas inte här, bara den rena valtologiken den bygger på. Samma
 * upplägg som tests/egenkontroll-ko.spec.ts (etapp 1b).
 */
import { test, expect } from '@playwright/test'
import { pickChecklistSuggestion } from '../lib/egenkontroll/suggest-checklist'
import { getChecklistsForBranch } from '../lib/checklist-defaults'

test.describe('pickChecklistSuggestion — mallval', () => {
  test('känd bransch utan befintlig checklista → returnerar första branschmallen', () => {
    const result = pickChecklistSuggestion('electrician', [])
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Elsäkerhetskontroll')
    // Ska matcha exakt vad getChecklistsForBranch faktiskt returnerar som
    // första mall — ingen separat urvalslogik som kan divergera över tid.
    expect(result).toEqual(getChecklistsForBranch('electrician')[0])
  })

  test('annan känd bransch ger sin egen första mall (inte samma som electrician)', () => {
    const result = pickChecklistSuggestion('plumber', [])
    expect(result?.name).toBe('Täthetsprovning')
  })

  test('känd bransch MED befintlig checklista (aktiv) → null', () => {
    const result = pickChecklistSuggestion('electrician', [{ id: 'cl_1' }])
    expect(result).toBeNull()
  })

  test('känd bransch MED befintlig checklista (flera) → null', () => {
    const result = pickChecklistSuggestion('plumber', [{ id: 'cl_1' }, { id: 'cl_2' }])
    expect(result).toBeNull()
  })

  test('okänd bransch utan befintlig checklista → faller tillbaka till första GENERIC-mallen (ingen gissning)', () => {
    const result = pickChecklistSuggestion('nagon_okand_bransch_xyz', [])
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Arbetsmiljö')
    expect(result).toEqual(getChecklistsForBranch('nagon_okand_bransch_xyz')[0])
  })

  test('tom bransch-sträng utan befintlig checklista → faller tillbaka till GENERIC (samma som okänd)', () => {
    const result = pickChecklistSuggestion('', [])
    expect(result?.name).toBe('Arbetsmiljö')
  })

  test('okänd bransch MED befintlig checklista → null (dedup vinner även utan branschmatch)', () => {
    const result = pickChecklistSuggestion('nagon_okand_bransch_xyz', [{ id: 'cl_1' }])
    expect(result).toBeNull()
  })

  test('tom mallista för branschen (injicerad) → null, ingen krasch', () => {
    const result = pickChecklistSuggestion('electrician', [], { templatesForBranch: () => [] })
    expect(result).toBeNull()
  })

  test('tom mallista + befintlig checklista → fortfarande null (existingChecklists kollas först)', () => {
    const result = pickChecklistSuggestion('electrician', [{ id: 'cl_1' }], { templatesForBranch: () => [] })
    expect(result).toBeNull()
  })
})
