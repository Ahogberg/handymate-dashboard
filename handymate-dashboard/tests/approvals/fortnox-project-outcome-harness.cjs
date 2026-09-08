// Runs the actual project sync function; database and Fortnox transport are isolated.
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path')
const ts = require('typescript'), assert = require('node:assert/strict')
let row, mode, sent, dbReads, readError, connected, response
const db = { from(table) {
  assert.equal(table, 'project')
  let op = 'read', values, filters = []
  const query = new Proxy({}, { get(_, key) {
    if (key === 'then') return resolve => {
      assert(filters.some(([k,v]) => k === 'business_id' && v === 'b1'))
      assert(filters.some(([k,v]) => k === 'project_id' && v === 'p1'))
      if (op === 'read') {
        dbReads++
        return resolve({ data: readError ? null : row && { ...row }, error: readError ? { message: 'read failed' } : null })
      }
      if (!values.fortnox_project_number) return resolve({ data: [], error: null })
      assert(filters.some(([k,v]) => k === 'fortnox_project_number' && v === null))
      if (mode === 'missing') { row = null; return resolve({ data: [], error: null }) }
      if (mode === 'conflict') { row.fortnox_project_number = '999'; return resolve({ data: [], error: null }) }
      if (mode === 'failed') return resolve({ data: null, error: { message: 'write failed' } })
      Object.assign(row, values)
      return resolve(mode === 'lost' ? { data: null, error: { message: 'response lost' } } : { data: [{ ...row }], error: null })
    }
    return (...args) => { if (['eq','is'].includes(key)) filters.push(args); if (key === 'update') { op = 'update'; values = args[0] } return query }
  } })
  return query
} }
const mod = { exports: {} }
const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../../lib/fortnox.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
vm.runInNewContext(source + `\ngetSupabase = () => __db; isFortnoxConnected = async () => __connected(); createFortnoxProject = async (b,p) => __send(b,p);`, {
  module: mod, exports: mod.exports, process: { env: {} }, console, Date,
  __db: db, __connected: () => connected,
  __send: async (business, body) => { assert.equal(business, 'b1'); sent.push(body); return response },
  require: name => { if (name === '@supabase/supabase-js') return { createClient: () => { throw Error('Unexpected client') } }; if (name === '@/lib/observability/driftlarm') return { rapporteraTystFel: async () => {} }; throw Error('Forbidden dependency ' + name) },
})
function reset() { row = { project_id:'p1', name:'Test', project_number:'P-1042', status:'active', fortnox_project_number:null }; mode='ok'; sent=[]; dbReads=0; readError=false; connected=true; response={ProjectNumber:'1042'} }
const run = () => mod.exports.syncProjectToFortnox('b1','p1')
;(async () => {
  reset(); assert.equal((await run()).success,true); assert.equal(row.fortnox_project_number,'1042'); assert.equal(sent.length,1)
  await run(); assert.equal(sent.length,1)
  reset(); mode='missing'; let r=await run(); assert.equal(r.success,false); assert.equal(r.partial,true); assert.equal(r.projectNumber,'1042')
  reset(); mode='conflict'; r=await run(); assert.equal(r.success,false); assert.equal(row.fortnox_project_number,'999')
  reset(); mode='failed'; r=await run(); assert.equal(r.success,false); assert.equal(r.partial,true)
  reset(); mode='lost'; r=await run(); assert.equal(r.success,true); assert.equal(dbReads,2); await run(); assert.equal(sent.length,1)
  for (const invalid of [undefined, {}, {ProjectNumber:''}, {ProjectNumber:'999'}, {ProjectNumber:1042}]) {
    reset(); response=invalid; r=await run(); assert.equal(r.success,false); assert.equal(r.partial,true); assert.equal(row.fortnox_project_number,null)
  }
  reset(); row.source_lead_data={created_from:'reviewed_automation'}; assert.equal((await run()).error,'project_requires_approval'); assert.equal(sent.length,0)
  reset(); readError=true; assert.equal((await run()).success,false); assert.equal(sent.length,0)
  reset(); connected=false; assert.equal((await run()).skipped,true); assert.equal(sent.length,0)
  console.log('PASS actual Fortnox project sync: validated reference, scoped conditional persistence, missing/conflicting row, write failure, lost response recovery, replay, read failure and disconnected account. No real transport.')
})().catch(error => { console.error(error); process.exitCode=1 })
