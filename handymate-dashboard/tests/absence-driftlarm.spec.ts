/**
 * Facit för driftlarmets frånvaro-medvetna ägar-push (Etapp Å).
 *
 * Driftlarmet (app/api/cron/driftlarm/route.ts) mejlar historiskt bara ops.
 * Under ett aktivt frånvarofönster ska eskaleringsklassade fel ÄVEN pusha
 * ägaren via den befintliga push-vägen — ops-mejlet ska vara helt oberört.
 * Källskanning (samma idiom som tests/dygnsdigest.spec.ts "ytan"-blocket)
 * eftersom full Supabase/fetch-mockning av en cron-route inte är rimlig här.
 *
 *   npx playwright test tests/absence-driftlarm.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(ROOT, 'app', 'api', 'cron', 'driftlarm', 'route.ts'), 'utf8')

test.describe('driftlarmets ägar-push under frånvaro', () => {
  test('importerar frånvaro-primitiven och den delade push-vägen — ingen ny kanal', () => {
    expect(src).toContain("import { getAbsenceWindow, isAbsenceActive } from '@/lib/absence/absence-window'")
    expect(src).toContain("import { classifyAbsenceEvent } from '@/lib/absence/escalation'")
    expect(src).toContain("import { sendApprovalPush } from '@/lib/notifications/approval-push'")
  })

  test('ops-mejlets adressat och skicklogik rörs inte', () => {
    expect(src).toContain("to: 'andreas@handymate.se'")
    expect(src.match(/sendEmail\(/g)?.length).toBe(1)
  })

  test('ägar-push-steget ligger EFTER sweep 3+4 (behöver deras rader) och FÖRE ops-mejlet', () => {
    const billingIdx = src.indexOf('// 3. billing_event')
    const automationIdx = src.indexOf('// 4. automation_activity')
    const absenceStepIdx = src.indexOf('Owner Absence V1 (Etapp Å) — driftlarmet mejlar historiskt')
    const mailIdx = src.indexOf('await sendEmail({')
    expect(billingIdx).toBeGreaterThan(-1)
    expect(automationIdx).toBeGreaterThan(billingIdx)
    expect(absenceStepIdx).toBeGreaterThan(automationIdx)
    expect(mailIdx).toBeGreaterThan(absenceStepIdx)
  })

  test('varje ägar-push är gate:ad bakom en absence-aktiv-koll, aldrig ovillkorlig', () => {
    const stepStart = src.indexOf('Owner Absence V1 (Etapp Å) — driftlarmet mejlar historiskt')
    const stepBody = src.slice(stepStart)
    // Två sendApprovalPush-anrop (payment_failed_signal + external_delivery_failure_signal),
    // båda direkt efter ett "if (!(await absenceActiveFor(...))) continue"-mönster.
    const calls = Array.from(stepBody.matchAll(/if \(!\(await absenceActiveFor\(row\.business_id\)\)\) continue/g))
    expect(calls.length).toBe(2)
    expect(stepBody).toContain("approval_type: 'payment_failed_signal'")
    expect(stepBody).toContain("approval_type: 'external_delivery_failure_signal'")
  })

  test('klassningen går via classifyAbsenceEvent, inte en egen if-sats', () => {
    const stepStart = src.indexOf('Owner Absence V1 (Etapp Å) — driftlarmet mejlar historiskt')
    const stepBody = src.slice(stepStart, src.indexOf('} catch (err) {\n    // Fail-safe: ägar-pushen'))
    expect(stepBody).toContain("classifyAbsenceEvent({ kind: 'billing_event', eventType: 'payment_failed' })")
    expect(stepBody).toContain("classifyAbsenceEvent({ kind: 'automation_activity', status: 'failed' })")
  })

  test('en trasig frånvaro-koll är fail-closed (ingen push), en trasig hela steget är fail-safe (mejlet går ändå)', () => {
    expect(src).toContain('fail-closed, ingen extra push')
    expect(src).toContain('fail-safe, ops-mejlet skickas ändå')
  })
})

test.describe('push-mallarna för de nya syntetiska signalerna', () => {
  const pushSrc = fs.readFileSync(path.join(ROOT, 'lib', 'notifications', 'approval-push.ts'), 'utf8')

  test('payment_failed_signal och external_delivery_failure_signal har egna mallar (bygger inte null)', () => {
    expect(pushSrc).toContain("case 'payment_failed_signal'")
    expect(pushSrc).toContain("case 'external_delivery_failure_signal'")
  })

  test('ingen av mallarna skapar en pending_approvals-rad — de är rena push-events', () => {
    const start = pushSrc.indexOf("case 'payment_failed_signal'")
    const end = pushSrc.indexOf("case 'monday_brief'")
    expect(pushSrc.slice(start, end)).not.toContain("from('pending_approvals')")
  })
})
