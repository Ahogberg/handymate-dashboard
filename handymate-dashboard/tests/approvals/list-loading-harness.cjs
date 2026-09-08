const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const adapter={exports:{},fetch:async()=>Response.json({approvals:[]})}
vm.runInNewContext(compile(fs.readFileSync('lib/approvals/list-client.ts','utf8')),adapter)
const page=fs.readFileSync('app/dashboard/approvals/page.tsx','utf8');const fn=page.slice(page.indexOf('  async function fetchApprovals()'),page.indexOf('  async function handleRetry'))
const state={};let requests=[]
const c={exports:{},business:{business_id:'b'},activeTab:'pending',listRequest:{current:0},URLSearchParams,window:{location:{search:''}},supabase:{auth:{getSession:async()=>({data:{session:null}})}},fetchApprovalList:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),setLoading:v=>state.loading=v,setListError:v=>state.error=v,setApprovals:v=>state.items=v,setFailedExecutions:v=>state.failed=v}
vm.runInNewContext(compile(fn+'\nexports.run=fetchApprovals'),c)
;(async()=>{
assert.equal((await adapter.exports.fetchApprovalList('/test')).length,0)
for(const response of [Response.json({error:'denied'},{status:403}),Response.json({}),Response.json({approvals:null})]){adapter.fetch=async()=>response;await assert.rejects(()=>adapter.exports.fetchApprovalList('/test'))}
let pages=0
adapter.fetch=async()=>Response.json(pages++===0?{approvals:[],next_offset:50}:{approvals:[{id:'later'}],next_offset:null})
assert.equal((await adapter.exports.fetchApprovalList('/test?limit=50'))[0].id,'later');assert.equal(pages,2)
adapter.fetch=async()=>Response.json({approvals:[],next_offset:0});await assert.rejects(()=>adapter.exports.fetchApprovalList('/test?limit=50'))
const first=c.exports.run();await new Promise(r=>setImmediate(r));const second=c.exports.run();await new Promise(r=>setImmediate(r))
requests[2].resolve([{id:'current'}]);requests[3].resolve([]);await second
requests[0].resolve([{id:'old'}]);requests[1].resolve([{id:'old-failure'}]);await first
assert.equal(state.items[0].id,'current');assert.equal(state.failed.length,0)
requests=[];const fail=c.exports.run();await new Promise(r=>setImmediate(r));requests[0].resolve([]);requests[1].reject(Error('Network failed'));await fail
assert.match(state.error,/kunde inte hämtas/);assert.equal(state.loading,false)
console.log('PASS actual list adapter rejects HTTP/malformed data; actual page loader ignores stale responses and reports failed follow-up fetch instead of an empty queue')
})().catch(e=>{console.error(e);process.exitCode=1})
