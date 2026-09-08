const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText
const rows=[
{id:'old',business_id:'b',status:'approved',resolved_at:'2025-01-01',payload:{execution_result:{outcome:'failed'}}},
{id:'null-date',business_id:'b',status:'approved',resolved_at:null,payload:{execution_result:{outcome:'retrying'}}},
{id:'done',business_id:'b',status:'approved',payload:{execution_result:{outcome:'success'}}},
{id:'foreign',business_id:'other',status:'approved',payload:{execution_result:{outcome:'failed'}}},
{id:'denied',business_id:'b',status:'approved',payload:{execution_result:{outcome:'failed'}}}]
const value=(r,k)=>k==='payload->execution_result->>outcome'?r.payload.execution_result.outcome:r[k]
const db={from(){let predicates=[];const q={select(){return q},order(){return q},limit(){return q},eq(k,v){predicates.push(r=>value(r,k)===v);return q},in(k,v){predicates.push(r=>v.includes(value(r,k)));return q},gte(k,v){predicates.push(r=>r[k]>=v);return q},then(resolve){resolve({data:rows.filter(r=>predicates.every(p=>p(r))),error:null})}};return q}}
const context={exports:{},console,require(name){
if(name==='next/server')return {NextResponse:{json:(v,init)=>Response.json(v,init)}}
if(name==='@/lib/supabase')return {getServerSupabase:()=>db}
if(name==='@/lib/auth')return {getAuthenticatedBusiness:async()=>({business_id:'b'})}
if(name==='@/lib/permissions')return {getCurrentUser:async()=>({id:'owner'})}
if(name.includes('/routing'))return {canActOnApproval:async(_db,_user,r)=>r.id!=='denied'}
if(name==='@/lib/testdata')return {arTestdataApproval:()=>false}
if(name.includes('approval-view'))return {approvalDisplay:()=>({})}
return {}
}}
vm.runInNewContext(compile(fs.readFileSync('app/api/approvals/route.ts','utf8')),context)
const page=fs.readFileSync('app/dashboard/approvals/page.tsx','utf8')
const component=page.slice(page.indexOf('function ApprovalHistoryReceipt('),page.indexOf('function getRecipient('))
const ui={exports:{},React:{createElement:(type,props,...children)=>({type,props:props||{},children})}}
vm.runInNewContext(compile('export '+component),ui)
const render=ui.exports.ApprovalHistoryReceipt
const flatten=n=>n&&typeof n==='object'?[n,...n.children.flatMap(flatten)]:[]
;(async()=>{
const response=await context.exports.GET({nextUrl:new URL('https://test/api/approvals?status=execution_failed')})
assert.equal(response.status,200);assert.deepEqual((await response.json()).approvals.map(r=>r.id),['old','null-date'])
let clicked,stopped=false
const approval={id:'old',status:'approved',payload:{execution_result:{outcome:'failed',receipt:{state:'partial',text:'1 av 2 klart'}}}}
const tree=render({approval,onRetry:id=>clicked=id,busy:false})
const button=flatten(tree).find(n=>n.type==='button');assert(button);assert.equal(button.props.disabled,false)
button.props.onClick({stopPropagation(){stopped=true}});assert.equal(clicked,'old');assert(stopped)
assert(flatten(tree).some(n=>n.children.includes('1 av 2 klart')))
assert.equal(flatten(render({approval,onRetry(){},busy:true})).find(n=>n.type==='button').props.disabled,true)
approval.payload.execution_result.outcome='success';approval.payload.execution_result.receipt={state:'saved',text:'2 av 2 klart'}
assert.equal(flatten(render({approval,onRetry(){},busy:false})).filter(n=>n.type==='button').length,0)
console.log('PASS actual GET retains old/null-date failures with tenant/routing filter; actual history component renders receipt, calls review handler, stops parent click, disables busy and removes resolved retry')
})().catch(e=>{console.error(e);process.exitCode=1})
