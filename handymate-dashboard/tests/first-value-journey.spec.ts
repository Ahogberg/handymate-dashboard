import { test, expect } from '@playwright/test'
import { deriveFirstAssignmentOptions } from '../lib/onboarding/first-assignment-options'
import { deriveKomIgangTasks, visibleKomIgangTasks } from '../lib/onboarding/kom-igang-tasks'
import { writeFirstMissionPrompt, readAndClearFirstMissionPrompt, FIRST_MISSION_PROMPT_KEY } from '../lib/onboarding/first-mission-handoff'
import { hamtaKomIgangSignals } from '../lib/onboarding/kom-igang-signals'
const empty = { ring_test: false, karin_has_invoice_data: false, has_quote: false, has_mission: false, customer_count: 0, segmented_customer_count: 0, pwa: false, pending_real_cards: 0 }
const snapshot = { hasFirstQuoteSetup: true, unpaidCount: 0, openDealsCount: 0, importedCustomers: 0 }
test('mål styr första uppdraget utan låtsasportfölj', () => {
  expect(deriveFirstAssignmentOptions({ ...snapshot, firstFocus: 'fler_jobb' })[0].id).toBe('customer_inflow')
  expect(deriveFirstAssignmentOptions({ ...snapshot, firstFocus: 'betalt_snabbare', unpaidCount: 1 })[0].id).toBe('portfolio_plan')
  expect(deriveFirstAssignmentOptions({ ...snapshot, firstFocus: 'mindre_admin' })[0].id).toBe('first_quote')
  expect(deriveFirstAssignmentOptions({ ...snapshot, firstFocus: 'betalt_snabbare' }).some(o => o.id === 'portfolio_plan')).toBe(false)
})
test('uppdrag före integration; verklig completion leder vidare till offert', () => {
  const first = deriveKomIgangTasks({ ...empty, firstFocus: 'mindre_admin' })
  expect(visibleKomIgangTasks(first).primary?.key).toBe('matte_mission')
  expect(first.find(t => t.key === 'matte_mission')?.prompt).toContain('slippa administration')
  expect(visibleKomIgangTasks(deriveKomIgangTasks({ ...empty, firstFocus: 'mindre_admin', has_mission: true })).primary?.key).toBe('daniel_quote')
})
test('handoff: rätt företag, en gång, giltighetstid och blockerad lagring', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    setItem: (k: string, v: string) => values.set(k, v), getItem: (k: string) => values.get(k) ?? null, removeItem: (k: string) => values.delete(k),
  } })
  try {
    expect(writeFirstMissionPrompt('Mitt fokus', 'a')).toBe(true)
    expect(readAndClearFirstMissionPrompt('b')).toBeNull()
    expect(readAndClearFirstMissionPrompt('a')).toBeNull()
    writeFirstMissionPrompt('Mitt fokus', 'a')
    expect(readAndClearFirstMissionPrompt('a')).toBe('Mitt fokus')
    expect(readAndClearFirstMissionPrompt('a')).toBeNull()
    for (const value of ['gammal oskopad prompt', JSON.stringify({ businessId: 'a', prompt: 'för gammal', createdAt: 0 }), '{broken']) {
      values.set(FIRST_MISSION_PROMPT_KEY, value)
      expect(readAndClearFirstMissionPrompt('a')).toBeNull()
    }
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get: () => { throw Error('blocked') } })
    expect(writeFirstMissionPrompt('Mitt fokus', 'a')).toBe(false)
    expect(readAndClearFirstMissionPrompt('a')).toBeNull()
  } finally {
    if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous)
    else delete (globalThis as any).sessionStorage
  }
})
test('signalläsningen behåller fokus och stoppar vid databasfel', async () => {
  let fail = false
  const tenants: string[] = []
  const db: any = { from: (table: string) => {
    const q: any = {
      select: () => q, eq: (key: string, value: string) => { if (key === 'business_id') tenants.push(value); return q }, not: () => q, neq: () => q, maybeSingle: () => q,
      then: (resolve: (x: any) => void) => resolve({ data: table === 'business_config' ? { onboarding_data: { first_focus: 'mindre_admin' } } : null, count: 0, error: fail && table === 'mission' ? { message: 'unreadable' } : null }),
    }; return q
  } }
  expect((await hamtaKomIgangSignals(db, 'firm-a')).firstFocus).toBe('mindre_admin')
  expect(tenants).toHaveLength(9)
  expect(tenants.every(t => t === 'firm-a')).toBe(true)
  fail = true
  await expect(hamtaKomIgangSignals(db, 'firm-a')).rejects.toThrow('Kunde inte läsa startunderlaget')
})
