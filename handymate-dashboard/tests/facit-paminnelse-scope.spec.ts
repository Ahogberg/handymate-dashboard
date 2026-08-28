/**
 * Facit: påminnelsecronen kan köras scope:ad för ETT företag av en admin (Pass 2 / A2, 2026-08-28).
 * Cronvägen (CRON_SECRET, svep över alla företag) är oförändrad; scope:ad körning kräver admin.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const kod = fs.readFileSync(path.join(__dirname, '..', 'app/api/cron/send-reminders/route.ts'), 'utf8').replace(/\r\n/g, '\n')

test('scope:ad körning kräver admin; cronvägen kräver fortfarande CRON_SECRET', () => {
  const post = kod.slice(kod.indexOf('export async function POST'), kod.indexOf('async function sendAutoReminders('))
  expect(post).toContain("request.nextUrl.searchParams.get('business_id')")
  expect(post).toContain('isAdmin(request)')
  expect(post.indexOf('isAdmin(request)')).toBeLessThan(post.indexOf('sendAutoReminders(scopeBusinessId)'))
  expect(post).toContain('if (!verifyCronSecret(request)) {')
  expect(post).toContain('Endast admin får köra påminnelser för ett enskilt företag')
})

test('scopet filtrerar fakturafrågan på business_id och ändrar inget annat i trappan', () => {
  expect(kod).toContain("if (scopeBusinessId) invoiceQuery = invoiceQuery.eq('business_id', scopeBusinessId)")
  expect(kod).toContain('async function sendAutoReminders(scopeBusinessId: string | null = null)')
  // Samma urval som förut
  expect(kod).toContain(".in('status', ['sent', 'overdue'])")
  expect(kod).toContain(".lt('due_date', todayStr)")
})
