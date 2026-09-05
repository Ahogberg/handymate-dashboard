/**
 * Kommunikation-sidan skriver till den tabell som styr utskicken (2026-09-05).
 *
 * `communication_settings` har aldrig funnits i produktionen. Sidan Kommunikation
 * läste den (svalde felet, visade defaults där allt såg påslaget ut) och skrev
 * till den (500, reglaget slog tillbaka). Automationer-sidan speglade dit och
 * kastade — 500 på varje sparning. Cronen communication-check gjorde inget.
 * Allt pekar nu på automation_settings, som cronerna faktiskt läser.
 *
 * Körs utan browser: npx playwright test tests/kommunikation-installningar.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const read = (rel: string) => strip(fs.readFileSync(path.join(ROOT, rel), 'utf8'))

function allaKallfiler(dir: string, ut: string[] = []): string[] {
  for (const namn of fs.readdirSync(dir)) {
    const p = path.join(dir, namn)
    if (fs.statSync(p).isDirectory()) { if (namn !== 'node_modules') allaKallfiler(p, ut) }
    else if (/\.(ts|tsx)$/.test(namn)) ut.push(p)
  }
  return ut
}

test('ingen produktionskod läser eller skriver communication_settings längre', () => {
  const traffar: string[] = []
  for (const dir of ['app', 'lib', 'components']) {
    for (const f of allaKallfiler(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, f)
      if (rel === 'lib/account/radera.ts') continue // klassningslistan får nämna tabellen — den raderar den om den dyker upp
      if (strip(fs.readFileSync(f, 'utf8')).includes("from('communication_settings')")) traffar.push(rel)
    }
  }
  expect(traffar, 'tabellen finns inte — ett anrop hit är en tyst lögn').toEqual([])
})

test('GET och PUT går via lib/automations, inte via en egen tabell', () => {
  const r = read('app/api/communication/settings/route.ts')
  expect(r).toContain('getAutomationSettings(business.business_id)')
  expect(r).toContain('updateAutomationSettings(business.business_id, updates)')
  expect(r).toContain('syncCommunicationSettings(settings)')
  expect(r).not.toContain('.from(')
  // varje legacy-nyckel mappar till en verklig automation_settings-kolumn
  for (const k of ['sms_auto_enabled', 'sms_quote_followup', 'sms_day_before_reminder', 'sms_max_per_customer_week', 'sms_quiet_hours_start'])
    expect(r).toContain(`'${k}'`)
})

test('Automationer-sidans sparning kastar inte längre på en spegling', () => {
  const r = read('app/api/automations/route.ts')
  expect(r).not.toContain('communicationSyncError')
  expect(r).toContain("from('pipeline_automation')") // den speglingen är kvar och tabellen finns
})

test('communication-check läser av-listan ur automation_settings och är fortsatt fail-closed', () => {
  const r = read('app/api/cron/communication-check/route.ts')
  expect(r).toMatch(/from\('automation_settings'\)\s*\.select\('business_id'\)\s*\.eq\('sms_auto_enabled', false\)/)
  expect(r).toContain("skipped: 'automation_settings kunde inte läsas — fail-closed'")
})

test('quote-follow-up har ingen död fallback kvar', () => {
  const r = read('app/api/cron/quote-follow-up/route.ts')
  expect(r).not.toContain('communication_settings')
  expect(r).toContain("sms_auto_enabled !== false && autoSettings.sms_quote_followup !== false")
})

test('smart-communication läser samma sanning', () => {
  const r = read('lib/smart-communication.ts')
  expect(r).toContain('getAutomationSettings(businessId)')
  expect(r).toContain('syncCommunicationSettings(auto)')
})

test('ton-väljaren är borta — ingen kolumn, ingen sändväg läste den', () => {
  const p = read('app/dashboard/communication/page.tsx')
  expect(p).not.toContain('toneLabels')
  expect(p).not.toContain("'formal', 'friendly', 'personal'")
})
