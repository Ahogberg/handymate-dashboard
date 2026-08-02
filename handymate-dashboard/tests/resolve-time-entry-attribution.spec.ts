/**
 * Etapp 1 Tier B (multi-employee-parity-plan.md) — fallback-kedja för
 * time_entry.business_user_id i tool-router.ts logTime() (telefon-/
 * Matte-triggat, ingen inloggad-användare-identitet tillgänglig).
 * Prioritet: bokningens assigned_user_id → sole-firma-fallback → null.
 * Körs: npx playwright test tests/resolve-time-entry-attribution.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { resolveTimeEntryAttribution } from '../lib/time-entries/resolve-attribution'

test.describe('resolveTimeEntryAttribution', () => {
  test('bokning har assigned_user_id → används, oavsett antal aktiva användare', () => {
    expect(resolveTimeEntryAttribution('bu_1', ['bu_1', 'bu_2', 'bu_3'])).toBe('bu_1')
  })

  test('bokning tilldelad någon som inte är i aktiva-listan → tilldelningen vinner ändå (fakta om bokningen, inte en gissning)', () => {
    expect(resolveTimeEntryAttribution('bu_9', ['bu_1', 'bu_2'])).toBe('bu_9')
  })

  test('ingen bokningstilldelning, sole-firma (exakt en aktiv användare) → attribueras dit', () => {
    expect(resolveTimeEntryAttribution(null, ['bu_1'])).toBe('bu_1')
  })

  test('ingen bokningstilldelning, flera aktiva användare → null (ingen gissning)', () => {
    expect(resolveTimeEntryAttribution(null, ['bu_1', 'bu_2'])).toBeNull()
  })

  test('ingen bokningstilldelning, noll aktiva användare → null', () => {
    expect(resolveTimeEntryAttribution(null, [])).toBeNull()
  })

  test('undefined bokningstilldelning behandlas som null', () => {
    expect(resolveTimeEntryAttribution(undefined, ['bu_1', 'bu_2'])).toBeNull()
    expect(resolveTimeEntryAttribution(undefined, ['bu_1'])).toBe('bu_1')
  })

  test('tom sträng som bokningstilldelning räknas som "ingen tilldelning" → fallback gäller', () => {
    expect(resolveTimeEntryAttribution('', ['bu_1'])).toBe('bu_1')
    expect(resolveTimeEntryAttribution('', ['bu_1', 'bu_2'])).toBeNull()
  })
})
