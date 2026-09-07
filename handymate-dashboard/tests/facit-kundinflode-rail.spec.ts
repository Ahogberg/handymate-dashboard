/**
 * Facit: Kundinflödet i Kom igång-railen (Block B, 2026-08-28).
 * Regel (Codex + Andreas): bara any_lead_verified får betyda "fungerar";
 * any_channel_verified ändrar bara formuleringen. Saknad signal ⇒ ingen uppgift.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { deriveKomIgangTasks, visibleKomIgangTasks, type KomIgangSignals } from '../lib/onboarding/kom-igang-tasks'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const tomt: KomIgangSignals = {
  ring_test: false, karin_has_invoice_data: false, has_quote: false, has_mission: false,
  customer_count: 0, segmented_customer_count: 0, pwa: false, pending_real_cards: 0,
}
const kanaler = 'Telefon: telefonen är aktiverad men oprövad · E-post: e-postinflödet är inte aktiverat · Webb: webbinflödet är inte aktiverat'

test('utan signal: ingen kundinflödesuppgift (aldrig ett gissat läge)', () => {
  expect(deriveKomIgangTasks(tomt).some(t => t.key === 'kundinflode')).toBe(false)
})

test('med signal: uppgiften finns, efter Lisa som standard, först vid "Få in fler jobb"', () => {
  const std = deriveKomIgangTasks({ ...tomt, kundinflode: { any_lead_verified: false, any_channel_verified: false, fler_jobb: false, kanaler } })
  expect(std.map(t => t.key).slice(0, 3)).toEqual(['ring', 'kundinflode', 'karin_data'])
  const fj = deriveKomIgangTasks({ ...tomt, kundinflode: { any_lead_verified: false, any_channel_verified: false, fler_jobb: true, kanaler } })
  expect(fj[0].key).toBe('kundinflode')
  expect(visibleKomIgangTasks(fj).primary?.agent).toBe('hanna')
})

test('"fungerar/bevisat" bara vid lead + affär; nådd kanal ändrar bara formuleringen', () => {
  const tip = (k: KomIgangSignals['kundinflode']) => deriveKomIgangTasks({ ...tomt, kundinflode: k }).find(t => t.key === 'kundinflode')!
  const ingen = tip({ any_lead_verified: false, any_channel_verified: false, fler_jobb: false, kanaler })
  expect(ingen.klar).toBe(false)
  expect(ingen.label).toBe('Bevisa att nya kunder når dig — skicka en provförfrågan hela vägen')
  const nadd = tip({ any_lead_verified: false, any_channel_verified: true, fler_jobb: false, kanaler })
  expect(nadd.klar).toBe(false)
  expect(nadd.label).toContain('inte bevisat')
  expect(nadd.label).not.toMatch(/fungerar|är bevisat/)
  const klar = tip({ any_lead_verified: true, any_channel_verified: true, fler_jobb: false, kanaler })
  expect(klar.klar).toBe(true)
  expect(klar.label).toContain('bevisat')
  // Kanalraden följer med som värde
  expect(ingen.varde).toBe(kanaler)
})

test('startsidan och mejlet delar alla bevis; ingen HTTP-route anropas från cron', () => {
  const r = kod('app/api/onboarding/kom-igang/route.ts')
  const signals = kod('lib/onboarding/kom-igang-signals.ts')
  const cron = kod('app/api/cron/onboarding-followup/route.ts')
  expect(r).toContain('hamtaKomIgangSignals(supabase, businessId)')
  expect(cron).toContain('hamtaKomIgangSignals(supabase, businessId)')
  expect(signals).toContain('loadChannelHealth(supabase, businessId)')
  expect(signals).toContain("fler_jobb: firstFocus === 'fler_jobb'")
  expect(signals).toContain('any_lead_verified: channelHealth.any_lead_verified')
  expect(r).not.toContain('channelHealthGET')
})
