/**
 * Facit för lib/mandates/platform-maturity.ts (Etapp Y, I/O-lagret) +
 * app/api/admin/mandate-maturity/route.ts (källskanning). Mission Mandates
 * V1, tasks/jaunty-pondering-hummingbird.md.
 *
 * `loadPlatformTypeMaturity` aggregerar mandat-stämplade kort ÖVER ALLA
 * FÖRETAG (service-role, ingen business_id-filtrering på mission_mandate-
 * frågan) genom att återanvända den redan låsta rena kärnan
 * `byggMandateFacit` per mandat — den duplicerar ALDRIG räkningslogiken
 * lokalt (samma disciplin som load-mandate-facit.ts:s filhuvud kräver av
 * ANDRA konsumenter). Låst här:
 *   - fail-soft när mission_mandate saknas/är trasig → tomt underlag för
 *     alla fyra typer, kastar aldrig
 *   - aggregerar korrekt över FLERA mandat/företag, per typ separat
 *   - säkerhetsåterkallelser: bara mandat med ≥1 utförd av just DEN typen
 *     räknas som en återkallelse FÖR DEN TYPEN (konservativ, dokumenterad
 *     överskattningsrisk — se filhuvudet i platform-maturity.ts)
 *   - forsta_utford: tidigaste framgångsrika utskicket per typ, över alla
 *     mandat
 *   - ett trasigt enskilt mandats kortläsning hoppar bara över DET mandatet
 *     (fail-soft per mandat, inte för hela svepet)
 *   - mandates_capped speglar den bundna gränsen ärligt
 *
 * Körs: npx playwright test tests/mandate-maturity.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { loadPlatformTypeMaturity, MANDATE_MATURITY_SCAN_LIMIT } from '../lib/mandates/platform-maturity'
import { MANDATE_ALLOWED_TYPES } from '../lib/mandates/types'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// ─────────────────────────────────────────────────────────────────
// Fake Supabase — samma kö-per-.from()-mönster som tests/mission-
// mandate.spec.ts, calls konsumeras i den ordning implementationen gör dem.
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

function rowFor(result: Awaited<ReturnType<typeof loadPlatformTypeMaturity>>, type: string) {
  return result.per_type.find(r => r.action_type === type)!
}

function successCard(over: Partial<{
  approval_type: string
  autonomy_key: string
  mandate_id: string
  customer_id: string
  created_at: string
  resolved_at: string | null
}> = {}) {
  const v = {
    approval_type: 'invoice_reminder',
    autonomy_key: 'invoice_reminder',
    mandate_id: 'mnd_a',
    customer_id: 'cust_1',
    created_at: '2026-07-01T09:00:00.000Z',
    resolved_at: null as string | null,
    ...over,
  }
  return {
    approval_type: v.approval_type,
    status: 'auto_approved',
    created_at: v.created_at,
    resolved_at: v.resolved_at,
    payload: {
      mandate_id: v.mandate_id,
      autonomy_key: v.autonomy_key,
      customer_id: v.customer_id,
      execution_result: { outcome: 'success' },
    },
  }
}

function failedCard(over: Partial<{ approval_type: string; autonomy_key: string; mandate_id: string; created_at: string }> = {}) {
  const v = { approval_type: 'invoice_reminder', autonomy_key: 'invoice_reminder', mandate_id: 'mnd_a', created_at: '2026-07-02T09:00:00.000Z', ...over }
  return {
    approval_type: v.approval_type,
    status: 'auto_approved',
    created_at: v.created_at,
    resolved_at: null,
    payload: { mandate_id: v.mandate_id, autonomy_key: v.autonomy_key, execution_result: { outcome: 'failed' } },
  }
}

test.describe('loadPlatformTypeMaturity — fail-soft', () => {
  test('schema saknas på mission_mandate → tomt underlag för alla fyra typer, kastar aldrig', async () => {
    const { supabase, callCount } = fakeSupabase([fail('relation does not exist', '42P01')])
    const result = await loadPlatformTypeMaturity(supabase as any)
    expect(result.per_type.map(r => r.action_type).sort()).toEqual([...MANDATE_ALLOWED_TYPES].sort())
    for (const row of result.per_type) {
      expect(row.utforda).toBe(0)
      expect(row.leveransfel).toBe(0)
      expect(row.stopp_inom_7d).toBe(0)
      expect(row.ej_bedombart).toBe(0)
      expect(row.aterkallelser).toBe(0)
      expect(row.forsta_utford).toBeNull()
    }
    expect(result.mandates_scanned).toBe(0)
    expect(result.mandates_capped).toBe(false)
    expect(callCount()).toBe(1)
  })

  test('oväntat kastfel → tomt underlag, kastar aldrig', async () => {
    const supabase = { from() { throw new Error('boom') } }
    await expect(loadPlatformTypeMaturity(supabase as any)).resolves.toEqual(
      expect.objectContaining({ mandates_scanned: 0, mandates_capped: false }),
    )
  })

  test('inga mandat alls → tomt underlag, en enda fråga', async () => {
    const { supabase, callCount } = fakeSupabase([ok([])])
    const result = await loadPlatformTypeMaturity(supabase as any)
    expect(result.mandates_scanned).toBe(0)
    expect(callCount()).toBe(1)
  })

  test('ett mandats kortläsning failar → det mandatet hoppas över, resten av svepet fortsätter', async () => {
    const mandates = [
      { id: 'mnd_a', business_id: 'biz_1', allowed_action_types: ['invoice_reminder'], status: 'active', pause_reason: null, revoked_at: null, created_at: '2026-07-01T00:00:00.000Z' },
      { id: 'mnd_b', business_id: 'biz_2', allowed_action_types: ['review_request'], status: 'active', pause_reason: null, revoked_at: null, created_at: '2026-07-01T00:00:00.000Z' },
    ]
    const { supabase } = fakeSupabase([
      ok(mandates),
      fail('connection reset'), // mnd_a:s kortläsning failar
      ok([successCard({ approval_type: 'review_request', autonomy_key: 'review_request', mandate_id: 'mnd_b', customer_id: 'cust_9' })]), // mnd_b lyckas
      ok([]), // mnd_b:s opt-out-underlag (cust_9 kontaktad)
    ])
    const result = await loadPlatformTypeMaturity(supabase as any)
    expect(rowFor(result, 'invoice_reminder').utforda).toBe(0)
    expect(rowFor(result, 'review_request').utforda).toBe(1)
    expect(result.mandates_scanned).toBe(2)
  })
})

test.describe('loadPlatformTypeMaturity — aggregerar över flera mandat/företag', () => {
  test('två mandat, två företag: utforda/leveransfel summeras per typ separat', async () => {
    const mandates = [
      { id: 'mnd_a', business_id: 'biz_1', allowed_action_types: ['invoice_reminder'], status: 'active', pause_reason: null, revoked_at: null, created_at: '2026-07-01T00:00:00.000Z' },
      { id: 'mnd_b', business_id: 'biz_2', allowed_action_types: ['invoice_reminder', 'review_request'], status: 'revoked', pause_reason: null, revoked_at: '2026-08-01T00:00:00.000Z', created_at: '2026-07-05T00:00:00.000Z' },
    ]
    const { supabase, callCount } = fakeSupabase([
      ok(mandates),
      // mnd_a: ett lyckat invoice_reminder-utskick till cust_1
      ok([successCard({ mandate_id: 'mnd_a', customer_id: 'cust_1', created_at: '2026-07-10T09:00:00.000Z' })]),
      ok([]), // mnd_a opt-out-underlag: inget opt-out
      // mnd_b: ett lyckat review_request (cust_2) + ett misslyckat invoice_reminder (0 utforda för den typen)
      ok([
        successCard({ approval_type: 'review_request', autonomy_key: 'review_request', mandate_id: 'mnd_b', customer_id: 'cust_2', created_at: '2026-07-12T09:00:00.000Z' }),
        failedCard({ mandate_id: 'mnd_b', created_at: '2026-07-13T09:00:00.000Z' }),
      ]),
      ok([]), // mnd_b opt-out-underlag (cust_2 kontaktad, inget opt-out)
    ])

    const result = await loadPlatformTypeMaturity(supabase as any)

    const invoiceRow = rowFor(result, 'invoice_reminder')
    expect(invoiceRow.utforda).toBe(1) // bara mnd_a:s lyckade
    expect(invoiceRow.leveransfel).toBe(1) // mnd_b:s misslyckade
    expect(invoiceRow.stopp_inom_7d).toBe(0)
    expect(invoiceRow.ej_bedombart).toBe(0)
    // mnd_b är återkallat men hade 0 UTFÖRDA invoice_reminder → räknas INTE som säkerhetsåterkallelse för den typen.
    expect(invoiceRow.aterkallelser).toBe(0)
    expect(invoiceRow.forsta_utford).toBe('2026-07-10T09:00:00.000Z')

    const reviewRow = rowFor(result, 'review_request')
    expect(reviewRow.utforda).toBe(1)
    expect(reviewRow.leveransfel).toBe(0)
    // mnd_b är återkallat OCH hade ≥1 utförd review_request → räknas som en säkerhetsåterkallelse.
    expect(reviewRow.aterkallelser).toBe(1)
    expect(reviewRow.forsta_utford).toBe('2026-07-12T09:00:00.000Z')

    expect(rowFor(result, 'booking_reminder')).toEqual(
      expect.objectContaining({ utforda: 0, leveransfel: 0, aterkallelser: 0, forsta_utford: null }),
    )
    expect(rowFor(result, 'quote_followup_sms')).toEqual(
      expect.objectContaining({ utforda: 0, leveransfel: 0, aterkallelser: 0, forsta_utford: null }),
    )

    expect(result.mandates_scanned).toBe(2)
    expect(result.mandates_capped).toBe(false)
    expect(callCount()).toBe(5)
  })

  test('forsta_utford tar det TIDIGASTE lyckade utskicket över alla mandat för samma typ', async () => {
    const mandates = [
      { id: 'mnd_a', business_id: 'biz_1', allowed_action_types: ['invoice_reminder'], status: 'active', pause_reason: null, revoked_at: null, created_at: '2026-07-01T00:00:00.000Z' },
      { id: 'mnd_b', business_id: 'biz_2', allowed_action_types: ['invoice_reminder'], status: 'active', pause_reason: null, revoked_at: null, created_at: '2026-07-01T00:00:00.000Z' },
    ]
    const { supabase } = fakeSupabase([
      ok(mandates),
      ok([successCard({ mandate_id: 'mnd_a', customer_id: 'cust_1', created_at: '2026-07-20T09:00:00.000Z' })]),
      ok([]),
      ok([successCard({ mandate_id: 'mnd_b', customer_id: 'cust_2', created_at: '2026-07-05T09:00:00.000Z' })]), // TIDIGARE
      ok([]),
    ])
    const result = await loadPlatformTypeMaturity(supabase as any)
    expect(rowFor(result, 'invoice_reminder').forsta_utford).toBe('2026-07-05T09:00:00.000Z')
  })

  test('STOPP inom 7 dagar räknas ihop över mandat, via kundens faktiska opt-out-rad', async () => {
    const mandates = [
      { id: 'mnd_a', business_id: 'biz_1', allowed_action_types: ['invoice_reminder'], status: 'active', pause_reason: null, revoked_at: null, created_at: '2026-07-01T00:00:00.000Z' },
    ]
    const { supabase } = fakeSupabase([
      ok(mandates),
      ok([successCard({ mandate_id: 'mnd_a', customer_id: 'cust_1', created_at: '2026-07-10T09:00:00.000Z' })]),
      ok([{ customer_id: 'cust_1', sms_opt_out: true, sms_opt_out_at: '2026-07-13T09:00:00.000Z' }]), // 3 dagar efter
    ])
    const result = await loadPlatformTypeMaturity(supabase as any)
    expect(rowFor(result, 'invoice_reminder').stopp_inom_7d).toBe(1)
  })

  test('ej_bedombart: lyckat utskick utan customer_id räknas aldrig som "rent"', async () => {
    const mandates = [
      { id: 'mnd_a', business_id: 'biz_1', allowed_action_types: ['invoice_reminder'], status: 'active', pause_reason: null, revoked_at: null, created_at: '2026-07-01T00:00:00.000Z' },
    ]
    const cardNoCustomer = successCard({ mandate_id: 'mnd_a' })
    delete (cardNoCustomer.payload as any).customer_id
    const { supabase } = fakeSupabase([ok(mandates), ok([cardNoCustomer])])
    const result = await loadPlatformTypeMaturity(supabase as any)
    const row = rowFor(result, 'invoice_reminder')
    expect(row.utforda).toBe(1)
    expect(row.ej_bedombart).toBe(1)
  })

  test('mandates_capped: sant när svepet träffar gränsen, falskt annars', async () => {
    const many = Array.from({ length: 2 }, (_, i) => ({
      id: `mnd_${i}`, business_id: `biz_${i}`, allowed_action_types: ['invoice_reminder'] as const,
      status: 'active', pause_reason: null, revoked_at: null, created_at: '2026-07-01T00:00:00.000Z',
    }))
    const responses: FakeResponse[] = [ok(many)]
    for (let i = 0; i < many.length; i++) responses.push(ok([])) // varje mandats (tomma) kortsvep
    const { supabase } = fakeSupabase(responses)
    const result = await loadPlatformTypeMaturity(supabase as any, { limit: 2 })
    expect(result.mandates_scanned).toBe(2)
    expect(result.mandates_capped).toBe(true)
  })
})

test.describe('MANDATE_MATURITY_SCAN_LIMIT', () => {
  test('är ett positivt, förnuftigt bundet tak', () => {
    expect(MANDATE_MATURITY_SCAN_LIMIT).toBeGreaterThan(0)
    expect(MANDATE_MATURITY_SCAN_LIMIT).toBeLessThanOrEqual(2000)
  })
})

// ─────────────────────────────────────────────────────────────────
// Källskanning — platform-maturity.ts
// ─────────────────────────────────────────────────────────────────

test.describe('lib/mandates/platform-maturity.ts — källskanning', () => {
  const kalla = read('lib/mandates/platform-maturity.ts')

  test('återanvänder den rena kärnan byggMandateFacit, duplicerar inte räkningen', () => {
    expect(kalla).toContain('byggMandateFacit')
    expect(kalla).toContain("from './mandate-facit'")
  })

  test('fail-soft: använder arSchemaSaknas genomgående', () => {
    expect(kalla).toContain('arSchemaSaknas')
  })

  test('skriver aldrig i mission_mandate (rent läsande instrument)', () => {
    expect(kalla).not.toMatch(/mission_mandate'\)[\s\S]{0,120}\.(insert|update|delete)\(/)
  })

  test('refererar aldrig den förbjudna exekveringsspegeln', () => {
    expect(kalla).not.toContain('executeApprovalPayloadInternal')
  })
})

// ─────────────────────────────────────────────────────────────────
// Källskanning — GET /api/admin/mandate-maturity
// ─────────────────────────────────────────────────────────────────

test.describe('app/api/admin/mandate-maturity/route.ts — källskanning (ask-coverage-idiomet, Etapp L)', () => {
  const kalla = read('app/api/admin/mandate-maturity/route.ts')

  test('gated med isAdmin, samma idiom som admin/ask-coverage', () => {
    expect(kalla).toContain("from '@/lib/admin-auth'")
    expect(kalla).toContain('isAdmin(')
    expect(kalla).toContain('getAdminSupabase(')
  })

  test('force-dynamic satt (instrumentet får aldrig cachas statiskt)', () => {
    expect(kalla).toContain("export const dynamic = 'force-dynamic'")
  })

  test('nekar med 403 när isAdmin är falskt', () => {
    expect(kalla).toMatch(/isAdmin[\s\S]{0,40}status:\s*403|status:\s*403/)
    expect(kalla).toContain('403')
  })

  test('bygger på bedomTypMognad och loadPlatformTypeMaturity, inte en egen mätning', () => {
    expect(kalla).toContain('bedomTypMognad')
    expect(kalla).toContain('loadPlatformTypeMaturity')
  })

  test('svaret bär en not om de tre öppningslåsen (mogen + ägarbeslut + migration)', () => {
    expect(kalla).toContain('mogen')
    expect(kalla).toContain('migration')
  })

  test('kräver aldrig owner-admin/hasPermission — samma plattformsövergripande isAdmin-mönster som ask-coverage, INTE permission-contract-kartans owner-admin', () => {
    expect(kalla).not.toContain('isOwnerOrAdmin')
    expect(kalla).not.toContain('hasPermission')
    expect(kalla).not.toContain('getAuthenticatedBusiness')
  })
})
