const assert=require('node:assert/strict'), {load}=require('./onboarding-completion.cjs')
async function fixture(failure) {
 const state={failure,writes:[],rows:{reservation_texts:[{id:'existing'}],service_agreement_type:[]}}
 const db={from(table){let op='read',rows
  const q={select:()=>q,eq:()=>q,limit:()=>q,order:()=>q,insert(r){op='write';rows=r;return q},delete(){op='delete';return q},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}}
  function result(){if(state.failure===table+':'+op)return {data:null,error:{message:'injected failure'},count:null}
   if(op!=='read'){state.writes.push({table,op,rows});if(op==='write')state.rows[table]=[...(state.rows[table]||[]),...rows]}
   return {data:state.rows[table]||[],error:null,count:0}}
  return q},rpc:async()=>({error:state.failure==='rpc:write'?{message:'injected rpc failure'}:null})}
 const pipeline=await load('lib/pipeline.ts',{'@/lib/supabase':{getServerSupabase:()=>db}})
 const seed=await load('lib/seed-defaults.ts',{
  '@/lib/supabase':{getServerSupabase:()=>db}, '@/lib/pipeline':pipeline,
  '@/lib/quote-standard-text-defaults':{getDefaultStandardTexts:()=>[{name:'Terms',text_type:'payment_terms',content:'Terms'}]},
  '@/lib/checklist-defaults':{getChecklistsForBranch:()=>[{name:'Checklist',items:[]}]},
  '@/lib/product-defaults':{applyHourlyRateToDefaults:rows=>rows,getStarterProducts:()=>[{name:'Work',unit:'tim',category:'arbete',unit_price:950}]},
  '@/lib/reservation-defaults':{getDefaultReservations:()=>[]},
  '@/lib/quote-template-defaults':{normalizeTemplateBranch:v=>v,getDefaultQuoteTemplates:()=>[{name:'First',default_items:[]},{name:'Second',default_items:[]}]},
  '@/lib/agreement-type-defaults':{getDefaultAgreementTypes:()=>[]},
 })
 return {state,run:()=>seed.seedAllDefaults(db,'biz_test','electrician',[],950)}
}
;(async()=>{
 let count=0
 for(const table of ['v3_automation_rules','lead_scoring_rules','pipeline_stage','quote_standard_texts','checklist_template','products','quote_templates']){
  const h=await fixture(table+':read');assert((await h.run()).failed>0,table+' read must be reported')
  assert(!h.state.writes.some(w=>w.table===table),table+' read failure must not imply empty')
  h.state.failure=null;assert.equal((await h.run()).failed,0);count++;console.log('PASS read failure/recovery',table)
 }
 for(const table of ['v3_automation_rules','pipeline_stage','quote_standard_texts','checklist_template','products','quote_templates','rpc']){
  const h=await fixture(table+':write');assert((await h.run()).failed>0,table+' write must be reported')
  h.state.failure=null;assert.equal((await h.run()).failed,0);count++;console.log('PASS write failure/recovery',table)
 }
 const h=await fixture();h.state.rows.quote_templates=[{id:'qtpl_biz_test_0',name:'First'}]
 assert.equal((await h.run()).failed,0);assert.equal(h.state.rows.quote_templates[1].id,'qtpl_biz_test_1');count++
 console.log(`PASS ${count} actual onboarding seeding contracts; database isolated`)
})().catch(e=>{console.error(e);process.exitCode=1})
