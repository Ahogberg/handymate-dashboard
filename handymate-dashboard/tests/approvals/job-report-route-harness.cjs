// Actual approval/document routes + review guard + journal. Isolated DB/providers;
// deterministic preparation and rasterization have separate actual-renderer tests.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
let allowed=true,authenticated=true,changed=false,sends=0,writes=0
const approval={id:'a',business_id:'b',approval_type:'job_report',status:'pending',payload:{projectId:'p'}}
const docs=new Map()
const db={from(table){let op='read',values,filters=[];const c=new Proxy({}, {get(_,key){
 if(key==='then')return resolve=>{
   const matches=r=>filters.every(([k,v])=>['payload','variables_data'].includes(k)?JSON.stringify(r[k])===v:r[k]===v)
   if(op!=='read')writes++
   if(table==='pending_approvals'){
     assert(filters.some(([k,v])=>k==='business_id'&&v==='b'))
     if(!matches(approval))return resolve({data:[],error:null})
     if(op==='update')Object.assign(approval,structuredClone(values))
     return resolve({data:op==='read'?structuredClone(approval):[{id:'a'}],error:null})
   }
   if(table==='generated_document'){
     if(op==='insert'){if(docs.has(values.id))return resolve({data:null,error:{code:'23505'}});docs.set(values.id,structuredClone(values));return resolve({data:structuredClone(values),error:null})}
     assert(filters.some(([k,v])=>k==='business_id'&&v==='b'))
     const d=[...docs.values()].find(matches)
     if(op==='update'&&d)Object.assign(d,structuredClone(values))
     return resolve({data:op==='read'?(d?structuredClone(d):null):d?[{id:d.id}]:[],error:null})
   }
   return resolve({data:null,error:null})
 }
 return(...args)=>{if(key==='eq')filters.push(args);if(['insert','update'].includes(key)){op=key;values=args[0]}return c}
}});return c},storage:{from(){return {upload:async()=>({error:null})}}}}
const cache={};let prepared
function load(file){file=path.resolve(file);if(cache[file])return cache[file];const mod={exports:{}};cache[file]=mod.exports
const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
vm.runInNewContext(code,{module:mod,exports:mod.exports,Buffer,Uint8Array,Date,console,process:{env:{SUPABASE_SERVICE_ROLE_KEY:'test-secret'}},fetch:()=>{throw Error('Network forbidden')},require(name){
 if(name.startsWith('node:'))return require(name)
 if(name==='next/server')return {NextResponse:Response}
 if(name==='@/lib/supabase')return {getServerSupabase:()=>db}
 if(name==='@/lib/auth')return {getAuthenticatedBusiness:async()=>authenticated?{business_id:'b'}:null}
 if(name==='@/lib/permissions')return {getCurrentUser:async()=>authenticated?{id:'u'}:null}
 if(name==='@/lib/approvals/routing')return {canActOnApproval:async()=>allowed}
 if(name==='@/lib/agent/learning-engine')return {recordLearningEvent:async()=>({success:true})}
 if(name==='@/lib/autonomy/earned-autonomy')return {autonomyKeyFromApproval:()=>null}
 if(name.endsWith('job-report-review'))return {prepareJobReport:async()=>{const result=structuredClone(prepared);result.document.pdf=Buffer.from(result.document.pdf);if(changed){result.document.version='changed';result.review.details=[{label:'Version',text:'changed'}]}return result}}
 if(name==='@/lib/approvals/pdf-preview')return {renderReviewedPdf:async bytes=>{assert(bytes.equals(prepared.document.pdf));return '<h1>Rendered reviewed pages</h1>'}}
 if(name==='@/lib/email')return {sendEmail:async args=>{sends++;assert.equal(args.to,prepared.document.email.to);assert.equal(args.html,prepared.document.email.html);assert.equal(args.attachments[0].content,prepared.document.pdf.toString('base64'));return {success:true,deliveryState:'accepted',messageId:'m1'}}}
 if(name.startsWith('@/lib/approvals/'))return load(name.slice(2)+'.ts')
 if(name.startsWith('./'))return load(path.resolve(path.dirname(file),name+'.ts'))
 return new Proxy({}, {get:(_,key)=>()=>{throw Error(`Unexpected effect ${name}.${String(key)}`)}})
}});cache[file]=mod.exports;return mod.exports}
const journal=load('lib/approvals/document-delivery.ts')
const doc={businessId:'b',approvalId:'a',projectId:'p',customerId:'c',title:'Report',pdf:Buffer.from('reviewed pdf'),email:{to:'test@example.test',subject:'Reviewed subject',html:'<p>Reviewed content</p>'}}
doc.version=journal.documentVersion(doc.pdf,doc.email)
prepared={document:doc,review:{title:'Granska rapport',effect:'Skickar PDF',confirmLabel:'Skicka',messages:[{channel:'E-post',recipients:[doc.email.to],text:doc.email.html}],attachments:[{label:'PDF',url:'/api/approvals/a/document?version='+doc.version,kind:'document'}]}}
const route=load('app/api/approvals/[id]/route.ts'),documentRoute=load('app/api/approvals/[id]/document/route.ts')
const post=body=>route.POST({json:async()=>body,headers:new Headers()},{params:{id:'a'}})
const getDocument=version=>documentRoute.GET({nextUrl:new URL('https://test.example/api/approvals/a/document?version='+version)},{params:{id:'a'}})
;(async()=>{
 let r=await post({action:'approve'});assert.equal(r.status,428);assert.equal(writes,0)
 r=await post({action:'preview',decision_action:'approve'});const preview=await r.json();assert.equal(writes,0);assert.equal(sends,0)
 allowed=false;assert.equal((await getDocument(doc.version)).status,403);assert.equal((await post({action:'approve',review_token:preview.review_token})).status,403);allowed=true
 authenticated=false;assert.equal((await getDocument(doc.version)).status,401);authenticated=true
 assert.equal((await getDocument('stale')).status,409);r=await getDocument(doc.version);assert.equal(r.status,200);assert((await r.text()).includes('Rendered reviewed pages'));assert.equal(writes,0)
 changed=true;assert.equal((await post({action:'approve',review_token:preview.review_token})).status,428);assert.equal(sends,0);changed=false
 r=await post({action:'approve',review_token:preview.review_token});assert.equal(r.status,200);const result=await r.json();assert.equal(sends,1);assert.equal(result.receipt.state,'sent');assert.equal(approval.payload.execution_result.receipt.text,result.receipt.text);assert.equal(approval.payload.execution_result.artifacts.message_id,'m1');assert(approval.payload.execution_result.artifacts.document_id)
 const reopened=await (await route.GET({}, {params:{id:'a'}})).json();assert.equal(reopened.approval.payload.execution_result.receipt.text,result.receipt.text)
 await post({action:'approve',review_token:preview.review_token});assert.equal(sends,1);assert.equal(docs.size,1)
 console.log('PASS actual report routes: read-only preview/document, tenant/actor denial, stale document 409, stale proof blocks send, exact prepared delivery, persistent receipt after reopening, duplicate click sends once.')
})().catch(e=>{console.error(e);process.exitCode=1})
