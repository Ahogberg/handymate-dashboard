/**
 * Facit för riktad mobilpush (Expo) — säkerhets-/korrekthetsbugg fixad
 * 2026-08-19.
 *
 * Bakgrund: lib/notifications/approval-push.ts slår redan upp
 * routed_business_user_id → auth-uuid och skickar den som target_user_id
 * till /api/push/send. Web-push (push_subscriptions) honorerar redan
 * target_user_id. Mobilpush (push_tokens, Expo) hade INGEN per-user-kolumn
 * att filtrera på — sendExpoPushNotification blastade ALLTID till hela
 * businessens push_tokens-rader, oavsett vem beslutet gällde. En anställds
 * telefon kunde få en push om ett beslut (t.ex. four_eyes_quote) som bara
 * ägaren skulle se.
 *
 * selectExpoTargets (lib/notifications/expo-push.ts) är den rena
 * filtreringsfunktionen som avgör vilka push_tokens-rader en given
 * targetUserId ska nå. Testas direkt utan Supabase-mock (samma mönster
 * som övriga facit i repot, se tests/daniel-efterkalkyl-push.spec.ts).
 *
 * Tre beteenden som MÅSTE hålla:
 *  (a) target_user_id finns + matchande token finns → BARA den skickas
 *  (b) target_user_id finns men INGEN matchande token → fail-safe: blast
 *      till alla (usedTargetFilter=false så callern kan logga gapet)
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
  })

  test('(b) target_user_id finns men ingen rad matchar (t.ex. gammal token utan user_id) → fail-safe blast till alla', () => {
    const rows = [row('token-legacy-1', null), row('token-legacy-2', null)]
    const result = selectExpoTargets(rows, 'user-ägare')
    expect(result.tokens.sort()).toEqual(['token-legacy-1', 'token-legacy-2'])
    expect(result.usedTargetFilter).toBe(false)
  })

  test('(b) target_user_id finns men matchar ingen av flera olika användares tokens → fail-safe blast till alla, inte bara okända', () => {
    const rows = [row('token-a', 'user-a'), row('token-b', 'user-b')]
    const result = selectExpoTargets(rows, 'user-c')
    expect(result.tokens.sort()).toEqual(['token-a', 'token-b'])
    expect(result.usedTargetFilter).toBe(false)
  })

  test('(c) target_user_id saknas (undefined) → oförändrat blast till alla', () => {
    const rows = [row('token-1', 'user-a'), row('token-2', null)]
    const result = selectExpoTargets(rows, undefined)
    expect(result.tokens.sort()).toEqual(['token-1', 'token-2'])
    expect(result.usedTargetFilter).toBe(false)
  })

  test('(c) target_user_id är null → oförändrat blast till alla (samma som undefined)', () => {
    const rows = [row('token-1', 'user-a'), row('token-2', null)]
    const result = selectExpoTargets(rows, null)
    expect(result.tokens.sort()).toEqual(['token-1', 'token-2'])
    expect(result.usedTargetFilter).toBe(false)
  })

  test('tom token-lista + target_user_id satt → tom lista, usedTargetFilter false (inget att blasta)', () => {
    const result = selectExpoTargets([], 'user-ägare')
    expect(result.tokens).toEqual([])
    expect(result.usedTargetFilter).toBe(false)
  })

  test('target_user_id tom sträng behandlas som "saknas" (falsy) → blast, inte en matchningsnyckel', () => {
    const rows = [row('token-1', ''), row('token-2', 'user-a')]
    const result = selectExpoTargets(rows, '')
    expect(result.tokens.sort()).toEqual(['token-1', 'token-2'])
    expect(result.usedTargetFilter).toBe(false)
  })
})
