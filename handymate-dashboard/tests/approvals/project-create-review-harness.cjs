const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../..'),cache={}
function load(file){file=path.resolve(file);if(cache[file])return cache[file];const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports,Date,console,process:{env:{}},require:name=>{
 if(name.startsWith('node:'))return require(name)
 if(name==='@/lib/checklist-defaults')return {getChecklistsForBranch:()=>[{name:'Kontroll',category:'test',items:[{label:'Kontrollera',required:true}]}]}
 if(name.startsWith('./'))return load(path.resolve(path.dirname(file),name+'.ts'))
 throw Error('Forbidden dependency '+name)
}});return cache[file]=mod.exports}
let tables,failMilestone=false,lostProject=false,writes=[]
const keys={project:'project_id',project_milestone:'milestone_id',pending_approvals:'id',v3_automation_logs:'id'}
const db={from(table){let op='read',values,filters=[],single=false,limit=Infinity;const chain=new Proxy({}, {get(_,key){
 if(key==='then')return resolve=>{
  const rows=tables[table]||[],match=r=>filters.every(([k,v])=>Array.isArray(v)?v.includes(r[k]):r[k]===v)
  if(op==='insert'){
   writes.push(table)
   if(table==='project_milestone'&&failMilestone)return resolve({data:null,error:{message:'milestone failed'}})
   if(rows.some(r=>r[keys[table]]===values[keys[table]]))return resolve({data:null,error:{code:'23505'}})
   rows.push(structuredClone(values));tables[table]=rows
   if(table==='project'&&lostProject){lostProject=false;return resolve({data:null,error:{message:'lost response'}})}
   return resolve({data:structuredClone(values),error:null})
  }
  if(op==='update'){const selected=rows.filter(match);selected.forEach(r=>Object.assign(r,structuredClone(values)));return resolve({data:structuredClone(selected),error:null})}
  const selected=rows.filter(match).slice(0,limit);return resolve({data:structuredClone(single?selected[0]||null:selected),error:null})
 }
 return(...args)=>{if(['eq','in'].includes(key))filters.push(args);if(key==='limit')limit=args[0];if(['single','maybeSingle'].includes(key))single=true;if(['insert','update'].includes(key)){op=key;values=args[0]}return chain}
}});return chain}}
function reset(){tables={leads:[{lead_id:'l1',business_id:'b1',customer_id:'c1',name:'Ada'}],customer:[{customer_id:'c1',business_id:'b1',name:'Ada',phone_number:'+46700000001',portal_token:'test',portal_enabled:true}],quotes:[{quote_id:'q1',lead_id:'l1',business_id:'b1',customer_id:'c1',title:'Renovering',status:'accepted',items:[{type:'labor',description:'Rivning',quantity:2,total:1000},{type:'labor',description:'Bygg',quantity:3,total:1500}]}],business_config:[{business_id:'b1',business_name:'Test',personal_phone:'+46700000002',branch:'test',fortnox_connected:false}],v3_automation_rules:[],project:[],project_milestone:[],pending_approvals:[],v3_automation_logs:[]};failMilestone=false;lostProject=false;writes=[]}
const {prepareProjectCreationReview:prepare,executeProjectCreationReview:execute}=load(path.join(root,'lib/approvals/project-create-review.ts'))
;(async()=>{
 reset();const p=await prepare(db,'b1','a1',{lead_id:'l1'});assert.equal(writes.length,0);assert.equal(p.executionPayload.plan.artifacts[0].values.budget_amount,2500)
 assert(p.review.details.some(d=>d.label==='Budget timmar'&&d.text==='5'))
 await assert.rejects(()=>prepare(db,'foreign','a1',{lead_id:'l1'}),/företaget/)
 tables.customer[0].business_id='foreign';await assert.rejects(()=>prepare(db,'b1','a1',{lead_id:'l1'}),/Kundkoppling/);tables.customer[0].business_id='b1'
 failMilestone=true;const partial=await execute(db,'b1','a1',p.executionPayload);assert.equal(partial.partial,true);assert.equal(tables.project.length,1);assert.equal(tables.project_milestone.length,0);assert.equal(tables.pending_approvals.length,3)
 const projectCount=writes.filter(t=>t==='project').length,childCount=writes.filter(t=>t==='pending_approvals').length
 failMilestone=false;tables.quotes[0].items[0].total=99999
 const retry=await prepare(db,'b1','a1',{lead_id:'l1'});assert.equal(retry.executionPayload.plan.artifacts[0].values.budget_amount,2500)
 assert.equal((await execute(db,'b1','a1',retry.executionPayload)).ok,true);assert.equal(tables.project_milestone.length,2)
 assert.equal(writes.filter(t=>t==='project').length,projectCount);assert.equal(writes.filter(t=>t==='pending_approvals').length,childCount)
 const count=writes.length;await execute(db,'b1','a1',retry.executionPayload);assert.equal(writes.length,count)
 reset();const lost=await prepare(db,'b1','a1',{lead_id:'l1'});lostProject=true;assert.equal((await execute(db,'b1','a1',lost.executionPayload)).ok,false);assert.equal(tables.pending_approvals.length,0)
 assert.equal((await execute(db,'b1','a1',(await prepare(db,'b1','a1',{lead_id:'l1'})).executionPayload)).ok,true);assert.equal(tables.project.length,1)
 console.log('PASS reviewed project creation: actual project/milestones, tenant scope, frozen budget, separate SMS/checklist proposals, failed-part-only retry and lost-response recovery without duplicates.')
})().catch(e=>{console.error(e);process.exitCode=1})
