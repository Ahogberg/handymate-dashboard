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

test('rutten hämtar sanningen från Codex kanalhälsa (samma request), läser firstFocus och utelämnar vid fel', () => {
  const r = kod('app/api/onboarding/kom-igang/route.ts')
  expect(r).toContain("import { GET as channelHealthGET } from '@/app/api/onboarding/channel-health/route'")
  expect(r).toContain('await channelHealthGET(request)')
  expect(r).toContain("fler_jobb: firstFocus === 'fler_jobb'")
  expect(r).toContain('...(kundinflode ? { kundinflode } : {})')
  expect(r).not.toMatch(/any_lead_verified: true/)
})
