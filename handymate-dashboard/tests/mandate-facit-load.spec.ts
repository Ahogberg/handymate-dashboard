/**
 * FACIT — lib/mandates/load-mandate-facit.ts (Mission Mandates V1, Etapp X:
 * ägarens upplevelse, tasks/jaunty-pondering-hummingbird.md).
 *
 * I/O-lagret ovanpå lib/mandates/mandate-facit.ts:s rena byggMandateFacit:
 * läser mandatets stämplade kort (payload.mandate_id), härleder
 * contactedCustomerAt ur den TIDIGASTE lyckade kundkopplade exekveringen
 * (resolved_at, fallback created_at), och opt-out-händelser ur
 * customer.sms_opt_out/sms_opt_out_at (sql/v86) — bara för de kunder som
 * faktiskt kontaktades av DET HÄR mandatet, aldrig hela kundregistret.
 * Fail-soft genomgående: null vid schema saknas eller fel, aldrig ett kastat
 * fel (samma kontrakt som mission-mandate.ts:s övriga I/O-läsningar).
 *
 * Körs: npx playwright test tests/mandate-facit-load.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { loadMandateFacit } from '../lib/mandates/load-mandate-facit'
import type { MandateRow } from '../lib/mandates/mission-mandate'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

type FakeResponse = { data: unknown; error: { message: string; code?: string } | null }

function fakeChain(response: FakeResponse) {
  const promise = Promise.resolve(response) as any
  const methods = ['select', 'eq', 'neq', 'not', 'gte', 'order', 'limit', 'in', 'contains', 'is', 'insert', 'update', 'maybeSingle']
  for (const m of methods) promise[m] = () => promise
  return promise
}

function fakeSupabase(responses: FakeResponse[]) {
  let calls = 0
  const supabase = {
    from(_table: string) {
      const response = responses[calls] ?? { data: [], error: null }
      calls++
      return fakeChain(response)
    },
  }
  return { supabase, callCount: () => calls }
}

const ok = (data: unknown): FakeResponse => ({ data, error: null })
const fail = (message: string, code?: string): FakeResponse => ({ data: null, error: { message, code } })

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

test.describe('loadMandateFacit — I/O fail-soft', () => {
  test('schema saknas (42P01) på kortläsningen → null, kastar aldrig', async () => {
    const { supabase } = fakeSupabase([fail('relation does not exist', '42P01')])
    const result = await loadMandateFacit(supabase as any, 'biz_1', mandate())
    expect(result).toBeNull()
  })

  test('inga kort alls → per_type med noll rader, ingen kundläsning görs (noll I/O för kunder)', async () => {
    const { supabase, callCount } = fakeSupabase([ok([])])
    const result = await loadMandateFacit(supabase as any, 'biz_1', mandate())
    expect(result).not.toBeNull()
    expect(result?.per_type).toEqual([{ action_type: 'invoice_reminder', utforda: 0, leveransfel: 0, stopp_inom_7d: 0, ej_bedombart: 0 }])
    expect(callCount()).toBe(1) // ingen kundtabell-läsning när ingen kund kontaktades
  })

  test('ett lyckat kort med kundkoppling → utforda:1, kundtabellen läses för STOPP-underlaget', async () => {
    const m = mandate()
    const { supabase, callCount } = fakeSupabase([
      ok([
        {
          approval_type: 'invoice_reminder',
          status: 'auto_approved',
          created_at: '2026-08-10T08:00:00.000Z',
          resolved_at: '2026-08-10T08:00:05.000Z',
          payload: { mandate_id: m.id, autonomy_key: 'invoice_reminder', customer_id: 'c1', execution_result: { outcome: 'success' } },
        },
      ]),
      ok([{ customer_id: 'c1', sms_opt_out: false, sms_opt_out_at: null }]),
    ])
    const result = await loadMandateFacit(supabase as any, 'biz_1', m)
    expect(result?.per_type[0].utforda).toBe(1)
    expect(result?.per_type[0].stopp_inom_7d).toBe(0)
    expect(callCount()).toBe(2)
  })

  test('kunden opt:ar ut inom 7 dagar efter kontakt → stopp_inom_7d:1', async () => {
    const m = mandate()
    const { supabase } = fakeSupabase([
      ok([
        {
          approval_type: 'invoice_reminder',
          status: 'auto_approved',
          created_at: '2026-08-10T08:00:00.000Z',
          resolved_at: '2026-08-10T08:00:00.000Z',
          payload: { mandate_id: m.id, autonomy_key: 'invoice_reminder', customer_id: 'c1', execution_result: { outcome: 'success' } },
        },
      ]),
      ok([{ customer_id: 'c1', sms_opt_out: true, sms_opt_out_at: '2026-08-12T00:00:00.000Z' }]),
    ])
    const result = await loadMandateFacit(supabase as any, 'biz_1', m)
    expect(result?.per_type[0].stopp_inom_7d).toBe(1)
  })

  test('kort utan kundkoppling → ej_bedombart, ingen kundtabell-läsning', async () => {
    const m = mandate()
    const { supabase, callCount } = fakeSupabase([
      ok([
        {
          approval_type: 'invoice_reminder',
          status: 'auto_approved',
          created_at: '2026-08-10T08:00:00.000Z',
          resolved_at: null,
          payload: { mandate_id: m.id, autonomy_key: 'invoice_reminder', execution_result: { outcome: 'success' } },
        },
      ]),
    ])
    const result = await loadMandateFacit(supabase as any, 'biz_1', m)
    expect(result?.per_type[0].utforda).toBe(1)
    expect(result?.per_type[0].ej_bedombart).toBe(1)
    expect(callCount()).toBe(1)
  })

  test('kundläsningen felar → fail-soft till tomma opt-out-händelser, facit räknas ändå', async () => {
    const m = mandate()
    const { supabase } = fakeSupabase([
      ok([
        {
          approval_type: 'invoice_reminder',
          status: 'auto_approved',
          created_at: '2026-08-10T08:00:00.000Z',
          resolved_at: '2026-08-10T08:00:00.000Z',
          payload: { mandate_id: m.id, autonomy_key: 'invoice_reminder', customer_id: 'c1', execution_result: { outcome: 'success' } },
        },
      ]),
      fail('connection reset'),
    ])
    const result = await loadMandateFacit(supabase as any, 'biz_1', m)
    expect(result?.per_type[0].utforda).toBe(1)
    expect(result?.per_type[0].stopp_inom_7d).toBe(0)
  })

  test('internt kastat fel → fail-soft, null, kastar aldrig', async () => {
    const throwing = { from() { throw new Error('boom') } }
    await expect(loadMandateFacit(throwing as any, 'biz_1', mandate())).resolves.toBeNull()
  })

  test('agaraterkallelse/pausorsaker speglar mandatets status oförändrat (byggMandateFacit återanvänds, byggs inte om)', async () => {
    const m = mandate({ status: 'revoked' })
    const { supabase } = fakeSupabase([ok([])])
    const result = await loadMandateFacit(supabase as any, 'biz_1', m)
    expect(result?.agaraterkallelse).toBe(true)
  })
})

test.describe('lib/mandates/load-mandate-facit.ts — källskanning', () => {
  const src = read('lib/mandates/load-mandate-facit.ts')

  test('bygger på den rena byggMandateFacit, definierar inte om räkningen', () => {
    expect(src).toContain('byggMandateFacit')
  })

  test('fail-soft: använder arSchemaSaknas', () => {
    expect(src).toContain('arSchemaSaknas')
  })

  test('läser aldrig hela kundregistret utan att skopa till kontaktade kunder (ingen .eq(\'business_id\'... utan .in(\'customer_id\'... på customer-tabellen)', () => {
    expect(src).toContain("in('customer_id'")
  })
})
