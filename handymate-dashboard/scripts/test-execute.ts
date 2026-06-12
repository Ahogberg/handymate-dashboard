/**
 * Enhetstester för lib/approvals/execute.ts (execution-chain Steg 2).
 *
 * Mockad supabase (chainable thenable) + injicerade lib-deps → ingen DB,
 * inget nätverk. Täcker alla reason-grenar (ok/fail/four_eyes_required/
 * permission_denied/rate_limited) + paritetstabell per approval_type.
 *
 * Körning:  npx tsx scripts/test-execute.ts   (exit 0 = grönt)
 * Samma mönster som scripts/test-patterns.ts.
 */

import { executeApproval, type ExecuteDeps, type Actor } from '../lib/approvals/execute'

let passed = 0
let failed = 0
function assert(cond: boolean, label: string, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.log(`  ✗ ${label}${detail ? '  — ' + detail : ''}`) }
}
function section(name: string) { console.log(`\n=== ${name} ===`) }

// ─────────────────────────────────────────────────────────────────
// Mock supabase — chainable, thenable. resolver(table, ops, args) → {data,error}
// ─────────────────────────────────────────────────────────────────
type Canned = { data?: any; error?: any }
function mockSb(resolver: (table: string, ops: string[], args: any[][]) => Canned): any {
  function makeBuilder(table: string) {
    const ops: string[] = []
    const args: any[][] = []
    const proxy: any = new Proxy(function () {}, {
      get(_t, prop: string | symbol) {
        if (prop === 'then') {
          const res = resolver(table, ops, args)
          return (onF: any) => Promise.resolve(res).then(onF)
        }
        return (...a: any[]) => { ops.push(String(prop)); args.push(a); return proxy }
      },
    })
    return proxy
  }
  return { from: (table: string) => makeBuilder(table) }
}

function selectArg(ops: string[], args: any[][]): string {
  const i = ops.indexOf('select')
  return i >= 0 && args[i] ? String(args[i][0] ?? '') : ''
}

// ─────────────────────────────────────────────────────────────────
// Standard-deps (alla lyckas) — överrid per test
// ─────────────────────────────────────────────────────────────────
function deps(over: Partial<ExecuteDeps> = {}): ExecuteDeps {
  return {
    sendInvoice: (async () => ({ email: true, errors: [] })) as any,
    sendQuote: (async () => ({ status: 200, body: { success: true, message: 'ok' } })) as any,
    createBooking: (async () => ({ status: 200, body: { booking: { booking_id: 'b1' } } })) as any,
    sendSms: (async () => ({ success: true, smsId: 's1', elksId: 'e1' })) as any,
    ...over,
  }
}

const SYSTEM: Actor = { kind: 'system', reason: 'auto_approve' }
const OWNER: Actor = { kind: 'user', user: { role: 'owner', name: 'Ägare', can_create_invoices: true } as any }
const EMP_NO_INV: Actor = { kind: 'user', user: { role: 'employee', name: 'Anställd', can_create_invoices: false } as any }
const EMP_INV: Actor = { kind: 'user', user: { role: 'employee', name: 'Anställd2', can_create_invoices: true } as any }

const BIZ = 'biz_test'
function input(approval_type: string, payload: any, actor: Actor, supabase: any): any {
  return { approval: { approval_type, payload, business_id: BIZ }, businessId: BIZ, actor, supabase }
}

// business_config-resolver-helper (delas): four-eyes-config / full / business_name
function bcResolver(fourEyes: { enabled?: boolean; threshold?: number } | null) {
  return (table: string, ops: string[], args: any[][]): Canned => {
    if (table === 'business_config') {
      const sel = selectArg(ops, args)
      if (sel.includes('four_eyes')) return { data: fourEyes ? { four_eyes_enabled: fourEyes.enabled, four_eyes_threshold_sek: fourEyes.threshold } : {} }
      if (sel === '*') return { data: { business_id: BIZ, user_id: 'u1', business_name: 'Bee' } }
      return { data: { business_name: 'Bee' } } // business_name
    }
    if (table === 'quotes') return { data: { quote_id: 'q1', total: 75000, subtotal: 75000, business_id: BIZ, title: 'Stor offert', sign_token: 't' } }
    if (table === 'pending_approvals') return { error: null }
    return { data: null, error: null }
  }
}

async function run() {
  // ════════════════════════════════════════════════════════════════
  section('1. reason: ok')
  {
    // send_invoice, system, sendInvoice → email:true
    const r = await executeApproval(input('send_invoice', { invoice_id: 'inv1' }, SYSTEM, mockSb(() => ({ data: null }))), deps())
    assert(r.ok === true && !r.reason, 'send_invoice (email skickat) → ok', JSON.stringify(r))

    // send_quote, system, four-eyes AV, sendQuote success
    const r2 = await executeApproval(input('send_quote', { quote_id: 'q1', method: 'sms' }, SYSTEM, mockSb(bcResolver({ enabled: false }))), deps())
    assert(r2.ok === true, 'send_quote (four-eyes av) → ok', JSON.stringify(r2))

    // create_booking
    const r3 = await executeApproval(input('create_booking', { scheduled_start: '2026-07-01T10:00:00Z' }, SYSTEM, mockSb(() => ({ data: { business_id: BIZ, user_id: 'u1' } }))), deps())
    assert(r3.ok === true, 'create_booking → ok', JSON.stringify(r3))

    // send_sms
    const r4 = await executeApproval(input('send_sms', { to: '+46700000000', message: 'Hej' }, SYSTEM, mockSb(() => ({ data: { business_name: 'Bee' } }))), deps())
    assert(r4.ok === true && (r4.metadata as any)?.sms_sent === true, 'send_sms → ok', JSON.stringify(r4))

    // ack-typ
    const r5 = await executeApproval(input('profitability_warning', {}, SYSTEM, mockSb(() => ({ data: null }))), deps())
    assert(r5.ok === true && (r5.metadata as any)?.acknowledged === true, 'profitability_warning → ok (acknowledged)', JSON.stringify(r5))
  }

  // ════════════════════════════════════════════════════════════════
  section('2. reason: fail')
  {
    // send_invoice: inget skickades (errors, ingen kanal) → fail (GATE PÅ SUCCESS)
    const r = await executeApproval(input('send_invoice', { invoice_id: 'inv1' }, SYSTEM, mockSb(() => ({ data: null }))),
      deps({ sendInvoice: (async () => ({ errors: ['Resend nere'] })) as any }))
    assert(r.ok === false && r.reason === 'fail', 'send_invoice (inget skickat) → fail', JSON.stringify(r))

    // send_invoice: notFound → fail
    const r2 = await executeApproval(input('send_invoice', { invoice_id: 'x' }, SYSTEM, mockSb(() => ({ data: null }))),
      deps({ sendInvoice: (async () => ({ errors: [], notFound: true })) as any }))
    assert(r2.ok === false && r2.reason === 'fail' && /not found/i.test(r2.error || ''), 'send_invoice (notFound) → fail', JSON.stringify(r2))

    // saknat invoice_id → fail
    const r3 = await executeApproval(input('send_invoice', {}, SYSTEM, mockSb(() => ({ data: null }))), deps())
    assert(r3.ok === false && r3.reason === 'fail', 'send_invoice utan invoice_id → fail', JSON.stringify(r3))

    // send_sms utan to/message → fail
    const r4 = await executeApproval(input('send_sms', {}, SYSTEM, mockSb(() => ({ data: { business_name: 'Bee' } }))), deps())
    assert(r4.ok === false && r4.reason === 'fail', 'send_sms utan to/message → fail', JSON.stringify(r4))
  }

  // ════════════════════════════════════════════════════════════════
  section('3. reason: four_eyes_required (KRITISK)')
  {
    // system + four-eyes PÅ + offert 75k > 50k → four_eyes_required, skickar EJ
    let sendQuoteCalled: boolean = false
    const r = await executeApproval(
      input('send_quote', { quote_id: 'q1', method: 'both' }, SYSTEM, mockSb(bcResolver({ enabled: true, threshold: 50000 }))),
      deps({ sendQuote: (async () => { sendQuoteCalled = true; return { status: 200, body: { success: true } } }) as any }),
    )
    assert(r.ok === false && r.reason === 'four_eyes_required', 'system >50k → four_eyes_required', JSON.stringify(r))
    assert((r.metadata as any)?.new_approval_id != null, 'four_eyes skapade ny approval (new_approval_id)', JSON.stringify(r.metadata))
    assert(sendQuoteCalled === false, 'four_eyes → sendQuote anropades ALDRIG (skickar ej)', `called=${sendQuoteCalled}`)

    // owner + four-eyes PÅ + 75k → HOPPAR four-eyes (owner skips) → skickar → ok
    let ownerSent: boolean = false
    const r2 = await executeApproval(
      input('send_quote', { quote_id: 'q1', method: 'both' }, OWNER, mockSb(bcResolver({ enabled: true, threshold: 50000 }))),
      deps({ sendQuote: (async () => { ownerSent = true; return { status: 200, body: { success: true } } }) as any }),
    )
    assert(r2.ok === true && ownerSent, 'owner >50k → four-eyes hoppas, skickar (ok)', JSON.stringify(r2))
  }

  // ════════════════════════════════════════════════════════════════
  section('4. reason: permission_denied')
  {
    // employee utan create_invoices + send_invoice → permission_denied (sendInvoice ej anropad)
    let invCalled: boolean = false
    const r = await executeApproval(input('send_invoice', { invoice_id: 'inv1' }, EMP_NO_INV, mockSb(() => ({ data: null }))),
      deps({ sendInvoice: (async () => { invCalled = true; return { email: true, errors: [] } }) as any }))
    assert(r.ok === false && r.reason === 'permission_denied', 'employee utan create_invoices + send_invoice → permission_denied', JSON.stringify(r))
    assert(invCalled === false, 'permission_denied → sendInvoice anropades ALDRIG', `called=${invCalled}`)

    // send_quote samma gate
    const r2 = await executeApproval(input('send_quote', { quote_id: 'q1' }, EMP_NO_INV, mockSb(bcResolver({ enabled: false }))), deps())
    assert(r2.ok === false && r2.reason === 'permission_denied', 'employee utan create_invoices + send_quote → permission_denied', JSON.stringify(r2))

    // employee MED create_invoices → släpps förbi gaten (→ ok)
    const r3 = await executeApproval(input('send_invoice', { invoice_id: 'inv1' }, EMP_INV, mockSb(() => ({ data: null }))), deps())
    assert(r3.ok === true, 'employee MED create_invoices → släpps förbi gaten (ok)', JSON.stringify(r3))
  }

  // ════════════════════════════════════════════════════════════════
  section('5. reason: rate_limited')
  {
    // sendSms returnerar 46elks 429 → rate_limited
    const r = await executeApproval(input('send_sms', { to: '+46700000000', message: 'Hej' }, SYSTEM, mockSb(() => ({ data: { business_name: 'Bee' } }))),
      deps({ sendSms: (async () => ({ success: false, status: 429, error: 'rate limited' })) as any }))
    assert(r.ok === false && r.reason === 'rate_limited', 'send_sms 46elks 429 → rate_limited', JSON.stringify(r))
  }

  // ════════════════════════════════════════════════════════════════
  section('6. unhandled-typ → fallback-signal')
  {
    const r = await executeApproval(input('dispatch_suggestion', { member_id: 'm1' }, SYSTEM, mockSb(() => ({ data: null }))), deps())
    assert(r.ok === false && (r.metadata as any)?.unhandled === true, 'okänd/oportad typ → metadata.unhandled (Steg 3 faller tillbaka)', JSON.stringify(r))
  }

  // ════════════════════════════════════════════════════════════════
  section('7. paritetstabell per approval_type (execute.ts vs gamla switchen)')
  {
    type Row = { type: string; handler: string; parity: string }
    const table: Row[] = [
      { type: 'send_invoice', handler: 'sendInvoice (lib)', parity: 'gate på success (gamla: classifyResponse) — avsiktligt striktare' },
      { type: 'review_auto_invoice', handler: 'sendInvoice (lib, tvingar email+sms)', parity: 'samma som send_invoice, gate på success' },
      { type: 'send_quote', handler: 'four-eyes + sendQuote (lib)', parity: 'four-eyes identisk; send via lib istället för 404:ande fetch' },
      { type: 'create_booking', handler: 'createBooking (lib)', parity: 'lib istället för fetch /api/bookings' },
      { type: 'send_sms / quote_nudge / customer_reactivation / send_matte_customer_reply', handler: 'sendSmsViaElks', parity: 'identisk (gamla switchen gjorde redan sendSmsViaElks)' },
      { type: 'profitability_warning / low_stock_alert / create_invoice_from_report', handler: 'ack {ok:true}', parity: 'identisk (acknowledged)' },
      { type: 'ÖVRIGA (dispatch/time_attestation/seasonal/job_report/ai-draft/autopilot/lead_review/four_eyes_*/price_adjustment...)', handler: 'unhandled-signal', parity: 'EJ portad än → Steg 3 faller tillbaka på gamla switchen (migrationsplan §4 steg 3)' },
    ]
    for (const r of table) console.log(`  • ${r.type}\n      handler: ${r.handler}\n      paritet: ${r.parity}`)
    console.log('\n  Notering: execute.ts gate:ar ok PÅ FAKTISK success (refaktorns syfte). Gamla switchen via classifyResponse kunde returnera ok=true även när inget skickades (silent-failure-buggen) — den skillnaden är AVSIKTLIG, inte en regression.')
  }

  // ── Resultat ──
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run().catch(err => { console.error('Test-fel:', err); process.exit(1) })
