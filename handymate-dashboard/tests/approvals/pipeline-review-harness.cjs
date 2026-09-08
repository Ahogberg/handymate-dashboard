const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../..'),cache={}
function load(file){file=path.resolve(file);if(cache[file])return cache[file];const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports,Date,console,require:name=>name.startsWith('node:')?require(name):load(path.resolve(path.dirname(file),name+'.ts'))});return cache[file]=mod.exports}
let tables,failChild=false,lostStage=false,lostChild=false,failJournal=false,stageWrites=0,childWrites=0
const db={from(table){let op='read',values,filters=[],single=false;const chain=new Proxy({}, {get(_,key){
 if(key==='then')return resolve=>{
  const rows=tables[table]||[],match=row=>filters.every(([k,v])=>(row[k]??null)===v)
  if(op==='insert'){
   if(table==='pending_approvals'){childWrites++;if(failChild)return resolve({data:null,error:{message:'child failed'}})}
   if(rows.some(r=>r.id===values.id))return resolve({data:null,error:{code:'23505'}})
   rows.push(structuredClone(values));tables[table]=rows
   if(table==='pending_approvals'&&lostChild){lostChild=false;return resolve({data:null,error:{message:'lost child response'}})}
   return resolve({data:structuredClone(values),error:null})
  }
  if(op==='update'){
   if(table==='v3_automation_logs'&&failJournal)return resolve({data:null,error:{message:'journal failed'}})
   const selected=rows.filter(match);selected.forEach(r=>Object.assign(r,structuredClone(values)))
   if(table==='leads'){stageWrites++;if(lostStage){lostStage=false;return resolve({data:null,error:{message:'lost response'}})}}
   return resolve({data:structuredClone(selected),error:null})
  }
  const selected=rows.filter(match);return resolve({data:structuredClone(single?selected[0]||null:selected),error:null})
 }
 return(...args)=>{if(['eq','is'].includes(key))filters.push(args);if(['single','maybeSingle'].includes(key))single=true;if(['insert','update'].includes(key)){op=key;values=args[0]}return chain}
}});return chain}}
function reset(){tables={leads:[{lead_id:'l1',business_id:'b1',name:'Ada',pipeline_stage_key:'new_lead'}],pipeline_stages:[{business_id:'b1',key:'new_lead',label:'Ny',sort_order:1},{business_id:'b1',key:'active_job',label:'Aktiv',sort_order:2,creates_project:true}],v3_automation_rules:[{id:'r1',business_id:'b1',is_active:true,trigger_type:'event',trigger_config:{event_name:'pipeline_stage_changed'},name:'Kundbesked',action_type:'send_sms',action_config:{template:'Hej'}}],v3_automation_logs:[],pending_approvals:[]};failChild=false;lostStage=false;stageWrites=0;childWrites=0}
const {preparePipelineReview:prepare,executePipelineReview:execute}=load(path.join(root,'lib/approvals/pipeline-review.ts'))
const payload={lead_id:'l1',rule_action_config:{stage_key:'active_job'}}
;(async()=>{
 reset();const p=await prepare(db,'b1','a1',payload);assert.equal(p.executionPayload.plan.proposals.length,2);assert.equal(stageWrites,0);assert.match(p.review.effect,/Inga meddelanden/)
 await assert.rejects(()=>prepare(db,'foreign','a1',payload),/företaget/)
 tables.leads[0].customer_id='c1';tables.customer=[{customer_id:'c1',business_id:'foreign'}]
 await assert.rejects(()=>prepare(db,'b1','a1',payload),/kundkoppling/)
 delete tables.leads[0].customer_id
 failChild=true;const partial=await execute(db,'b1','a1',p.executionPayload);assert.equal(partial.partial,true);assert.equal(stageWrites,1);assert.equal(tables.pending_approvals.length,0)
 const retry=await prepare(db,'b1','a1',payload);assert.equal(retry.executionPayload.plan.previous,'new_lead');assert(retry.review.details.some(d=>d.text.includes('körs inte igen')))
 failChild=false;const done=await execute(db,'b1','a1',retry.executionPayload);assert.equal(done.ok,true);assert.equal(stageWrites,1);assert.equal(tables.pending_approvals.length,2);assert.equal(tables.v3_automation_logs[0].status,'success')
 const writes=childWrites;await execute(db,'b1','a1',retry.executionPayload);assert.equal(childWrites,writes)
 reset();const q=await prepare(db,'b1','a1',payload);lostStage=true;assert.equal((await execute(db,'b1','a1',q.executionPayload)).ok,false);assert.equal(tables.pending_approvals.length,0)
 assert.equal((await execute(db,'b1','a1',(await prepare(db,'b1','a1',payload)).executionPayload)).ok,true);assert.equal(stageWrites,1)
 reset();const z=await prepare(db,'b1','a1',payload);tables.leads[0].pipeline_stage_key='other';assert.equal((await execute(db,'b1','a1',z.executionPayload)).ok,false);assert.equal(childWrites,0)
 reset();const j=await prepare(db,'b1','a1',payload);failJournal=true;assert.equal((await execute(db,'b1','a1',j.executionPayload)).ok,false);assert.equal(childWrites,0);failJournal=false
 assert.equal((await execute(db,'b1','a1',(await prepare(db,'b1','a1',payload)).executionPayload)).ok,true);assert.equal(stageWrites,1)
 reset();const c=await prepare(db,'b1','a1',payload);lostChild=true;assert.equal((await execute(db,'b1','a1',c.executionPayload)).ok,false);const beforeRetry=childWrites
 assert.equal((await execute(db,'b1','a1',(await prepare(db,'b1','a1',payload)).executionPayload)).ok,true);assert.equal(childWrites,beforeRetry);assert.equal(tables.pending_approvals.length,2)
 console.log('PASS pipeline review: tenant-scoped plan, persisted per-step outcomes, failed-child-only retry, no duplicate proposal, lost-stage-response recovery, conflicting stage refusal.')
})().catch(e=>{console.error(e);process.exitCode=1})
