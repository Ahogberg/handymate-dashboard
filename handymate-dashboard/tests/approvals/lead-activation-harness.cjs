// Runs the real reviewed lead activation with an in-memory DB and no providers.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../..'),cache={}
let lead,deals=[],config,pending=new Map(),fireCalls=[]
const db={from(table){let op='read',values,filters=[];const chain=new Proxy({}, {get(_,key){
  if(key==='then')return resolve=>{const match=row=>filters.every(([k,v])=>row?.[k]===v);let data=null,error=null
    if(table==='leads'){if(op==='update'){if(match(lead)){Object.assign(lead,structuredClone(values));data=[{lead_id:lead.lead_id}]}else data=[]}else data=match(lead)?structuredClone(lead):null}
    else if(table==='deal'){if(op==='insert'){const value={...structuredClone(values),id:`deal-${deals.length+1}`};deals.push(value);data=value}else data=deals.find(match)||null}
    else if(table==='business_config')data=match(config)?structuredClone(config):null
    else if(table==='pending_approvals'){if(op==='insert'){const value=structuredClone(values);if(pending.has(value.id))error={code:'23505',message:'duplicate'};else pending.set(value.id,value);data=value}else data=[...pending.values()].find(match)||null}
    resolve({data,error})}
  return(...args)=>{if(key==='eq')filters.push(args);if(key==='update'||key==='insert'){op=String(key);values=args[0]}return chain}
}});return chain}}
function load(file){file=path.resolve(file);if(cache[file])return cache[file];const mod={exports:{}};cache[file]=mod.exports
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
 const req=name=>{
  if(name.startsWith('node:'))return require(name)
  if(name==='@/lib/numbering')return {getNextLeadNumber:async()=>1,getNextCaseNumber:async()=>42}
  if(name==='@/lib/pipeline')return {ensureDefaultStages:async()=>{},getStageBySlug:async()=>({id:'stage-new'})}
  if(name==='@/lib/sms/sender-id')return {sanitizeSenderId:x=>x}
  if(name==='@/lib/phone-normalize')return {normalizeSwedishPhone:x=>x}
  if(name==='@/lib/customer-dedupe')return {findCustomerDuplicates:async()=>[]}
  if(name==='@/lib/automation-engine')return {fireEvent:async(...args)=>{fireCalls.push(structuredClone(args.slice(1)));return {matched:2,pending_approval:2,executed:0,skipped:0,failed:0}}}
  if(name.startsWith('@/lib/'))return load(path.join(root,name.slice(2)+'.ts'))
  if(name.startsWith('./'))return load(path.resolve(path.dirname(file),name+'.ts'))
  throw Error(`Unexpected import ${name}`)
 }
 vm.runInNewContext(code,{module:mod,exports:mod.exports,require:req,console,process:{env:{}},Date,Math,JSON,Buffer,structuredClone},{filename:file});cache[file]=mod.exports;return mod.exports
}
const {activatePendingLead}=load(path.join(root,'lib/leads/golden-path.ts'))
const options={businessId:'b1',approvalId:'approval-1',createDeal:true,prepareInternalSms:true,runAutomationRules:true,reviewedInternalPhone:'+46708888888',reviewedInternalMessage:'Ny lead: Leo'}
;(async()=>{
 lead={lead_id:'lead1',business_id:'b1',customer_id:'customer1',name:'Leo Lead',phone:'+46707777777',email:'leo@example.test',notes:'Renovera hall',source:'email_forward',status:'pending_review'}
 config={business_id:'b1',personal_phone:'+46708888888',phone_number:null};deals=[];pending=new Map();fireCalls=[]
 const result=await activatePendingLead('lead1',db,options)
 assert.equal(lead.status,'new');assert.equal(result.dealError,null);assert.equal(deals.length,1);assert.equal(result.dealId,'deal-1')
 assert.equal(pending.size,1);const sms=[...pending.values()][0];assert.equal(sms.approval_type,'send_sms');assert.equal(sms.payload.to,options.reviewedInternalPhone);assert.equal(sms.payload.message,options.reviewedInternalMessage);assert.equal(sms.payload.parent_approval_id,'approval-1')
 assert.equal(fireCalls.length,1);assert.equal(fireCalls[0][2].require_explicit_approval,true);assert.equal(fireCalls[0][2].entity_id,'lead1')
 const replay=await activatePendingLead('lead1',db,options)
 assert.equal(replay.dealId,'deal-1');assert.equal(deals.length,1,'replay must reuse the deal');assert.equal(pending.size,1,'replay must reuse the internal-SMS card')
 const wrongTenant=await activatePendingLead('lead1',db,{...options,businessId:'foreign'}).then(()=>null,err=>err)
 assert(wrongTenant?.message?.includes('hittades inte'));assert.equal(deals.length,1);assert.equal(pending.size,1)
 console.log('PASS lead activation: actual core scopes the lead, reuses deal and child card, defers internal SMS, and forces approval for lead rules.')
})().catch(err=>{console.error(err);process.exitCode=1})
