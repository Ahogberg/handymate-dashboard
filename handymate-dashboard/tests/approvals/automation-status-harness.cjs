const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
const mod={exports:{}}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../../lib/approvals/automation-status-review.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports,Date})
const {prepareAutomationStatusReview:prepare,executeAutomationStatus:execute}=mod.exports
let row, writes, lost, noMatch, failRead, wrongAfter
const db={from(table){let values,filters=[];const chain=new Proxy({}, {get(_,key){
 if(key==='then')return resolve=>{
  const matches=filters.every(([k,v])=>(row[k]??null)===v)
  if(values){writes++;if(matches&&!noMatch)Object.assign(row,values);if(wrongAfter)row.status='changed';return resolve({data:matches&&!noMatch&&!lost?[{id:'id1'}]:[],error:lost?{message:'response lost'}:null})}
  resolve({data:matches&&!failRead?structuredClone(row):null,error:failRead?{message:'read failed'}:null})
 }
 return(...args)=>{if(['eq','is'].includes(key))filters.push(args);if(key==='update')values=args[0];return chain}
}});return chain}}
;(async()=>{
 for(const [entity,key,column] of [['lead','lead_id','status'],['customer','customer_id','job_status'],['booking','booking_id','status'],['quote','quote_id','status'],['invoice','invoice_id','status']]){
  row={[key]:'id1',business_id:'b1',[column]:'new',name:'Test',updated_at:'2026-09-08T00:00:00Z'};writes=0;lost=false;noMatch=false;failRead=false;wrongAfter=false
  const payload={entity_id:'id1',rule_action_config:{entity,new_status:'cancelled'}}
  const preview=await prepare(db,'b1',payload);assert.equal(writes,0);assert.equal(preview.executionPayload.previous,'new')
  await assert.rejects(()=>prepare(db,'foreign',payload),/företaget/)
  row.updated_at='changed';assert.equal((await execute(db,'b1',preview.executionPayload)).ok,false);assert.equal(writes,0);row.updated_at=preview.executionPayload.updatedAt
  noMatch=true;assert.equal((await execute(db,'b1',preview.executionPayload)).ok,false);assert.equal(row[column],'new');noMatch=false
  lost=true;const result=await execute(db,'b1',preview.executionPayload);assert.equal(result.ok,true);assert.equal(result.verified_after_lost_response,true);assert.equal(row[column],'cancelled')
  const count=writes;const replay=await execute(db,'b1',preview.executionPayload);assert.equal(replay.already_current,true);assert.equal(writes,count)
  assert.equal((await execute(db,'foreign',preview.executionPayload)).ok,false)
  failRead=true;assert.equal((await execute(db,'b1',preview.executionPayload)).ok,false);assert.equal(writes,count);failRead=false
 }
 await assert.rejects(()=>prepare(db,'b1',{rule_action_config:{entity:'arbitrary',new_status:'x'}}),/giltig/)
 await assert.rejects(()=>prepare(db,'b1',{rule_action_config:{stage_key:'active_job'}}),/Pipeline/)
 console.log('PASS status: five entity mappings, tenant scope, stale data, zero-row rejection, lost-response verification and replay without another write.')
})().catch(e=>{console.error(e);process.exitCode=1})
