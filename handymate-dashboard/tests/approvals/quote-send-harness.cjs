// Executes the actual send route and pure envelope with an isolated DB and
// provider adapters. No environment credentials or live network are exposed.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const ts = require('typescript'), assert = require('node:assert/strict')
let state
function reset(overrides = {}) {
  state = {
    authenticated: true, permitted: true, role: 'owner', writes: [], reads: [], sends: [], portals: 0,
    quote: { quote_id: 'q', business_id: 'b', customer_id: 'c', created_by: 'creator', title: 'Badrum', total: 12500, sign_token: 'sign', valid_until: '2026-10-01' },
    customer: { customer_id: 'c', business_id: 'b', name: 'Test Kund', email: 'customer@example.test', phone_number: '+46700000000' },
    business: { business_id: 'b', business_name: 'Testbolag', contact_email: 'office@example.test', phone_number: '+46700000001' },
    gmail: 'disabled', sms: true, resend: 'accepted', statusError: false, statusMissing: false, activityError: false,
    ...overrides,
  }
}
const db = { from(table) {
  let op = 'read', values, filters = [], single = false
  const c = new Proxy({}, { get(_, key) {
    if (key === 'then') return resolve => {
      const log = { table, op, values, filters }; state[op === 'read' ? 'reads' : 'writes'].push(log)
      if (op !== 'insert') assert(filters.some(([k,v]) => k === 'business_id' && v === 'b'), `${table} needs business scope`)
      const row = table === 'quotes' ? state.quote : table === 'customer' ? state.customer : table === 'business_config' ? state.business : table === 'business_users' ? { id: 'creator', business_id: 'b', name: 'Creator', email: 'creator@example.test' } : null
      const matches = row && filters.every(([k,v]) => row[k] === v)
      if (table === 'business_config' && state.businessError) return resolve({ data: null, error: { message: 'config unavailable' } })
      if (table === 'quotes' && values?.sign_token && state.tokenError) return resolve({ data: [], error: { message: 'token failed' } })
      if (op === 'read') return resolve({ data: matches ? structuredClone(row) : null, error: null })
      if (table === 'quotes' && values.status === 'sent' && state.statusError) return resolve({ data: null, error: { message: 'status failed' } })
      if (table === 'quotes' && values.status === 'sent' && state.statusMissing) return resolve({ data: [], error: null })
      if (table === 'customer_activity' && state.activityError) return resolve({ data: null, error: { message: 'activity failed' } })
      if (op === 'update' && matches) Object.assign(row, values)
      return resolve({ data: single ? row : matches ? [row] : [], error: null })
    }
    return (...args) => { if (key === 'eq' || key === 'is') filters.push(args); if (key === 'single' || key === 'maybeSingle') single = true; if (key === 'insert' || key === 'update') { op = key; values = args[0] }; return c }
  } }); return c
} }
const cache = {}
function load(file) {
  file = path.resolve(file); if (cache[file]) return cache[file]
  const mod = { exports: {} }; cache[file] = mod.exports
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  vm.runInNewContext(code, {
    module: mod, exports: mod.exports, Buffer, URL, Date, console: { ...console, error() {} }, crypto: require('node:crypto').webcrypto,
    process: { env: { RESEND_API_KEY: 'fake', NEXT_PUBLIC_APP_URL: 'https://app.example.test' } },
    fetch: async (url, init) => {
      assert.equal(url, 'https://api.resend.com/emails'); state.sends.push({ provider: 'resend', ...JSON.parse(init.body) })
      if (state.resend === 'throw') throw Error('lost response')
      return Response.json(state.resend === 'accepted' ? { id: 'm-resend' } : {}, { status: state.resend === 'rejected' ? 422 : 200 })
    },
    require(name) {
      if (name === 'next/server') return { NextResponse: Response }
      if (name === '@/lib/supabase') return { getServerSupabase: () => db }
      if (name === '@/lib/auth') return { getAuthenticatedBusiness: async () => state.authenticated ? { ...state.business } : null }
      if (name === '@/lib/permissions') return { getCurrentUser: async () => ({ id: 'u', role: state.role, business_id: 'b' }), hasPermission: () => state.permitted }
      if (name === '@/lib/rate-limit-db') return { checkSmsRateLimitDb: async () => ({ allowed: true }), checkEmailRateLimitDb: async () => ({ allowed: true }) }
      if (name === '@/lib/portal-link') return { getOrCreatePortalLink: async () => { state.portals++; return 'https://app.example.test/portal/prepared' } }
      if (name === '@/lib/notifications/approval-push') return { sendApprovalPush: async () => {} }
      if (name === '@/lib/sms-send') return { sendSmsViaElks: async args => { state.sends.push({ provider: 'sms', ...args }); return { success: state.sms, error: state.sms ? undefined : 'SMS avvisat' } } }
      if (name === '@/lib/gmail-send') return {
        isGmailSendEnabled: async () => ({ enabled: state.gmail !== 'disabled', email: 'gmail@example.test' }),
        sendViaGmail: async (_id, args) => { state.sends.push({ provider: 'gmail', ...args }); if (state.gmail === 'throw') throw Error('lost response'); return state.gmail === 'accepted' },
      }
      if (name === '@/lib/pipeline') return { getAutomationSettings: async () => ({}), ensureDealForQuote: async () => { if (state.pipelineError) throw Error('pipeline unavailable'); return null } }
      if (name === '@/lib/automation-engine') return { fireEvent: async () => { if (state.automationError) throw Error('automation unavailable') } }
      if (name.startsWith('node:')) return require(name)
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts')
      if (name.startsWith('./') || name.startsWith('../')) return load(path.resolve(path.dirname(file), name + '.ts'))
      throw Error('Unexpected dependency: ' + name)
    },
  }); cache[file] = mod.exports; return mod.exports
}
const route = load('app/api/quotes/send/route.ts')
const { quoteRecipients, buildQuoteDeliveryEnvelope } = load('lib/quotes/delivery-envelope.ts')
const send = async (body = {}) => { const response = await route.POST({ json: async () => ({ quoteId: 'q', method: 'email', ...body }) }); return { status: response.status, ...await response.json() } }
let checks = 0
async function check(name, run) { reset(); await run(); checks++; console.log('PASS ' + name) }
;(async () => {
  await check('auth and permission denial have zero effects', async () => { state.authenticated = false; assert.equal((await send()).status, 401); state.authenticated = true; state.permitted = false; assert.equal((await send()).status, 403); assert.equal(state.writes.length + state.sends.length, 0) })
  await check('other business quote denied even with shared contact email', async () => { state.quote.business_id = 'other'; assert.equal((await send()).status, 404); assert.equal(state.writes.length + state.sends.length + state.portals, 0) })
  await check('foreign customer denied before links or sends', async () => { state.customer.business_id = 'other'; assert.equal((await send()).status, 400); assert.equal(state.writes.length + state.sends.length + state.portals, 0) })
  await check('both channels validated before sending first SMS', async () => { state.customer.email = null; assert.equal((await send({ method: 'both' })).status, 400); assert.equal(state.writes.length + state.sends.length + state.portals, 0) })
  await check('unreadable approval policy fails closed before delivery', async () => { state.businessError = true; assert.equal((await send()).status, 500); assert.equal(state.writes.length + state.sends.length + state.portals, 0) })
  await check('invalid financial underlay is rejected before token or approval creation', async () => { state.quote.total = null; state.quote.sign_token = null; assert.equal((await send()).status, 400); assert.equal(state.writes.length + state.sends.length + state.portals, 0) })
  await check('four-eyes request preserves normalized choices without sending', async () => { state.role = 'project_manager'; state.business.four_eyes_enabled = true; state.business.four_eyes_threshold_sek = 100; const r = await send({ bccEmails: [' hidden@example.test '] }); assert.equal(r.requires_approval, true); assert.equal(state.sends.length + state.portals, 0); assert.deepEqual(Array.from(state.writes.find(w => w.table === 'pending_approvals').values.payload.bcc_emails), ['hidden@example.test']) })
  await check('failed signing-token persistence cannot leak an unusable link', async () => { state.quote.sign_token = null; state.tokenError = true; assert.equal((await send()).status, 409); assert.equal(state.sends.length + state.portals, 0) })
  await check('invalid, duplicate and injected copy recipients rejected before effects', async () => {
    for (const body of [{ bccEmails: ['bad'] }, { bccEmails: ['CUSTOMER@example.test'] }, { extraEmails: 'x@example.test' }, { extraEmails: ['x@example.test\r\nBcc: y@example.test'] }, { method: 'sms', bccEmails: ['x@example.test'] }, { method: {} }]) assert.equal((await send(body)).status, 400)
    assert.equal(state.writes.length + state.sends.length + state.portals, 0)
  })
  await check('exact normalized To/BCC and shared branded envelope reach Resend', async () => {
    const result = await send({ extraEmails: [' copy@example.test '], bccEmails: [' hidden@example.test '] })
    assert.equal(result.receipt.state, 'sent'); const delivered = state.sends[0]
    assert.deepEqual(delivered.to, ['customer@example.test', 'copy@example.test']); assert.deepEqual(delivered.bcc, ['hidden@example.test'])
    assert.equal(delivered.reply_to, 'office@example.test'); assert(delivered.html.includes('Badrum')); assert(delivered.html.includes('Creator')); assert(delivered.html.includes('https://app.example.test/portal/prepared'))
    assert(state.reads.some(r => r.table === 'business_users')); assert.equal(state.quote.status, 'sent')
  })
  for (const gmail of ['unconfirmed', 'throw']) await check(`Gmail ${gmail} never falls back to Resend`, async () => { state.gmail = gmail; const result = await send(); assert.equal(result.status, 500); assert.equal(result.receipt.state, 'unknown'); assert.equal(state.sends.length, 1); assert.equal(state.sends[0].provider, 'gmail'); assert.match(result.error, /kontrollera Gmail/i); assert.equal(state.quote.status, undefined) })
  await check('Gmail success is reported without second email', async () => { state.gmail = 'accepted'; const r = await send(); assert.equal(r.receipt.state, 'sent'); assert.equal(state.sends.length, 1) })
  for (const resend of ['missing-id', 'throw', 'rejected']) await check(`Resend ${resend} is not a success receipt`, async () => { state.resend = resend; const r = await send(); assert.equal(r.status, 500); assert.equal(r.emailSent, false); assert.equal(state.quote.status, undefined); assert.match(r.error, /innan du försöker igen/) })
  await check('mixed channel outcome gives partial receipt, not generic success toast', async () => { state.gmail = 'unconfirmed'; const r = await send({ method: 'both' }); assert.equal(r.receipt.state, 'partial'); assert.equal(r.smsSent, true); assert.equal(r.emailSent, false); assert.equal(r.message, r.receipt.text); assert.equal(r.warning, r.receipt.text); assert.equal(state.sends.length, 2) })
  for (const failure of ['statusError', 'statusMissing', 'activityError', 'pipelineError', 'automationError']) await check(`${failure} stays visible after accepted send`, async () => { state[failure] = true; const r = await send(); assert.equal(r.status, 200); assert.equal(r.emailSent, true); assert.equal(r.receipt.state, 'partial'); assert.equal(state.sends.length, 1) })
  await check('financial and sender validation rejects misleading envelope', async () => {
    const input = { quote: { ...state.quote, customer: state.customer }, business: state.business, recipients: quoteRecipients(state.customer, 'email'), portalUrl: 'https://example.test', pdfUrl: 'https://example.test/pdf' }
    for (const total of [null, '', false, -1, 'n/a']) assert.throws(() => buildQuoteDeliveryEnvelope({ ...input, quote: { ...input.quote, total } }))
    assert.throws(() => buildQuoteDeliveryEnvelope({ ...input, quote: { ...input.quote, rot_rut_type: 'rot', customer_pays: null } }))
    assert.throws(() => buildQuoteDeliveryEnvelope({ ...input, quote: { ...input.quote, valid_until: 'invalid' } }))
    assert.throws(() => buildQuoteDeliveryEnvelope({ ...input, business: { ...input.business, contact_email: 'ok@example.test\r\nBcc: injected@example.test' } }))
    assert.throws(() => quoteRecipients(state.customer, { toString: () => 'email' }))
  })
  console.log(`PASS ${checks} quote route/envelope scenarios (isolated providers; not full signed quote review or device proof).`)
})().catch(error => { console.error(error); process.exitCode = 1 })
