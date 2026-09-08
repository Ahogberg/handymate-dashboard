// Actual page handler and error banner; no browser, network, credentials or database.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
const page=fs.readFileSync('app/dashboard/approvals/page.tsx','utf8')
const handler=page.slice(page.indexOf('  async function handleAction('),page.indexOf('  // Project Debrief Capture',page.indexOf('  async function handleAction(')))
const start=page.indexOf('            {failedFeedback && (')
const banner=page.slice(start+'            {'.length,page.indexOf('\n            )}',start)+'\n            )'.length)
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText
let responses=[],calls=[],retryCalls=[]
const ctx={exports:{},console,JSON,setTimeout(){},React:{createElement:(type,props,...children)=>({type,props:props||{},children})},
failedFeedback:null,actionLoading:null,retryLoading:null,approvals:[],failedExecutions:[],
supabase:{auth:{getSession:async()=>({data:{session:null}})}},
reviewedApprovalFetch:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return responses.shift()},
setActionLoading:v=>ctx.actionLoading=v,setFailedFeedback:v=>ctx.failedFeedback=v,
setApprovals(){},setEditingId(){},setFeedbackLink(){},setFeedbackLinkLabel(){},setCloseoutProject(){},setFeedbackMsg(){},fetchApprovals(){},
handleRetry:id=>retryCalls.push(id)}
vm.runInNewContext(compile(handler+'\nexports.handleAction=handleAction; exports.banner=()=>('+banner+');'),ctx)
const flat=n=>n&&typeof n==='object'?[n,...n.children.flatMap(flat)]:[]
;(async()=>{
for(const [action,editedPayload,wire] of [['approve',undefined,'approve'],['approve',{text:'Reviewed edit'},'edit'],['reject',undefined,'reject']]){
calls=[];responses=[Response.json({code:'approval_review_required',error:'Granska det aktuella underlaget innan du bekräftar.'},{status:428}),Response.json({cancelled:true},{status:499})]
await ctx.exports.handleAction('test-card',action,editedPayload)
assert.equal(ctx.failedFeedback.reviewAgain.action,action)
const button=flat(ctx.exports.banner()).find(n=>n.type==='button'&&n.children.includes('Granska på nytt'))
assert(button);assert.equal(button.props.disabled,false)
await button.props.onClick()
assert.equal(calls.length,2);assert.equal(calls[0].body.action,wire);assert.equal(calls[1].body.action,wire)
assert.deepEqual(calls[1].body.edited_payload,editedPayload)
assert.equal(retryCalls.length,0);assert.equal(ctx.failedFeedback,null)
}
ctx.failedFeedback={id:'executed-card',text:'Partial result'}
const retry=flat(ctx.exports.banner()).find(n=>n.type==='button'&&n.children.includes('Försök igen'))
await retry.props.onClick();assert.deepEqual(retryCalls,['executed-card'])
ctx.actionLoading='busy'
assert.equal(flat(ctx.exports.banner()).find(n=>n.type==='button').props.disabled,true)
console.log('PASS actual error banner/handler: stale approve/edit/reject opens fresh review preserving intent; cancel sends no decision; executed failure retains retry; busy locks button')
})().catch(e=>{console.error(e);process.exitCode=1})
