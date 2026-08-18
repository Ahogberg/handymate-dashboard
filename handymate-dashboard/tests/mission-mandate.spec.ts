/**
 * Facit för lib/mandates/mission-mandate.ts (Mission Mandates V1, Etapp V,
 * tasks/jaunty-pondering-hummingbird.md).
 *
 * Täcker: ALLOWLIST-speglingens mängdlikhetslås, computePlanHash-
 * stabiliteten (fingerprint-prejudikatet), mandateCovers avvikelseorsak för
 * ORSAK, deriveMandateUsage (inkl. svensk dygnsgräns), auto-paus-tröskeln
 * (leveransfel + planändring, båda ren beslutslogik OCH I/O), fail-soft-
 * läsningarna, och källskanningarna (förbjuden spegel, ingen DELETE, ingen
 * mandate-skapande).
 *
 * Körs: npx playwright test tests/mission-mandate.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  MANDATE_ALLOWED_TYPES,
  mandateAllowlistMatchesAutonomyAllowlist,
  computePlanHash,
  verifyPlanUnchanged,
  mandateCovers,
  deriveMandateUsage,
  shouldPauseForDeliveryFailures,
  registerMandateDeliveryFailure,
  pauseMandateForPlanChange,
  loadActiveMandateForMission,
  loadActiveMandates,
  NO_MANDATE_REASON,
  MANDATE_FAILURE_THRESHOLD,
  type MandateRow,
  type MandateCoverageRequest,
  type MandateMissReason,
} from '../lib/mandates/mission-mandate'
import { isAllowlistedKey } from '../lib/autonomy/earned-autonomy'
import type { ValidatedMissionStep } from '../lib/mission/plan-validation'
import { classify } from '../lib/approvals/action-contract'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// ─────────────────────────────────────────────────────────────────
// Fake Supabase — samma kö-per-.from()-mönster som tests/checkpoint-
// outcomes.spec.ts, utökat med update/maybeSingle för mandat-skrivningarna.
// ─────────────────────────────────────────────────────────────────
type FakeResponse = { data: unknown; error: { message: string; code?: string } | null }

function fakeChain(response: FakeResponse) {
  const promise = Promise.resolve(response) as any
  const methods = ['select', 'eq', 'neq', 'not', 'gte', 'order', 'limit', 'in', 'contains', 'is', 'insert', 'update', 'maybeSingle']
  for (const m of methods) promise[m] = () => promise
  return promise
}

function fakeSupabase(responses: FakeResponse[]) {
  let calls = 0
  const tables: string[] = []
  const supabase = {
    from(table: string) {
      tables.push(table)
      const response = responses[calls] ?? { data: [], error: null }
      calls++
      return fakeChain(response)
    },
  }
  return { supabase, tables, callCount: () => calls }
}

const ok = (data: unknown): FakeResponse => ({ data, error: null })
const fail = (message: string, code?: string): FakeResponse => ({ data: null, error: { message, code } })

// ─────────────────────────────────────────────────────────────────
// ALLOWLIST-speglingen
// ─────────────────────────────────────────────────────────────────

test.describe('MANDATE_ALLOWED_TYPES — mängdlikhet med förtjänad autonomis ALLOWLIST', () => {
  test('exakt de fyra typerna', () => {
    expect([...MANDATE_ALLOWED_TYPES].sort()).toEqual(
      ['booking_reminder', 'invoice_reminder', 'quote_followup_sms', 'review_request'],
    )
  })

  test('mandateAllowlistMatchesAutonomyAllowlist() är sann (körtidslås mot AUTONOMY_META)', () => {
    expect(mandateAllowlistMatchesAutonomyAllowlist()).toBe(true)
  })

  test('varje mandat-typ är allowlistad i förtjänad autonomi', () => {
    for (const type of MANDATE_ALLOWED_TYPES) {
      expect(isAllowlistedKey(type)).toBe(true)
    }
  })

  test('en påhittad femte typ är INTE allowlistad', () => {
    expect(isAllowlistedKey('proactive_care')).toBe(false)
    expect(isAllowlistedKey('send_invoice')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────
// computePlanHash / verifyPlanUnchanged
// ─────────────────────────────────────────────────────────────────

function step(over: Partial<ValidatedMissionStep> = {}): ValidatedMissionStep {
  return {
    item_id: 'pf_1',
    truth_class: 'indrivningsbart',
    title: 'Faktura 123',
    measure: { kind: 'kr', amountKr: 5000 },
    evidence: { table: 'invoice', ref_id: 'inv_1' },
    agent_key: 'karin',
    approval_type: 'invoice_reminder',
    motivation: 'Förfallen sedan 10 dagar',
    ...over,
  }
}

test.describe('computePlanHash', () => {
  test('deterministisk: samma steg ger samma hash vid omräkning', () => {
    const steps = [step(), step({ item_id: 'pf_2' })]
    expect(computePlanHash(steps)).toBe(computePlanHash(steps))
  })

  test('okänslig för stegens ordning', () => {
    const a = step({ item_id: 'pf_1' })
    const b = step({ item_id: 'pf_2', evidence: { table: 'quotes', ref_id: 'q_1' } })
    expect(computePlanHash([a, b])).toBe(computePlanHash([b, a]))
  })

  test('okänslig för motivering (aldrig prosa i hashen)', () => {
    const a = step({ motivation: 'Första motiveringen' })
    const b = step({ motivation: 'Helt annan text, samma steg i övrigt' })
    expect(computePlanHash([a])).toBe(computePlanHash([b]))
  })

  test('ändrat mått ändrar hashen', () => {
    const a = step({ measure: { kind: 'kr', amountKr: 5000 } })
    const b = step({ measure: { kind: 'kr', amountKr: 5001 } })
    expect(computePlanHash([a])).not.toBe(computePlanHash([b]))
  })

  test('ändrad bevisreferens ändrar hashen', () => {
    const a = step({ evidence: { table: 'invoice', ref_id: 'inv_1' } })
    const b = step({ evidence: { table: 'invoice', ref_id: 'inv_2' } })
    expect(computePlanHash([a])).not.toBe(computePlanHash([b]))
  })

  test('ändrad truth_class ändrar hashen', () => {
    const a = step({ truth_class: 'indrivningsbart' })
    const b = step({ truth_class: 'faktureringsklart' })
    expect(computePlanHash([a])).not.toBe(computePlanHash([b]))
  })
})

test.describe('verifyPlanUnchanged', () => {
  test('true när planens hash matchar mandatets', () => {
    const steps = [step()]
    expect(verifyPlanUnchanged({ plan_hash: computePlanHash(steps) }, steps)).toBe(true)
  })
  test('false när planen ändrats sedan mandatet gavs', () => {
    const original = [step()]
    const andrad = [step({ measure: { kind: 'kr', amountKr: 9999 } })]
    expect(verifyPlanUnchanged({ plan_hash: computePlanHash(original) }, andrad)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────
// mandateCovers — varje avvikelseorsak för sig + den täckta lyckade vägen
// ─────────────────────────────────────────────────────────────────

function mandate(over: Partial<MandateRow> = {}): MandateRow {
  return {
    id: 'mnd_mis_1',
    business_id: 'biz_1',
    mission_id: 'mis_1',
    plan_hash: 'mndh_v1_abc',
    allowed_action_types: ['invoice_reminder'],
    targets: { invoice_ids: ['inv_1'] },
    daily_cap: 5,
    total_cap: 20,
    amount_cap_kr: null,
    expires_at: '2026-12-31',
    status: 'active',
    pause_reason: null,
    created_by: 'bu_1',
    created_at: '2026-08-01T00:00:00.000Z',
    revoked_at: null,
    paused_at: null,
    ...over,
  }
}

function req(over: Partial<MandateCoverageRequest> = {}): MandateCoverageRequest {
  return {
    actionKey: 'invoice_reminder',
    targetRef: 'inv_1',
    amountKr: 5000,
    nowIso: '2026-08-18T10:00:00.000Z',
    dailyUsed: 0,
    totalUsed: 0,
    ...over,
  }
}

test.describe('mandateCovers — täckt', () => {
  test('typ, mål, dag/total under tak, belopp under (default-)tak → covered', () => {
    const result = mandateCovers(mandate(), req())
    expect(result).toEqual({ covered: true })
  })

  test('inget belopptak alls (booking_reminder saknar default) → okänt belopp täcks ändå', () => {
    const m = mandate({ allowed_action_types: ['booking_reminder'], targets: { booking_ids: ['bok_1'] } })
    const result = mandateCovers(m, req({ actionKey: 'booking_reminder', targetRef: 'bok_1', amountKr: null }))
    expect(result).toEqual({ covered: true })
  })
})

test.describe('mandateCovers — varje avvikelseorsak', () => {
  test('fel_typ: typen ingår inte i mandatets allowed_action_types', () => {
    const result = mandateCovers(mandate(), req({ actionKey: 'review_request', targetRef: 'inv_1' }))
    expect(result).toEqual({ covered: false, reason: 'fel_typ' satisfies MandateMissReason })
  })

  test('fel_typ: helt okänd typsträng', () => {
    const result = mandateCovers(mandate(), req({ actionKey: 'send_invoice' }))
    expect(result.covered).toBe(false)
    expect((result as any).reason).toBe('fel_typ')
  })

  test('mal_utanfor: målet finns inte i den namngivna listan för typen', () => {
    const result = mandateCovers(mandate(), req({ targetRef: 'inv_999' }))
    expect(result).toEqual({ covered: false, reason: 'mal_utanfor' })
  })

  test('dagstak: dailyUsed nått daily_cap', () => {
    const m = mandate({ daily_cap: 3 })
    const result = mandateCovers(m, req({ dailyUsed: 3 }))
    expect(result).toEqual({ covered: false, reason: 'dagstak' })
  })

  test('totaltak: totalUsed nått total_cap', () => {
    const m = mandate({ total_cap: 10 })
    const result = mandateCovers(m, req({ totalUsed: 10 }))
    expect(result).toEqual({ covered: false, reason: 'totaltak' })
  })

  test('belopp_over_tak: explicit amount_cap_kr överskriden', () => {
    const m = mandate({ amount_cap_kr: 1000 })
    const result = mandateCovers(m, req({ amountKr: 1001 }))
    expect(result).toEqual({ covered: false, reason: 'belopp_over_tak' })
  })

  test('belopp_over_tak: DEFAULT_AUTONOMY_CAPS-taket överskriden (inget explicit tak satt)', () => {
    const result = mandateCovers(mandate(), req({ amountKr: 25001 })) // invoice_reminder default 25000
    expect(result).toEqual({ covered: false, reason: 'belopp_over_tak' })
  })

  test('belopp_okant: ett tak gäller (explicit) men beloppet är okänt', () => {
    const m = mandate({ amount_cap_kr: 1000 })
    const result = mandateCovers(m, req({ amountKr: null }))
    expect(result).toEqual({ covered: false, reason: 'belopp_okant' })
  })

  test('belopp_okant: ett tak gäller (default) men beloppet är okänt', () => {
    const result = mandateCovers(mandate(), req({ amountKr: null })) // invoice_reminder har ett default-tak
    expect(result).toEqual({ covered: false, reason: 'belopp_okant' })
  })

  test('utganget: dagens datum efter expires_at', () => {
    const m = mandate({ expires_at: '2026-08-01' })
    const result = mandateCovers(m, req({ nowIso: '2026-08-02T00:00:00.000Z' }))
    expect(result).toEqual({ covered: false, reason: 'utganget' })
  })

  test('utganget: status redan satt till expired', () => {
    const m = mandate({ status: 'expired' })
    const result = mandateCovers(m, req())
    expect(result).toEqual({ covered: false, reason: 'utganget' })
  })

  test('utganget: status completed räknas som utgånget för täckning', () => {
    const m = mandate({ status: 'completed' })
    const result = mandateCovers(m, req())
    expect(result).toEqual({ covered: false, reason: 'utganget' })
  })

  test('pausat: status paused utan plan_changed-orsak', () => {
    const m = mandate({ status: 'paused', pause_reason: 'delivery_failures' })
    const result = mandateCovers(m, req())
    expect(result).toEqual({ covered: false, reason: 'pausat' })
  })

  test('aterkallat: status revoked', () => {
    const m = mandate({ status: 'revoked' })
    const result = mandateCovers(m, req())
    expect(result).toEqual({ covered: false, reason: 'aterkallat' })
  })

  test('plan_andrad: status paused med pause_reason plan_changed', () => {
    const m = mandate({ status: 'paused', pause_reason: 'plan_changed' })
    const result = mandateCovers(m, req())
    expect(result).toEqual({ covered: false, reason: 'plan_andrad' })
  })

  test('ingen_mandat: konstanten finns för anropare utan något mandat alls (mandateCovers självt kräver redan ett mandate-objekt)', () => {
    expect(NO_MANDATE_REASON).toBe('ingen_mandat')
    const alla: MandateMissReason[] = [
      'ingen_mandat', 'fel_typ', 'mal_utanfor', 'dagstak', 'totaltak',
      'belopp_over_tak', 'belopp_okant', 'utganget', 'pausat', 'aterkallat', 'plan_andrad',
    ]
    expect(alla).toContain(NO_MANDATE_REASON)
  })
})

// ─────────────────────────────────────────────────────────────────
// deriveMandateUsage — härledning + svensk dygnsgräns
// ─────────────────────────────────────────────────────────────────

test.describe('deriveMandateUsage', () => {
  test('räknar bara godkända/auto-godkända kort med payload.mandate_id', () => {
    const cards = [
      { created_at: '2026-08-18T10:00:00.000Z', payload: { mandate_id: 'mnd_1' }, status: 'approved' },
      { created_at: '2026-08-18T10:00:00.000Z', payload: { mandate_id: 'mnd_1' }, status: 'auto_approved' },
      { created_at: '2026-08-18T10:00:00.000Z', payload: { mandate_id: 'mnd_1' }, status: 'pending' },
      { created_at: '2026-08-18T10:00:00.000Z', payload: { mandate_id: 'mnd_1' }, status: 'rejected' },
      { created_at: '2026-08-18T10:00:00.000Z', payload: {}, status: 'approved' },
      { created_at: '2026-08-18T10:00:00.000Z', payload: null, status: 'approved' },
    ]
    const usage = deriveMandateUsage(cards, '2026-08-18T12:00:00.000Z')
    expect(usage.totalUsed).toBe(2)
    expect(usage.dailyUsed).toBe(2)
  })

  test('dagsräkningen respekterar svensk lokaldag, inte UTC-kalenderdatum', () => {
    // nowIso: 19:00 UTC = 21:00 CEST (Stockholm), fortfarande 18 aug.
    const nowIso = '2026-08-18T19:00:00.000Z'
    // Kortet: 22:30 UTC SAMMA UTC-kalenderdag (18 aug) — men i Stockholm är
    // klockan då redan 00:30 den 19:e. En naiv UTC-datumjämförelse skulle
    // felaktigt räkna det som "idag".
    const cards = [
      { created_at: '2026-08-18T22:30:00.000Z', payload: { mandate_id: 'mnd_1' }, status: 'approved' },
    ]
    const usage = deriveMandateUsage(cards, nowIso)
    expect(usage.totalUsed).toBe(1) // räknas fortfarande i totalen
    expect(usage.dailyUsed).toBe(0) // men INTE som "idag" i Stockholm
  })

  test('ett kort skickat före svensk midnatt SAMMA svenska dag räknas som idag', () => {
    const nowIso = '2026-08-18T19:00:00.000Z' // 21:00 CEST, 18 aug
    const cards = [
      { created_at: '2026-08-18T06:00:00.000Z', payload: { mandate_id: 'mnd_1' }, status: 'approved' }, // 08:00 CEST, 18 aug
    ]
    const usage = deriveMandateUsage(cards, nowIso)
    expect(usage.dailyUsed).toBe(1)
  })

  test('tom lista → nollor', () => {
    expect(deriveMandateUsage([], '2026-08-18T12:00:00.000Z')).toEqual({ dailyUsed: 0, totalUsed: 0 })
  })
})

// ─────────────────────────────────────────────────────────────────
// Auto-paus vid leveransfel — ren tröskel + I/O
// ─────────────────────────────────────────────────────────────────

test.describe('shouldPauseForDeliveryFailures (ren tröskel)', () => {
  test('under tröskeln → false', () => {
    expect(shouldPauseForDeliveryFailures(MANDATE_FAILURE_THRESHOLD - 1)).toBe(false)
  })
  test('vid/över tröskeln → true', () => {
    expect(shouldPauseForDeliveryFailures(MANDATE_FAILURE_THRESHOLD)).toBe(true)
    expect(shouldPauseForDeliveryFailures(MANDATE_FAILURE_THRESHOLD + 5)).toBe(true)
  })
  test('MANDATE_FAILURE_THRESHOLD är 2 (speglar recordAutonomyFailure)', () => {
    expect(MANDATE_FAILURE_THRESHOLD).toBe(2)
  })
})

test.describe('registerMandateDeliveryFailure (I/O, fail-safe)', () => {
  test('2 leveransfel inom fönstret → pausar mandatet och skapar informationskort', async () => {
    const { supabase, callCount } = fakeSupabase([
      ok([
        { payload: { mandate_id: 'mnd_1', execution_result: { outcome: 'failed' } } },
        { payload: { mandate_id: 'mnd_1', execution_result: { outcome: 'failed' } } },
        { payload: { mandate_id: 'mnd_1', execution_result: { outcome: 'success' } } },
      ]),
      ok(null), // update mission_mandate
      ok(null), // insert pending_approvals
    ])
    await registerMandateDeliveryFailure(supabase as any, { mandateId: 'mnd_1', businessId: 'biz_1' })
    expect(callCount()).toBe(3)
  })

  test('färre än 2 leveransfel → ingen paus, ingen ytterligare skrivning', async () => {
    const { supabase, callCount } = fakeSupabase([
      ok([{ payload: { mandate_id: 'mnd_1', execution_result: { outcome: 'failed' } } }]),
    ])
    await registerMandateDeliveryFailure(supabase as any, { mandateId: 'mnd_1', businessId: 'biz_1' })
    expect(callCount()).toBe(1)
  })

  test('schema saknas (42P01) → tyst, kastar aldrig', async () => {
    const { supabase } = fakeSupabase([fail('relation does not exist', '42P01')])
    await expect(
      registerMandateDeliveryFailure(supabase as any, { mandateId: 'mnd_1', businessId: 'biz_1' }),
    ).resolves.toBeUndefined()
  })

  test('oväntat fel på uppdateringen → tyst, kastar aldrig', async () => {
    const { supabase } = fakeSupabase([
      ok([
        { payload: { mandate_id: 'mnd_1', execution_result: { outcome: 'failed' } } },
        { payload: { mandate_id: 'mnd_1', execution_result: { outcome: 'failed' } } },
      ]),
      fail('connection reset'),
    ])
    await expect(
      registerMandateDeliveryFailure(supabase as any, { mandateId: 'mnd_1', businessId: 'biz_1' }),
    ).resolves.toBeUndefined()
  })
})

test.describe('pauseMandateForPlanChange (I/O, fail-safe)', () => {
  test('pausar mandatet och skapar informationskort', async () => {
    const { supabase, callCount } = fakeSupabase([ok(null), ok(null)])
    await pauseMandateForPlanChange(supabase as any, { id: 'mnd_1', business_id: 'biz_1', mission_id: 'mis_1' })
    expect(callCount()).toBe(2)
  })

  test('schema saknas → tyst, kastar aldrig', async () => {
    const { supabase } = fakeSupabase([fail('relation does not exist', '42P01')])
    await expect(
      pauseMandateForPlanChange(supabase as any, { id: 'mnd_1', business_id: 'biz_1', mission_id: 'mis_1' }),
    ).resolves.toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────
// Fail-soft I/O-läsningar
// ─────────────────────────────────────────────────────────────────

test.describe('loadActiveMandateForMission', () => {
  test('schema saknas → null, kastar aldrig', async () => {
    const { supabase } = fakeSupabase([fail('relation does not exist', '42P01')])
    const result = await loadActiveMandateForMission(supabase as any, 'biz_1', 'mis_1')
    expect(result).toBeNull()
  })
  test('ingen rad → null', async () => {
    const { supabase } = fakeSupabase([ok(null)])
    const result = await loadActiveMandateForMission(supabase as any, 'biz_1', 'mis_1')
    expect(result).toBeNull()
  })
  test('rad hittad → returneras oavsett status (även pausad/återkallad)', async () => {
    const row = { id: 'mnd_1', status: 'paused' }
    const { supabase } = fakeSupabase([ok(row)])
    const result = await loadActiveMandateForMission(supabase as any, 'biz_1', 'mis_1')
    expect(result).toEqual(row)
  })
})

test.describe('loadActiveMandates', () => {
  test('schema saknas → tom lista, kastar aldrig', async () => {
    const { supabase } = fakeSupabase([fail('relation does not exist', '42P01')])
    const result = await loadActiveMandates(supabase as any, 'biz_1')
    expect(result).toEqual([])
  })
  test('rader hittade → returneras', async () => {
    const rows = [{ id: 'mnd_1', status: 'active' }]
    const { supabase } = fakeSupabase([ok(rows)])
    const result = await loadActiveMandates(supabase as any, 'biz_1')
    expect(result).toEqual(rows)
  })
})

// ─────────────────────────────────────────────────────────────────
// Källskanning
// ─────────────────────────────────────────────────────────────────

test.describe('mandate_paused_signal — registrerat i godkännande-kontraktet', () => {
  test('klassad som INFORMATIONAL (kortet konstaterar, exekverar inget)', () => {
    expect(classify('mandate_paused_signal')).toBe('INFORMATIONAL')
  })

  test('pauseMandateForPlanChange använder den föreskrivna svenska titeln', () => {
    const kalla = read('lib/mandates/mission-mandate.ts')
    expect(kalla).toContain('Mandatet pausat — planen ändrades')
  })
})

test.describe('lib/mandates/mission-mandate.ts — källskanning', () => {
  const kalla = read('lib/mandates/mission-mandate.ts')

  test('refererar aldrig den förbjudna exekveringsspegeln executeApprovalPayloadInternal', () => {
    expect(kalla).not.toContain('executeApprovalPayloadInternal')
  })

  test('innehåller aldrig en DELETE-operation', () => {
    expect(kalla).not.toContain('.delete(')
  })

  test('skapar aldrig ett mandat (ingen INSERT i mission_mandate — skapande är Etapp X:s ägar-UI)', () => {
    expect(kalla).not.toMatch(/mission_mandate'\)[\s\S]{0,120}\.insert\(/)
  })

  test('fail-soft: använder arSchemaSaknas genomgående', () => {
    expect(kalla).toContain('arSchemaSaknas')
  })
})
