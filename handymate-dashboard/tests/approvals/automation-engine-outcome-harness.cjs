const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
const mod={exports:{}}
const req=name=>{
 if(name==='@/lib/pipeline-stages')return {moveLeadToStage:async()=>({moved:true,partial:true,from_stage:'new_lead',to_stage:'active_job',reason:'Project failed',effects:[{effect:'project',status:'failed'}]})}
 if(name==='@/lib/autonomy/earned-autonomy')return {deriveAutonomyKey:()=>null}
 if(name==='@/lib/approvals/automation-message')return {interpolateApprovalTemplate:s=>s}
 throw Error('Unexpected dependency '+name)
}
// Unused imports are removed by transpilation; lazily loaded effects are forbidden.
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../../lib/automation-engine.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
 {module:mod,exports:mod.exports,require:name=>['@/lib/pipeline-stages','@/lib/autonomy/earned-autonomy','@/lib/approvals/automation-message'].includes(name)?req(name):{},Date,Math,console,process:{env:{}},fetch:()=>{throw Error('No provider calls allowed')}})
let logs=[],stats=[],matched=false
const rule={id:'r1',business_id:'b1',name:'Status',description:'Byt status',is_active:true,trigger_type:'event',action_type:'update_status',action_config:{entity:'lead',new_status:'contacted'},requires_approval:true,respects_work_hours:false,respects_night_mode:false,run_count:0}
const db={from(table){let values,op='read';const chain=new Proxy({}, {get(_,key){
 if(key==='then')return resolve=>{
  if(table==='v3_automation_rules'){if(op==='update')stats.push(values);return resolve({data:rule,error:null})}
  if(table==='pending_approvals')return resolve(op==='insert'?{data:null,error:{message:'storage unavailable'}}:{data:null,count:0,error:null})
  if(table==='v3_automation_logs'){logs.push(values);return resolve({data:null,error:null})}
  if(table==='leads')return resolve({data:matched?[{lead_id:'l1'}]:[],error:null})
  return resolve({data:null,error:null})
 }
 return(...args)=>{if(['insert','update'].includes(key)){op=key;values=args[0]}return chain}
}});return chain}}
;(async()=>{
 const result=await mod.exports.executeRule(db,'r1',{entity_id:'l1',require_explicit_approval:true})
 assert.equal(result.status,'failed');assert.equal(result.error,'storage unavailable');assert.equal(logs[0].status,'failed');assert.equal(stats[0].last_run_status,'failed')
 assert.equal(logs[0].error_message,'storage unavailable')
 const failed=await mod.exports.runApprovedAutomationAction(db,'b1','update_status',{entity:'lead',new_status:'contacted'},{entity_id:'l1'})
 assert.equal(failed.success,false)
 matched=true
 assert.equal((await mod.exports.runApprovedAutomationAction(db,'b1','update_status',{entity:'lead',new_status:'contacted'},{entity_id:'l1'})).success,true)
 const pipeline=await mod.exports.runApprovedAutomationAction(db,'b1','update_status',{stage_key:'active_job'},{lead_id:'l1'})
 assert.equal(pipeline.success,false);assert.equal(pipeline.data.partial,true);assert.equal(pipeline.data.effects[0].effect,'project');assert.equal(pipeline.error,'Project failed')
 console.log('PASS actual automation engine: failed approval persistence remains failed in result/log/stats; zero-row status mutation cannot claim success.')
})().catch(e=>{console.error(e);process.exitCode=1})
