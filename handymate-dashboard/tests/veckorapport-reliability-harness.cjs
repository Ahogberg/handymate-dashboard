// Kör den riktiga cron-rutten med minnes-DB och mockad SMS-provider.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const assert = require('node:assert/strict')

const root = path.resolve(__dirname, '..')
let rows, sends, outcomes, errors, configs, pending

function reset() {
  rows = new Map()
  sends = []
  outcomes = []
  errors = {}
  configs = [{ business_id: 'b1', business_name: 'Firman', phone_number: '+46701111111', agents_globally_paused: false }]
  pending = []
}

function db() {
  return { from(table) {
    let op = 'select', values, filters = [], contains = [], single = false
    const chain = new Proxy({}, { get(_, key) {
      if (key === 'then') return resolve => {
        const tableError = errors[`${table}:${op}`] || errors[table]
        if (tableError) return resolve({ data: null, error: { message: tableError, code: 'XX000' } })
        const matches = row => filters.every(([k, v]) => row?.[k] === v)
          && contains.every(([k, v]) => Object.entries(v).every(([mk, mv]) => row?.[k]?.[mk] === mv))
        if (table === 'business_config') return resolve({ data: configs.filter(matches), error: null })
        if (table === 'pending_approvals') return resolve({ data: pending.filter(matches), error: null })
        if (table !== 'automation_activity') throw Error(`Unexpected table ${table}`)
        if (op === 'insert') {
          if (values.id && rows.has(values.id)) return resolve({ data: null, error: { message: 'duplicate', code: '23505' } })
          if (values.automation_type === 'veckorapport' && errors.audit) return resolve({ data: null, error: { message: errors.audit, code: 'XX000' } })
          const id = values.id || `audit-${rows.size + 1}`
          rows.set(id, structuredClone({ ...values, id }))
          return resolve({ data: null, error: null })
        }
        let found = [...rows.values()].filter(matches)
        if (op === 'update') {
          for (const row of found) Object.assign(row, structuredClone(values))
          return resolve({ data: found.map(r => ({ id: r.id })), error: null })
        }
        return resolve({ data: single ? (found[0] || null) : found, error: null })
      }
      return (...args) => {
        if (key === 'insert' || key === 'update') { op = key; values = args[0] }
        if (key === 'eq') filters.push(args)
        if (key === 'contains') contains.push(args)
        if (key === 'maybeSingle') single = true
        return chain
      }
    } })
    return chain
  } }
}

let currentDb
const mod = { exports: {} }
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'app/api/cron/veckorapport/route.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText
const req = name => {
  if (name === 'next/server') return { NextResponse: { json: (data, init) => Response.json(data, init) } }
  if (name === '@/lib/cron/verify-secret') return { verifyCronSecret: () => true }
  if (name === '@/lib/supabase') return { getServerSupabase: () => currentDb }
  if (name === '@/lib/billing/aktiva-konton') return { hamtaKontonMedAktivtTeam: async () => [{ business_id: 'b1' }] }
  if (name === '@/lib/weekly-value') return { getWeeklyValue: async () => ({ confirmed_kr: 100, confirmed_items: [{ label: 'Betalt', amount: 100 }], calls_captured: 0 }) }
  if (name === '@/lib/rapport/veckorapport') return { byggVeckorapportSms: () => 'Veckans bevis', harVeckobevis: () => true, isoVeckaNyckel: () => '2026-W37' }
  if (name === '@/lib/sms-send') return { sendSmsViaElks: async args => { sends.push(args); return outcomes.shift() } }
  if (name === '@/lib/notifications/tyst-tid') return { arTystTid: () => false }
  throw Error(`Unexpected import ${name}`)
}
vm.runInNewContext(code, { module: mod, exports: mod.exports, require: req, console, crypto, Response, Date }, { filename: 'veckorapport/route.ts' })
const request = {}
const run = async () => { currentDb = db(); const res = await mod.exports.GET(request); return { res, body: await res.json() } }

;(async () => {
  reset(); configs[0].agents_globally_paused = true
  let r = await run(); assert.equal(sends.length, 0); assert.equal(r.body.resultat[0].utfall, 'pausad')

  reset(); errors.business_config = 'config down'
  r = await run(); assert.equal(r.res.status, 500); assert.equal(sends.length, 0)

  reset(); errors.pending_approvals = 'pending down'
  r = await run(); assert.equal(r.res.status, 500); assert.equal(sends.length, 0)

  reset(); errors['automation_activity:select'] = 'dedupe down'
  r = await run(); assert.equal(r.body.resultat[0].utfall, 'dedupe_fel'); assert.equal(sends.length, 0)

  reset(); outcomes = [{ success: true, status: 200, elksId: 'e-concurrent' }]
  const [a, b] = await Promise.all([run(), run()])
  assert.equal(sends.length, 1, 'atomisk PK-reservation stoppar samtidiga utskick')
  assert.deepEqual([a.body.resultat[0].utfall, b.body.resultat[0].utfall].sort(), ['dedupe', 'skickad'])

  reset(); outcomes = [{ success: false, status: 403, error: 'saldo' }, { success: true, status: 200, elksId: 'e-retry' }]
  assert.equal((await run()).body.resultat[0].utfall, 'misslyckad')
  assert.equal((await run()).body.resultat[0].utfall, 'skickad')
  assert.equal(sends.length, 2, 'explicit provideravslag får retry')

  reset(); outcomes = [{ success: false, status: null, error: 'timeout' }]
  await run(); r = await run()
  assert.equal(r.body.resultat[0].utfall, 'leverans_osaker'); assert.equal(sends.length, 1, 'okänt providersvar får aldrig omsändas')

  reset(); outcomes = [{ success: false, status: 500, error: 'provider down' }]
  await run(); r = await run()
  assert.equal(r.body.resultat[0].utfall, 'leverans_osaker'); assert.equal(sends.length, 1, 'HTTP 5xx får aldrig omsändas automatiskt')

  reset(); outcomes = [{ success: false, status: 408, error: 'provider timeout' }]
  await run(); r = await run()
  assert.equal(r.body.resultat[0].utfall, 'leverans_osaker'); assert.equal(sends.length, 1, 'HTTP 408 får aldrig omsändas automatiskt')

  reset(); outcomes = [{ success: true, status: 200 }]
  await run(); r = await run()
  assert.equal(r.body.resultat[0].utfall, 'leverans_osaker'); assert.equal(sends.length, 1, '2xx utan provider-id är inte leveransbevis')

  reset(); errors.audit = 'audit down'; outcomes = [{ success: true, status: 200, elksId: 'e-audit', smsId: 's-audit' }]
  await run(); r = await run()
  assert.equal(r.body.resultat[0].utfall, 'dedupe'); assert.equal(sends.length, 1, 'levererad claim blockerar retry även när separat audit faller')
  const savedClaim = rows.get('veckorapport:b1:2026-W37')
  assert.equal(savedClaim.metadata.elks_id, 'e-audit'); assert.equal(savedClaim.metadata.sms_id, 's-audit')

  console.log('PASS veckorapport: fail-closed reads, atomic claim, safe retry and unknown-delivery lock. Provider mocked.')
})().catch(err => { console.error(err); process.exitCode = 1 })
