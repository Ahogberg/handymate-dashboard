// Executes the real route with an in-memory database and NO network or credentials.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const ts = require('typescript'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '../..')
let row, mutations, canAct = true
const campaigns = new Map(), deliveries = []
const db = { from(table) {
  let values, operation = 'read', filters = []
  const chain = new Proxy({}, { get(_, key) {
    if (key === 'then') return resolve => {
      const matches = r => filters.every(([k,v]) => k === 'payload' ? JSON.stringify(r[k]) === v : r[k] === v)
      if (operation !== 'read') mutations++
      if (table === 'pending_approvals') {
        if (!matches(row)) return resolve({ data: [], error: null })
        if (operation === 'update') Object.assign(row, structuredClone(values))
        return resolve({ data: operation === 'read' ? structuredClone(row) : [{ id: row.id }], error: null })
      }
      if (table === 'sms_campaign') {
        if (operation === 'read') return resolve({ data: campaigns.get(filters.find(([k]) => k === 'campaign_id')?.[1]) || null, error: null })
        if (operation === 'insert') campaigns.set(values.campaign_id, structuredClone(values))
        if (operation === 'update') Object.assign(campaigns.get(filters.find(([k]) => k === 'campaign_id')[1]), values)
        return resolve({ data: [{ campaign_id: 'x' }], error: null })
      }
      if (table === 'sms_campaign_recipient' && operation === 'insert') deliveries.push(...structuredClone(values))
      return resolve({ data: null, error: null })
    }
    return (...args) => { if (key === 'eq') filters.push(args); if (key === 'insert' || key === 'update') { operation = key; values = args[0] }; return chain }
  } }); return chain
} }
const cache = {}
function load(file) {
  file = path.resolve(file)
  if (cache[file]) return cache[file]
  const mod = { exports: {} }; cache[file] = mod.exports
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const req = name => {
    if (name.startsWith('node:')) return require(name)
    if (name === 'next/server') return { NextResponse: { json: (data, init) => Response.json(data, init) } }
    if (name === '@/lib/supabase') return { getServerSupabase: () => db }
    if (name === '@/lib/auth') return { getAuthenticatedBusiness: async () => ({ business_id: 'b1' }) }
    if (name === '@/lib/permissions') return { getCurrentUser: async () => ({ id: 'u1' }) }
    if (name === '@/lib/approvals/routing') return { canActOnApproval: async () => canAct }
    if (name === '@/lib/agent/learning-engine') return { recordLearningEvent: async () => ({ success: true }) }
    if (name === '@/lib/autonomy/earned-autonomy') return { autonomyKeyFromApproval: () => null }
    if (name.startsWith('@/lib/approvals/')) return load(path.join(root, name.slice(2)+'.ts'))
    if (name.startsWith('./')) return load(path.resolve(path.dirname(file),name+'.ts'))
    return new Proxy({}, { get: (_, key) => () => { throw Error(`Unexpected effect: ${name}.${String(key)}`) } })
  }
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: req, process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'test-only' } },
    console, Buffer, Date, fetch: () => { throw Error('Network is forbidden in this harness') } }, { filename: file })
  cache[file] = mod.exports; return mod.exports
}
const { POST } = load(path.join(root,'app/api/approvals/[id]/route.ts'))
const reset = () => { row = { id: 'a1', business_id: 'b1', approval_type: 'seasonal_campaign', title: 'Höst', status: 'pending', payload: { sms_text: 'Hej kund', customers: [{ customer_id: 'c1', phone_number: '+46701234567' }] } }; mutations = 0; canAct = true; campaigns.clear(); deliveries.length=0 }
const post = body => POST({ json: async () => body, headers: new Headers() }, { params: { id:'a1' } })
;(async () => {
  reset()
  for (const action of ['approve','edit','retry']) { assert.equal((await post({action})).status,428); assert.equal(mutations,0) }
  canAct=false; assert.equal((await post({ action:'preview',decision_action:'approve' })).status,403); assert.equal(mutations,0); canAct=true
  const preview = await (await post({action:'preview', decision_action:'edit',edited_payload:{sms_text:'Min granskade text'}})).json()
  assert.equal(mutations,0); assert.equal(preview.review.messages[0].text,'Min granskade text')
  const body = { action:'edit',edited_payload:{sms_text:'Min granskade text'},review_token:preview.review_token }
  const response = await post(body); assert.equal(response.status,200)
  const result = await response.json(); assert.equal(result.execution.queued,true); assert.equal(row.status,'approved')
  assert.equal([...campaigns.values()][0].message, 'Min granskade text'); assert.equal(deliveries.length,1)
  assert.equal(deliveries[0].phone_number,preview.review.messages[0].recipients[0])
  await post(body); assert.equal(deliveries.length,1); assert.equal(campaigns.size,1)
  reset(); row.approval_type='four_eyes_project_close'; assert.equal((await post({action:'approve'})).status,422); assert.equal(mutations,0); assert.equal(row.status,'pending')
  console.log('PASS route integration: old clients/edit/retry cannot mutate, authorization precedes preview, edited preview→exact queued text/recipient, repeated click no duplicate, hidden invoice send blocked.')
})().catch(e => { console.error(e); process.exitCode=1 })
