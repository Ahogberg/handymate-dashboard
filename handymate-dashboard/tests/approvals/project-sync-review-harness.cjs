const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../..'),cache={}
class FortnoxRequestNotSentError extends Error {}
let tables,calls,failLink,lostAccept,lostProvider,remote,lookups,notSent
function load(file){file=path.resolve(file);if(cache[file])return cache[file];const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports,Date,console,process:{env:{}},require:name=>{
 if(name.startsWith('node:'))return require(name)
 if(name==='@/lib/fortnox')return {FortnoxRequestNotSentError,fortnoxRequest:async(b,method,url)=>{assert.equal(b,'b1');assert.equal(method,'GET');assert.equal(url,'/projects/1042');lookups++;if(!remote)throw Error('Remote lookup unavailable');return {Project:structuredClone(remote)}},fortnoxProjectNumberFor:n=>n.replace(/\D/g,''),fortnoxProjectStatus:()=> 'ONGOING',createFortnoxProject:async(b,p)=>{assert.equal(b,'b1');if(notSent)throw new FortnoxRequestNotSentError('no token');calls.push(structuredClone(p));remote=structuredClone(p);if(lostProvider)throw Error('network lost');return {ProjectNumber:p.ProjectNumber}}}
 if(name.startsWith('./'))return load(path.resolve(path.dirname(file),name+'.ts'))
 throw Error('Forbidden dependency '+name)
}});return cache[file]=mod.exports}
const db={from(table){let op='read',values,filters=[],single=false;const chain=new Proxy({}, {get(_,key){
 if(key==='then')return resolve=>{
  const rows=tables[table]||[],match=r=>filters.every(([k,v])=>r[k]===v)
  if(op==='insert'){
   if(rows.some(r=>r.id===values.id))return resolve({data:null,error:{code:'23505'}})
   rows.push(structuredClone(values));tables[table]=rows;return resolve({data:structuredClone(values),error:null})
  }
  if(op==='update'){
   if(table==='project'&&failLink)return resolve({data:null,error:{message:'link failed'}})
   const selected=rows.filter(match);selected.forEach(r=>Object.assign(r,structuredClone(values)))
   if(table==='v3_automation_logs'&&values.status==='accepted'&&lostAccept){lostAccept=false;return resolve({data:null,error:{message:'lost accepted response'}})}
   return resolve({data:structuredClone(selected),error:null})
  }
  const selected=rows.filter(match);return resolve({data:structuredClone(single?selected[0]||null:selected),error:null})
 }
 return(...args)=>{if(['eq','is'].includes(key))filters.push(args);if(['single','maybeSingle'].includes(key))single=true;if(['insert','update'].includes(key)){op=key;values=args[0]}return chain}
}});return chain}}
function reset(){tables={project:[{project_id:'p1',business_id:'b1',project_number:'P-1042',name:'Test',status:'active',fortnox_project_number:null}],business_config:[{business_id:'b1',fortnox_connected:true}],v3_automation_logs:[]};calls=[];failLink=false;lostAccept=false;lostProvider=false;remote=null;lookups=0;notSent=false}
const {prepareProjectSyncReview:prepare,executeProjectSyncReview:execute}=load(path.join(root,'lib/approvals/project-sync-review.ts'))
const payload={project_id:'p1'}
;(async()=>{
 reset();let p=await prepare(db,'b1',payload);assert.equal(calls.length,0);assert.equal(tables.v3_automation_logs.length,0);assert.equal(p.executionPayload.plan.document.Description,'Test (P-1042)')
 await assert.rejects(()=>prepare(db,'foreign',payload),/företaget/)
 failLink=true;let r=await execute(db,'b1','a1',p.executionPayload);assert.equal(r.partial,true);assert.equal(calls.length,1);assert.equal(tables.v3_automation_logs[0].status,'accepted')
 tables.project[0].name='Changed after first attempt';p=await prepare(db,'b1',payload);assert.equal(p.executionPayload.plan.document.Description,'Test (P-1042)');assert.equal(p.review.confirmLabel,'Spara projektkopplingen')
 failLink=false;r=await execute(db,'b1','a1',p.executionPayload);assert.equal(r.ok,true);assert.equal(calls.length,1);assert.equal(tables.project[0].fortnox_project_number,'1042')
 await execute(db,'b1','a1',(await prepare(db,'b1',payload)).executionPayload);assert.equal(calls.length,1)
 reset();p=await prepare(db,'b1',payload);failLink=true;await execute(db,'b1','a1',p.executionPayload);const stored=tables.v3_automation_logs[0].context.plan;tables.v3_automation_logs[0].context.plan={alreadyLinked:stored.alreadyLinked,document:stored.document,projectId:stored.projectId};failLink=false;assert.equal((await execute(db,'b1','a1',p.executionPayload)).ok,true);assert.equal(calls.length,1)
 reset();p=await prepare(db,'b1',payload);lostAccept=true;assert.equal((await execute(db,'b1','a1',p.executionPayload)).partial,true);assert.equal((await execute(db,'b1','a1',(await prepare(db,'b1',payload)).executionPayload)).ok,true);assert.equal(calls.length,1)
 reset();p=await prepare(db,'b1',payload);lostProvider=true;assert.equal((await execute(db,'b1','a1',p.executionPayload)).partial,true);const reconciled=await prepare(db,'b1',payload);assert.equal(reconciled.review.confirmLabel,'Koppla det hittade Fortnox-projektet');assert.equal(tables.project[0].fortnox_project_number,null);assert.equal((await execute(db,'b1','a1',reconciled.executionPayload)).ok,true);assert.equal(calls.length,1);assert.equal(tables.v3_automation_logs[0].status,'saved');assert.equal(lookups,2)
 reset();p=await prepare(db,'b1',payload);lostProvider=true;await execute(db,'b1','a1',p.executionPayload);remote=null;await assert.rejects(()=>prepare(db,'b1',payload),/unavailable/);assert.equal(calls.length,1);assert.equal(tables.project[0].fortnox_project_number,null)
 reset();p=await prepare(db,'b1',payload);lostProvider=true;await execute(db,'b1','a1',p.executionPayload);remote.Description='Different project';const conflict=await prepare(db,'b1',payload);assert.equal(conflict.review.choices[0].required,true);assert.equal(conflict.review.choices[0].defaultSelected,false);assert.equal((await execute(db,'b1','a1',conflict.executionPayload)).ok,false);assert.equal(tables.project[0].fortnox_project_number,null);const chosen=await prepare(db,'b1',payload,{confirm_project_identity:'approved'});assert.equal((await execute(db,'b1','a1',chosen.executionPayload)).ok,true);assert.equal(tables.v3_automation_logs[0].result.identity_confirmed,true);assert.equal(calls.length,1)
 reset();p=await prepare(db,'b1',payload);lostProvider=true;await execute(db,'b1','a1',p.executionPayload);const stale=await prepare(db,'b1',payload);remote.Status='FINISHED';assert.equal((await execute(db,'b1','a1',stale.executionPayload)).ok,false);assert.equal(tables.project[0].fortnox_project_number,null);assert.equal(calls.length,1)
 reset();p=await prepare(db,'b1',payload);notSent=true;let unsent=await execute(db,'b1','a1',p.executionPayload);assert.equal(unsent.ok,false);assert.equal(unsent.partial,false);assert.equal(calls.length,0);assert.equal(tables.v3_automation_logs[0].status,'not_sent');notSent=false;assert.equal((await execute(db,'b1','a1',(await prepare(db,'b1',payload)).executionPayload)).ok,true);assert.equal(calls.length,1)
 reset();p=await prepare(db,'b1',payload);const both=await Promise.all([execute(db,'b1','a1',p.executionPayload),execute(db,'b1','a2',p.executionPayload)]);assert.equal(calls.length,1);assert(both.some(r=>r.ok))
 reset();p=await prepare(db,'b1',payload);tables.project[0].fortnox_project_number='1042';assert.equal((await execute(db,'b1','a1',p.executionPayload)).already_linked,true);assert.equal(calls.length,0)
 reset();tables.project[0].fortnox_project_number='1042';p=await prepare(db,'b1',payload);assert.equal((await execute(db,'b1','a1',p.executionPayload)).already_linked,true);assert.equal(calls.length,0)
 reset();p=await prepare(db,'b1',payload);tables.project[0].fortnox_project_number='999';assert.equal((await execute(db,'b1','a1',p.executionPayload)).ok,false);assert.equal(calls.length,0)
 console.log('PASS actual reviewed Fortnox project execution: exact frozen data, tenant checks, persisted provider acceptance, selective local retry, lost receipt response, duplicate claims, existing linkage and uncertain-provider replay protection. Providers mocked.')
})().catch(e=>{console.error(e);process.exitCode=1})
