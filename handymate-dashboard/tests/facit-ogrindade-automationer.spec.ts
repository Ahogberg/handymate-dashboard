/**
 * Facit för Launch Truth Gate punkt 8 (2026-09-02): de fyra kundriktade
 * automationerna som saknade varje form av grind
 * (docs/reality-week/pass2-block-a-2026-08-28.md §F) är nu grindade.
 *
 *  1. Bokningspåminnelse 24 h — kräver uttryckligt
 *     automation_settings.sms_day_before_reminder = true (isolerad,
 *     fail-closed läsning) och ligger bakom agents_globally_paused.
 *  2+3. Mattes kundsvar (SMS + mejl, samma executor) — kräver
 *     business_config.matte_customer_reply_enabled = true (sql/v196,
 *     default false); annars blir svaret ett send_sms-kort.
 *  4. Recensionsförfrågan via tidsutgång — borttagen: ett obesvarat kort
 *     expirerar i steg 1, skickar aldrig.
 *
 * Körs: npx playwright test tests/facit-ogrindade-automationer.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

test('1. bokningspåminnelsen kräver ett uttryckligt påslaget reglage och respekterar kill-switchen', () => {
  const lib = read('lib/booking-reminders.ts')
  expect(lib).toContain('export async function isDayBeforeReminderEnabled(')
  expect(lib).toContain(".from('automation_settings')")
  expect(lib).toContain(".select('sms_day_before_reminder')")
  expect(lib).toContain("?.sms_day_before_reminder === true")
  // Grinden ligger FÖRE bokningsfrågan
  expect(lib.indexOf('await isDayBeforeReminderEnabled(supabase, businessId)')).toBeLessThan(lib.indexOf(".from('booking')"))
  // Aldrig via getAutomationSettings — dess defaults säger true utan rad
  expect(lib).not.toContain('getAutomationSettings(')

  const cron = read('app/api/cron/agent-context/route.ts')
  const paused = cron.indexOf('const outboundPaused =')
  const call = cron.indexOf('await sendBookingReminders(biz.business_id)')
  expect(paused).toBeGreaterThan(0)
  expect(call).toBeGreaterThan(paused)
  expect(cron.slice(paused, call)).toContain('if (!outboundPaused) {')
})

test('2+3. Mattes kundsvar går bara ut med tenant-flaggan på, annars som send_sms-kort', () => {
  const src = read('lib/matte/action-executor.ts')
  expect(src).toContain('export async function isCustomerReplyEnabled(')
  expect(src).toContain(".select('matte_customer_reply_enabled, agents_globally_paused')")
  expect(src).toContain("row?.matte_customer_reply_enabled === true && row?.agents_globally_paused !== true")
  expect(src).toMatch(/if \(await isCustomerReplyEnabled\(supabase, businessId\)\) \{\s*await sendCustomerReply\(/)
  expect(src).toContain('await queueCustomerReplyForApproval(')
  // Kortet följer send_sms-executorns kontrakt (payload.to + payload.message)
  expect(src).toMatch(/approval_type: 'send_sms',[\s\S]*?to: entity\.phone,[\s\S]*?message,/)
  // Exakt ett ställe skickar kundsvaret
  expect(src.match(/await sendCustomerReply\(/g)?.length).toBe(1)

  const sql = read('sql/v196_matte_customer_reply_enabled.sql')
  expect(sql).toContain('ADD COLUMN IF NOT EXISTS matte_customer_reply_enabled BOOLEAN DEFAULT false')
  expect(read('app/api/debug/schema-audit/route.ts')).toContain("column: 'matte_customer_reply_enabled', migration: 'v196_matte_customer_reply_enabled'")
})

test('4. ett obesvarat recensionskort expirerar — maintenance skickar aldrig SMS/mejl åt det', () => {
  const src = read('app/api/cron/maintenance/route.ts')
  expect(src).not.toContain(".neq('approval_type', 'scheduled_review_request')")
  expect(src).not.toContain("messageType: 'review_request'")
  expect(src).not.toContain("sendPortalNotification(review.business_id")
  expect(src).toContain('results.reviews_sent = 0')
  // Den vanliga expiry-sökvägen finns kvar (project-debrief-facit)
  expect(src).toContain(".lt('expires_at', new Date().toISOString())")
  // Manuellt godkännande av kortet finns kvar
  expect(read('app/api/approvals/[id]/route.ts')).toContain("case 'scheduled_review_request'")
})
