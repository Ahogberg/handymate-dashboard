// Executes the real preparation function and the real customer_fact executor branch.
// Providers and persistence are isolated; this is not a full HTTP or native test.
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict')
const compile = source => ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function database(rows, fail = false) {
  return {from(table) {
    let filters = [], patch
    const q = {select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},is(k,v){filters.push(r=>r[k]===v);return q},order(){return q},update(v){patch=v;return q},
      maybeSingle: async()=>({data:table==='customer'?{customer_id:'c',business_id:'b',name:'Testkund'}:null,error:null}),
      then(resolve,reject){return Promise.resolve().then(()=>{
        if(fail)return {data:null,error:{message:'Database unavailable'}}
        const matches=rows.filter(r=>filters.every(f=>f(r))).sort((a,b)=>a.id.localeCompare(b.id))
        if(patch)matches.forEach(r=>Object.assign(r,patch))
        return {data:matches.map(r=>({id:r.id,content:r.content})),error:null}
      }).then(resolve,reject)}}
    return q
  }}
}
const prepareContext = {exports:{},require(name){
  if(name.includes('build-card'))return {normalizeDueDateIso:v=>v||null}
  if(name.includes('action-contract'))return {classify:()=> 'EXECUTABLE'}
  return {}
}}
vm.runInNewContext(compile(fs.readFileSync('lib/approvals/prepare-review.ts','utf8')),prepareContext)
const prepare=prepareContext.exports.prepareApprovalReview
const route=fs.readFileSync('app/api/approvals/[id]/route.ts','utf8')
const branch=route.slice(route.indexOf("      case 'customer_fact': {"),route.indexOf("      case 'agent_memory_confirmation': {"))
let db, inserts=0, inserted
const executeContext={exports:{},console:{error(){}},getSupabase:async()=>db,normalizeDueDateIso:v=>v||null,rapporteraTystFel:async()=>{},
 insertApprovalArtifact:async(_db,_table,_key,_business,_approval,_kind,value)=>{inserts++;inserted=value;return {data:{id:'new'},error:null}}}
vm.runInNewContext(compile(`export async function execute(payload:any,reviewedPayload:any){const businessId='b',approvalId='approval';switch('customer_fact'){${branch}}}`),executeContext)
const execute=executeContext.exports.execute
const base=()=>[
 {id:'old',business_id:'b',customer_id:'c',fact_type:'contact',content:'Old contact',superseded_by:null},
 {id:'foreign',business_id:'other',customer_id:'c',fact_type:'contact',content:'Other tenant',superseded_by:null},
 {id:'customer',business_id:'b',customer_id:'other',fact_type:'contact',content:'Other customer',superseded_by:null},
 {id:'preference',business_id:'b',customer_id:'c',fact_type:'preference',content:'Preference',superseded_by:null},
 {id:'inactive',business_id:'b',customer_id:'c',fact_type:'contact',content:'Inactive',superseded_by:'prior'}]
const payload={customer_id:'c',fact_type:'contact',content:'New contact'}
const review=(rows,p=payload,fail=false)=>prepare(database(rows,fail),'b',{id:'approval',approval_type:'customer_fact',payload:p},{action:'approve'})
;(async()=>{
 const rows=base(), prepared=await review(rows)
 assert.equal(prepared.review.confirmLabel,'Spara kunduppgiften')
 assert.deepEqual(JSON.parse(JSON.stringify(prepared.executionPayload.customerFactReplacementTargets)),[{id:'old',content:'Old contact'}])
 assert(prepared.review.details.some(d=>d.label==='Ersätter uppgift 1'&&d.text==='Old contact'))
 assert.notDeepEqual((await review([{...rows[0],content:'Changed'}])).snapshot,prepared.snapshot)
 assert.equal((await review(rows,payload,true)).review.confirmLabel,null)
 assert.equal((await review(rows,{...payload,fact_type:'preference'})).executionPayload.customerFactReplacementTargets.length,0)
 db=database(rows);assert.equal((await execute(payload,undefined)).ok,false);assert.equal(inserts,0)
 rows.push({...rows[0],id:'unreviewed',content:'Added after review'})
 assert.equal((await execute(payload,prepared.executionPayload)).ok,true)
 assert.equal(rows[0].superseded_by,'new');assert.equal(rows.find(r=>r.id==='unreviewed').superseded_by,null)
 assert.equal(rows.find(r=>r.id==='foreign').superseded_by,null);assert.equal(rows.find(r=>r.id==='customer').superseded_by,null)
 const changed=base();changed[0].content='Changed after review';db=database(changed)
 const partial=await execute(payload,prepared.executionPayload);assert.equal(partial.ok,false);assert.equal(partial.partial,true);assert.equal(changed[0].superseded_by,null)
 const commitment=base().map(r=>({...r,fact_type:'commitment'}));const cp={...payload,fact_type:'commitment',due_date_iso:'2026-09-10'}
 const cr=await review(commitment,cp);db=database(commitment)
 assert.equal((await execute(cp,cr.executionPayload)).ok,true);assert.equal(inserted.promise_status,'open');assert.equal(inserted.due_at,'2026-09-10')
 console.log('PASS: exact replacement preview, tenant/customer/type scope, stale snapshot, unavailable data, preference, missing evidence, unreviewed target exclusion, changed target partial outcome, commitment date')
})().catch(e=>{console.error(e);process.exitCode=1})
