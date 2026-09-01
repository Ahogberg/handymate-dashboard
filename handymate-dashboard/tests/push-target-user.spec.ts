/**
 * Facit för riktad mobilpush (Expo) — säkerhets-/korrekthetsbugg fixad
 * 2026-08-19, fail-safe-blasten borttagen 2026-09-01 (P1-1).
 *
 * Bakgrund: lib/notifications/approval-push.ts slår redan upp
 * routed_business_user_id → auth-uuid och skickar den som target_user_id
 * till /api/push/send. Web-push (push_subscriptions) honorerar redan
 * target_user_id och har ALDRIG haft en blast-fallback (0 skickat om ingen
 * matchar). Mobilpush (push_tokens, Expo) saknade tidigare per-user-kolumn
 * helt (2026-08-19-buggen), och fick sedan en "fail-safe blast till alla"
 * som ersättning — men den öppnade samma läcka på nytt: ett beslut riktat
 * till EN person (t.ex. four_eyes_quote till ägaren) kunde nå hela
 * personalens telefoner om just ägarens token saknades. P1-1 (2026-09-01)
 * tar bort fallbacken helt — Expo gör nu samma sak som web-push redan gjorde.
 *
 * selectExpoTargets (lib/notifications/expo-push.ts) är den rena
 * filtreringsfunktionen som avgör vilka push_tokens-rader en given
 * targetUserId ska nå. Testas direkt utan Supabase-mock (samma mönster
 * som övriga facit i repot, se tests/daniel-efterkalkyl-push.spec.ts).
 *
 * Tre beteenden som MÅSTE hålla:
 *  (a) target_user_id finns + matchande token finns → BARA den skickas
 *  (b) target_user_id finns men INGEN matchande token → INGEN sändning
 *      (noMatchingToken=true så callern loggar gapet synligt, aldrig tyst)
 *  (c) target_user_id saknas helt → oförändrat blast (dagens no-op-läge
 *      för de flesta approval_types)
 *
 * Körs: npx playwright test tests/push-target-user.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { selectExpoTargets, type ExpoTokenRow } from '../lib/notifications/expo-push'

function row(token: string, userId: string | null = null): ExpoTokenRow {
  return { token, user_id: userId }
}

test.describe('selectExpoTargets — riktad mobilpush-filtrering', () => {
  test('(a) target_user_id finns + exakt en matchande token → bara den skickas', () => {
    const rows = [row('token-ägare', 'user-ägare'), row('token-anställd', 'user-anställd')]
    const result = selectExpoTargets(rows, 'user-ägare')
    expect(result.tokens).toEqual(['token-ägare'])
    expect(result.usedTargetFilter).toBe(true)
    expect(result.noMatchingToken).toBe(false)
  })

  test('(a) target_user_id finns + flera enheter för samma användare → alla dennes tokens skickas, ingen annans', () => {
    const rows = [
      row('token-ägare-iphone', 'user-ägare'),
      row('token-ägare-ipad', 'user-ägare'),
      row('token-anställd', 'user-anställd'),
    ]
    const result = selectExpoTargets(rows, 'user-ägare')
    expect(result.tokens.sort()).toEqual(['token-ägare-ipad', 'token-ägare-iphone'])
    expect(result.usedTargetFilter).toBe(true)
    expect(result.noMatchingToken).toBe(false)
  })

  test('(b) target_user_id finns men ingen rad matchar (t.ex. gammal token utan user_id) → INGEN sändning, aldrig blast', () => {
    const rows = [row('token-legacy-1', null), row('token-legacy-2', null)]
    const result = selectExpoTargets(rows, 'user-ägare')
    expect(result.tokens).toEqual([])
    expect(result.usedTargetFilter).toBe(false)
    expect(result.noMatchingToken).toBe(true)
  })

  test('(b) target_user_id finns men matchar ingen av flera olika användares tokens → INGEN sändning, inte ens till de okända', () => {
    const rows = [row('token-a', 'user-a'), row('token-b', 'user-b')]
    const result = selectExpoTargets(rows, 'user-c')
    expect(result.tokens).toEqual([])
    expect(result.usedTargetFilter).toBe(false)
    expect(result.noMatchingToken).toBe(true)
  })

  test('(c) target_user_id saknas (undefined) → oförändrat blast till alla', () => {
    const rows = [row('token-1', 'user-a'), row('token-2', null)]
    const result = selectExpoTargets(rows, undefined)
    expect(result.tokens.sort()).toEqual(['token-1', 'token-2'])
    expect(result.usedTargetFilter).toBe(false)
    expect(result.noMatchingToken).toBe(false)
  })

  test('(c) target_user_id är null → oförändrat blast till alla (samma som undefined)', () => {
    const rows = [row('token-1', 'user-a'), row('token-2', null)]
    const result = selectExpoTargets(rows, null)
    expect(result.tokens.sort()).toEqual(['token-1', 'token-2'])
    expect(result.usedTargetFilter).toBe(false)
    expect(result.noMatchingToken).toBe(false)
  })

  test('tom token-lista + target_user_id satt → tom lista, ingen sändning (inget att filtrera på)', () => {
    const result = selectExpoTargets([], 'user-ägare')
    expect(result.tokens).toEqual([])
    expect(result.usedTargetFilter).toBe(false)
    expect(result.noMatchingToken).toBe(true)
  })

  test('target_user_id tom sträng behandlas som "saknas" (falsy) → blast, inte en matchningsnyckel', () => {
    const rows = [row('token-1', ''), row('token-2', 'user-a')]
    const result = selectExpoTargets(rows, '')
    expect(result.tokens.sort()).toEqual(['token-1', 'token-2'])
    expect(result.usedTargetFilter).toBe(false)
    expect(result.noMatchingToken).toBe(false)
  })
})
