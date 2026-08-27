/**
 * "Teamet behöver detta för att hjälpa dig bättre" (Lager 3 / B7, 2026-08-27).
 *
 *   npx playwright test tests/kom-igang-tasks.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  deriveKomIgangTasks,
  visibleKomIgangTasks,
  KOM_IGANG_DEFAULT_LABELS,
  KOM_IGANG_HEADING,
  type KomIgangSignals,
} from '../lib/onboarding/kom-igang-tasks'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const tomt: KomIgangSignals = {
  ring_test: false, karin_has_invoice_data: false, has_quote: false, has_mission: false,
  customer_count: 0, segmented_customer_count: 0, pwa: false, pending_real_cards: 0,
}

test('nytt konto: Lisa → Karin → Daniel → Matte; Hanna och push visas inte utan kunder resp. kort', () => {
  const tasks = deriveKomIgangTasks(tomt)
  expect(tasks.map(t => t.key)).toEqual(['ring', 'karin_data', 'daniel_quote', 'matte_mission'])
  const { primary, secondary } = visibleKomIgangTasks(tasks)
  expect(primary?.agent).toBe('lisa')
  expect(secondary.map(t => t.agent)).toEqual(['karin', 'daniel'])
  // Default-etiketterna (LiveTourens mock) är exakt de tre första öppna uppgifterna
  expect([primary!.label, ...secondary.map(t => t.label)]).toEqual([...KOM_IGANG_DEFAULT_LABELS])
})

test('klara uppgifter faller bort ur det synliga; nästa i prioriteten tar över som primär', () => {
  const tasks = deriveKomIgangTasks({ ...tomt, ring_test: true, karin_has_invoice_data: true })
  const { primary, secondary } = visibleKomIgangTasks(tasks)
  expect(primary?.key).toBe('daniel_quote')
  expect(secondary.map(t => t.key)).toEqual(['matte_mission'])
})

test('Hanna bara med kunder utan segment; klar när minst en kund är segmenterad', () => {
  const utan = deriveKomIgangTasks({ ...tomt, customer_count: 12 })
  expect(utan.find(t => t.key === 'hanna_segment')?.klar).toBe(false)
  const med = deriveKomIgangTasks({ ...tomt, customer_count: 12, segmented_customer_count: 1 })
  expect(med.find(t => t.key === 'hanna_segment')?.klar).toBe(true)
})

test('push föreslås bara när ett riktigt kort väntar — annars finns inget att få notis om', () => {
  expect(deriveKomIgangTasks(tomt).some(t => t.key === 'pwa')).toBe(false)
  const med = deriveKomIgangTasks({ ...tomt, pending_real_cards: 1 })
  expect(med.some(t => t.key === 'pwa')).toBe(true)
  expect(med.find(t => t.key === 'pwa')?.klar).toBe(false)
})

test('varje uppgift förklarar agent, värde, tid och href', () => {
  for (const t of deriveKomIgangTasks({ ...tomt, customer_count: 3, pending_real_cards: 2 })) {
    expect(t.agent).toBeTruthy()
    expect(t.varde.length).toBeGreaterThan(10)
    expect(t.minuter).toBeGreaterThan(0)
    expect(t.href.startsWith('/dashboard')).toBe(true)
  }
})

test('rutten läser signalerna ur riktiga tabeller och behåller de tre booleanerna; railen och LiveTouren läser lib:en', () => {
  const route = kod('app/api/onboarding/kom-igang/route.ts')
  for (const t of ["from('invoice')", "from('mission')", "from('customer')", ".not('segment_id', 'is', null)", ".neq('approval_type', 'team_intro')", 'fortnox_connected']) {
    expect(route, `${t} saknas`).toContain(t)
  }
  expect(route).toContain('return NextResponse.json({ ring_test, forsta_artefakten, pwa, tasks })')
  const rail = kod('components/jarvis/KomIgangRail.tsx')
  expect(rail).toContain('visibleKomIgangTasks(tasks)')
  expect(rail).toContain('{KOM_IGANG_HEADING}')
  expect(rail).toContain("tasks.every(t => t.klar)")
  expect(rail).toContain('fallbackTasks(data)')
  expect(kod('app/onboarding/components/Step6LiveTour.tsx')).toContain('KOM_IGANG_DEFAULT_LABELS.map')
  expect(KOM_IGANG_HEADING).toBe('Teamet behöver detta för att hjälpa dig bättre')
})
