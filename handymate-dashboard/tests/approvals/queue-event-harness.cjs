const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), ts = require('typescript')
const code = ts.transpileModule(fs.readFileSync('lib/approvals/review-client.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
async function run(mode) {
  const calls = [], events = []
  const context = { exports: {}, Response, Event, window: { dispatchEvent: e => events.push(e.type) }, fetch: async (_url, init) => {
    const body = JSON.parse(init.body); calls.push(body.action)
    if (body.action === 'preview') return mode === 'denied' ? Response.json({error:'Denied'},{status:403}) : Response.json({review_not_required:true})
    if (mode === 'lost') throw Error('Lost response')
    return Response.json({ok:mode!=='failed'}, {status:mode==='failed'?500:200})
  }}
  vm.runInNewContext(code, context)
  try { await context.exports.reviewedApprovalFetch('/api/approvals/test', {method:'POST',body:JSON.stringify({action:'approve'})}) } catch (e) { assert.equal(mode,'lost') }
  assert.deepEqual(calls, mode === 'denied' ? ['preview'] : ['preview','approve'])
  assert.deepEqual(events, mode === 'denied' ? [] : ['handymate:approval-queue-changed'])
}
;(async()=>{for(const mode of ['success','failed','lost','denied'])await run(mode); console.log('PASS: actual review client signals submitted success/failure/lost response once; denied preview never signals or submits')})().catch(e=>{console.error(e);process.exitCode=1})
