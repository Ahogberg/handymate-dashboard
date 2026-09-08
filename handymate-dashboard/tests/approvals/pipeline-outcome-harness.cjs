// Real pipeline core; all downstream effects are isolated adapters.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
let lead, readError=false, zero=false, ruleFailure=false, projectFailure=false, calls=[], writes=0
const stages=[{key:'new_lead',sort_order:1,label:'Ny',creates_project:false},{key:'active_job',sort_order:5,label:'Aktiv',creates_project:true},{key:'lost',sort_order:99,label:'Förlorad',creates_project:false}]
const db={from(table){let op='read',filters=[],values;const chain=new Proxy({}, {get(_,key){
 if(key==='then')return resolve=>{
  if(op!=='read')writes++
  if(table==='pipeline_stages')return resolve({data:readError?null:stages,error:readError?{message:'unavailable'}:null})
  const match=filters.every(([k,v])=>(lead[k]??null)===v)
  if(op==='update'){if(match&&!zero)Object.assign(lead,values);return resolve({data:match&&!zero?[{lead_id:lead.lead_id}]:[],error:null})}
  return resolve({data:match?structuredClone(lead):null,error:null})
 }
 return(...args)=>{if(['eq','is'].includes(key))filters.push(args);if(['update','insert'].includes(key)){op=key;values=args[0]}return chain}
}});return chain}}
const mod={exports:{}}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../../lib/pipeline-stages.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports,Date,console,require:name=>{
 if(name==='@/lib/supabase')return {getServerSupabase:()=>db}
 if(name==='@/lib/automation-engine')return {fireEvent:async(_db,event,business,context)=>{calls.push({kind:'rules',event,business,context});return {matched:1,pending_approval:ruleFailure?0:1,executed:0,skipped:0,failed:ruleFailure?1:0}}}
 if(name==='@/lib/projects/create-from-lead')return {createProjectFromLead:async()=>{calls.push({kind:'project'});return projectFailure?{success:false,error:'project failed'}:{success:true,project_id:'p1'}}}
 throw Error('Forbidden import '+name)
}})
const reset=()=>{lead={lead_id:'l1',business_id:'b1',pipeline_stage_key:'new_lead'};readError=false;zero=false;ruleFailure=false;projectFailure=false;calls=[];writes=0}
const move=()=>mod.exports.moveLeadToStage({businessId:'b1',leadId:'l1',toStageKey:'active_job',triggeredBy:'automation'})
;(async()=>{
 reset();zero=true;assert.equal((await move()).moved,false);assert.equal(calls.length,0)
 reset();readError=true;assert.equal((await move()).moved,false);assert.equal(writes,0);assert.equal(calls.length,0)
 reset();lead.business_id='foreign';assert.equal((await move()).moved,false);assert.equal(writes,0)
 reset();ruleFailure=true;projectFailure=true;const partial=await move();assert.equal(partial.moved,true);assert.equal(partial.partial,true);assert.equal(partial.effects.filter(x=>x.status==='failed').length,2);assert.equal(lead.pipeline_stage_key,'active_job')
 assert.equal(calls[0].context.entity_id,'l1');assert.equal(calls.length,2)
 const count=calls.length;assert.equal((await move()).moved,false);assert.equal(calls.length,count)
 reset();const success=await move();assert.equal(success.partial,false);assert.equal(success.effects.length,3)
 reset();lead.pipeline_stage_key=null;assert.equal((await move()).moved,true)
 console.log('PASS pipeline core: no follow-ups after zero-row mutation, no seeding after read failure, tenant scope, explicit partial results and no implicit replay.')
})().catch(e=>{console.error(e);process.exitCode=1})
