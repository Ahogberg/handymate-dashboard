/**
 * Facit för de tre P1-fynden i Etapp 0-specen (docs/audits/
 * TEAMET_I_FICKAN_IMPLEMENTATION_BLUEPRINT_2026-09-01.md) som var levande
 * gap i redan skarp kod, inte bara förberedelse för en obyggd funktion —
 * fixade 2026-09-01, samma dag de hittades.
 *
 * P1-1 (fail-safe-blast) täcks redan fullt av det uppdaterade
 * tests/push-target-user.spec.ts. Detta facit källskannar de två
 * återstående (P1-2, P1-3) plus en enkel sanity på att P1-1:s källrader
 * faktiskt ändrats.
 *
 * Körs: npx playwright test tests/push-approval-p1-fixes.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('P1-1 — Expo-push blastar aldrig längre till fel person', () => {
  test('selectExpoTargets returnerar noMatchingToken, aldrig en implicit blast, vid ingen träff', () => {
    const s = read('lib/notifications/expo-push.ts')
    expect(s).toContain('noMatchingToken: boolean')
    expect(s).toContain('return { tokens: [], usedTargetFilter: false, noMatchingToken: true }')
    // Den gamla fail-safe-kommentaren/beteendet ska vara borta, inte bara
    // omdöpt — annars kan den smyga tillbaka i en framtida refaktor.
    expect(s).not.toMatch(/return \{ tokens: rows\.map\(\(r\) => r\.token\), usedTargetFilter: false \}\s*\n\}/)
  })

  test('sendExpoPushNotification loggar gapet synligt men skickar inget vid noMatchingToken', () => {
    const s = read('lib/notifications/expo-push.ts')
    const fn = s.slice(s.indexOf('export async function sendExpoPushNotification'))
    expect(fn).toContain('if (noMatchingToken)')
    expect(fn).toContain("console.warn('[expo-push]")
    expect(fn).not.toContain('fail-safe blast till alla enheter')
  })
})

test.describe('P1-2 — Expo-mobilpush är oberoende av web-push-konfiguration', () => {
  test('sendExpoPushNotification anropas FÖRE VAPID-kollen, inte efter', () => {
    const s = read('app/api/push/send/route.ts')
    const expoCallIdx = s.indexOf('sendExpoPushNotification(business_id')
    const vapidCheckIdx = s.indexOf('if (!vapidPublicKey || !vapidPrivateKey)')
    expect(expoCallIdx).toBeGreaterThan(-1)
    expect(vapidCheckIdx).toBeGreaterThan(-1)
    expect(expoCallIdx).toBeLessThan(vapidCheckIdx)
  })

  test('Expo-anropet ligger också före web-push-prenumerationsfrågan och web-push-importen', () => {
    const s = read('app/api/push/send/route.ts')
    const expoCallIdx = s.indexOf('sendExpoPushNotification(business_id')
    const subscriptionsQueryIdx = s.indexOf("from('push_subscriptions')")
    const webpushImportIdx = s.indexOf("await import('web-push')")
    expect(expoCallIdx).toBeLessThan(subscriptionsQueryIdx)
    expect(expoCallIdx).toBeLessThan(webpushImportIdx)
  })
})

test.describe('P1-3 — GET /api/approvals/[id] kräver samma radbehörighet som POST', () => {
  const s = read('app/api/approvals/[id]/route.ts')
  const getFn = s.slice(s.indexOf('export async function GET'), s.indexOf('export async function POST'))

  test('GET anropar getCurrentUser och canActOnApproval, inte bara tenant-matchning', () => {
    expect(getFn).toContain('getCurrentUser(request)')
    expect(getFn).toContain('canActOnApproval(supabase, currentUser, data)')
  })

  test('obehörig läsning ger 403, inte kortets payload', () => {
    expect(getFn).toMatch(/if \(!canAct\)[\s\S]{0,120}status: 403/)
  })

  test('behörighetskollen sker EFTER att kortet hämtats (canActOnApproval behöver raden) men FÖRE svaret skickas', () => {
    const fetchIdx = getFn.indexOf(".from('pending_approvals')")
    const canActIdx = getFn.indexOf('canActOnApproval(')
    const responseIdx = getFn.indexOf('NextResponse.json({ approval: data })')
    expect(fetchIdx).toBeGreaterThan(-1)
    expect(canActIdx).toBeGreaterThan(fetchIdx)
    expect(responseIdx).toBeGreaterThan(canActIdx)
  })
})
