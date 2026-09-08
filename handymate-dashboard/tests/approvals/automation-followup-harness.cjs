// Real review/executor, isolated persistence; any provider import fails.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const ts = require('typescript'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '../..'), cache = {}
function load(file) {
  file = path.resolve(file); if (cache[file]) return cache[file]
  const mod = { exports: {} }
  const requireLocal = name => name.startsWith('node:') ? require(name) : name.startsWith('./')
    ? load(path.resolve(path.dirname(file), name + '.ts')) : (() => { throw Error('Forbidden import: ' + name) })()
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module: mod, exports: mod.exports, require: requireLocal, Date, console }, { filename: file })
  return cache[file] = mod.exports
}
let rows = [], customer = { customer_id: 'c1', business_id: 'b1', name: 'Ada' }, loseResponse = false, failRead = false
const db = { from(table) {
  let values, filters = []
  const chain = new Proxy({}, { get(_, key) {
    if (key === 'then') return resolve => {
      if (table === 'customer') return resolve({ data: filters.every(([k,v]) => customer[k] === v) ? customer : null, error: null })
      if (!values && failRead) return resolve({ data: null, error: { message: 'read failed' } })
      if (values) {
        if (rows.some(row => row.inbox_item_id === values.inbox_item_id)) return resolve({ data: null, error: { code: '23505' } })
        rows.push(structuredClone(values))
        if (loseResponse) { loseResponse = false; return resolve({ data: null, error: { message: 'response lost' } }) }
        return resolve({ data: values, error: null })
      }
      return resolve({ data: rows.find(row => filters.every(([k,v]) => row[k] === v)) || null, error: null })
    }
    return (...args) => { if (key === 'eq') filters.push(args); if (key === 'insert') values = args[0]; return chain }
  } }); return chain
} }
const { prepareAutomationFollowupReview: prepare, executeAutomationFollowup: execute } = load(path.join(root, 'lib/approvals/automation-followup-review.ts'))
;(async () => {
  const approval = { id: 'a1', created_at: '2026-09-08T12:00:00Z', payload: { customer_id: 'c1', rule_action_config: { days_until: 2, description: 'Ring {{customer_name}}' } } }
  const first = await prepare(db, 'b1', approval)
  assert.equal(first.executionPayload.summary, 'Ring Ada (senast 2026-09-10)')
  assert.match(first.review.effect, /Ingen tidsstyrd/)
  assert.equal(JSON.stringify(first), JSON.stringify(await prepare(db, 'b1', approval)), 'preparation must stay stable')
  await assert.rejects(() => prepare(db, 'foreign', approval), /Kunden/)
  await assert.rejects(() => prepare(db, 'b1', { ...approval, created_at: '' }), /datum/)
  await assert.rejects(() => prepare(db, 'b1', { ...approval, payload: { rule_action_config: { days_until: -1 } } }), /Antal dagar/)
  await assert.rejects(() => prepare(db, 'b1', { ...approval, payload: { rule_action_config: { description: '{{missing}}' } } }), /platshållare/)
  customer = { ...customer, name: 'Ändrat' }
  assert.notEqual(JSON.stringify(first.snapshot), JSON.stringify((await prepare(db, 'b1', approval)).snapshot))
  loseResponse = true
  assert.equal((await execute(db, 'b1', 'a1', first.executionPayload)).ok, false)
  const recovered = await execute(db, 'b1', 'a1', first.executionPayload)
  assert.equal(recovered.ok, true); assert.equal(recovered.summary, first.executionPayload.summary); assert.equal(rows.length, 1)
  const recoveryReview = await prepare(db, 'b1', { ...approval, payload: { rule_action_config: { description: 'Ändrat efter lagring' } } })
  assert.equal(recoveryReview.executionPayload.summary, first.executionPayload.summary)
  assert.equal(recoveryReview.review.confirmLabel, 'Återställ kvittensen')
  await execute(db, 'b1', 'a1', first.executionPayload); assert.equal(rows.length, 1)
  failRead = true
  assert.equal((await execute(db, 'b1', 'a2', first.executionPayload)).ok, false); assert.equal(rows.length, 1)
  assert.equal((await execute(db, 'b1', 'a3', {})).ok, false)
  console.log('PASS follow-up review/execution: exact date/text, tenant scope, stale customer, validation, lost-response recovery, no duplicate and fail-closed lookup.')
})().catch(error => { console.error(error); process.exitCode = 1 })
