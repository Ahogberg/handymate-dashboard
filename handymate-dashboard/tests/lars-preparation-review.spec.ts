import {test,expect} from '@playwright/test'
import fs from 'fs'
import ts from 'typescript'
import crypto from 'crypto'
import {NextRequest,NextResponse} from 'next/server'
import * as contract from '../lib/customer-preparation/contract'
import * as reviewContract from '../lib/customer-preparation/review-contract'
import {deriveRevenueRecoveryCase} from '../lib/value/revenue-recovery-case'
import {selectQueue} from '../lib/value/revenue-work-queue'

const id='11111111-1111-4111-8111-111111111111'
function compile(file:string,deps:Record<string,unknown>) {
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText
  const m={exports:{} as any}
  new Function('require','module','exports',code)((name:string)=>{if(!(name in deps))throw Error(`Unstubbed dependency: ${name}`);return deps[name]},m,m.exports)
  return m.exports
}
function harness() {
  const row:any={id,business_id:'firm',customer_id:'customer',context:'Laddbox vid garaget',template:'charging',status:'submitted',submitted_at:'2026-09-05T10:00:00Z',answers:{location:'Garage',route:'Okänt',wishes:'Extra uttag'},images:[],project_id:null,lars_review:null,review_run_id:null,review_started_at:null}
  const project={project_id:'project',business_id:'firm',customer_id:'customer',name:'Garagearbete',description:'Montering av laddbox',status:'active'}
  const tables:Record<string,any[]>={customer_preparation:[row],project:[project],pending_approvals:[],products:[],quote_templates:[],business_config:[{business_id:'firm',default_hourly_rate:650}]}
  const state={role:'owner',fuel:true,aiCalls:0,costs:0,input:null as any,failImage:false,afterAi:()=>{},afterQuote:()=>{},result:JSON.stringify({summary:'Kabelsträckan är okänd.',checks:[{text:'Mät kabelsträckan före prissättning.',sources:['route']}],questions:[{text:'Var önskar du uttaget?',sources:['wishes']}],possible_additions:[{text:'Stäm av om extra uttag ingår i avtalet.',sources:['wishes']}]})}
  const db:any={storage:{from:()=>({download:async()=>state.failImage?{error:Error('private')}:{data:new Blob([new Uint8Array([255,216,255,0])])}})},from(table:string){
    let filters:Array<(row:any)=>boolean>=[],patch:any=null,insert:any=null,single=false
    const get=(r:any,k:string)=>k.includes('->>')?r[k.split('->>')[0]]?.[k.split('->>')[1]]:r[k]
    const q:any={select:()=>q,order:()=>q,limit:()=>q,eq:(k:string,v:any)=>{filters.push(r=>get(r,k)===v);return q},in:(k:string,v:any[])=>{filters.push(r=>v.includes(r[k]));return q},is:(k:string,v:any)=>{filters.push(r=>r[k]===v);return q},contains:(k:string,v:any)=>{filters.push(r=>Object.keys(v).every(key=>r[k]?.[key]===v[key]));return q},or:(s:string)=>{filters.push(r=>r.review_run_id===null || r.review_started_at<s.split('.lt.')[1]);return q},update:(v:any)=>{patch=v;return q},insert:(v:any)=>{insert=v;return q},maybeSingle:()=>{single=true;return q},then:(resolve:any,reject:any)=>Promise.resolve().then(()=>{
      if(insert){if(tables[table].some(r=>r.id===insert.id))return {data:null,error:{code:'23505'}};tables[table].push({...insert});return {data:null,error:null}}
      const matches=(tables[table]||[]).filter(r=>filters.every(f=>f(r)))
      if(patch)matches.forEach(r=>Object.assign(r,patch))
      return {data:single?(matches[0]?structuredClone(matches[0]):null):structuredClone(matches),count:matches.length,error:null}
    }).then(resolve,reject)};return q
  }}
  const server=compile('lib/customer-preparation/review-server.ts',{
    crypto,'@anthropic-ai/sdk':class {messages={create:async(input:any)=>{state.aiCalls++;state.input=input;state.afterAi();return {content:[{type:'text',text:state.result}],usage:{input_tokens:100,output_tokens:100}}}}},
    '@/lib/costs/fuel':{checkFuelGate:async()=>({allowed:state.fuel})},'@/lib/agents/shared/cost-guard':{meterDirectLlmCall:async()=>{state.costs++}},'@/lib/costs/meter':{llmCostUsd:()=>0.001},'./server':{BUCKET:'customer-preparation'},'./contract':contract,'./review-contract':reviewContract,
  })
  const ata=compile('lib/ata/suggest-ata-draft.ts',{
    '@/lib/ai/decision-record':{buildDecisionRecord:()=>({}),withDecisionRecord:()=>({})},'@/lib/company/company-model':{hourlyRateField:()=>({value:650})},'@/lib/observability/driftlarm':{rapporteraTystFel:async()=>{}},'@/lib/branch':{describeBranches:()=>'',resolveBusinessBranch:()=>''},'@/lib/ai-quote-generator':{generateQuoteFromInput:async()=>{state.afterQuote();return {items:[{description:'Uttag',quantity:1,unit_price:100}],jobTitle:'Extra uttag',model:'test'}}},
  })
  const route=compile('app/api/customer-preparation/review/route.ts',{
    crypto,'next/server':{NextResponse},'@/lib/costs/fuel':{checkFuelGate:async()=>({allowed:state.fuel})},'@/lib/auth':{getAuthenticatedBusiness:async()=>({business_id:'firm'}),checkAiApiRateLimit:()=>({allowed:true})},'@/lib/permissions':{getCurrentUser:async()=>({id:'user',role:state.role})},'@/lib/supabase':{getServerSupabase:()=>db},'@/lib/customer-preparation/review-server':server,'@/lib/ata/suggest-ata-draft':ata,
  })
  return {row,project,state,tables,server,db,ata,request:(action:string,extra:Record<string,unknown>={})=>route.POST(new NextRequest('https://test/api/customer-preparation/review',{method:'POST',body:JSON.stringify({id,action,...extra})})) as Promise<Response>}
}
test.beforeEach(()=>{process.env.ANTHROPIC_API_KEY='isolated-test-only'})
test.afterEach(()=>{delete process.env.ANTHROPIC_API_KEY})

test('customer response → real review handler → human approval → canonical ATA proposal → revenue queue',async()=>{
  const h=harness()
  expect((await h.request('link',{project_id:'project'})).status).toBe(200)
  expect((await h.request('review')).status).toBe(200)
  expect(h.state.aiCalls).toBe(1);expect(h.state.costs).toBe(1)
  expect(JSON.stringify(h.state.input)).not.toContain(id)
  expect(JSON.stringify(h.state.input)).not.toContain('project_id')
  expect(h.row.status).toBe('submitted')
  expect((await h.request('ata',{fingerprint:h.row.lars_review.fingerprint,description:'Extra uttag på garageväggen'})).status).toBe(409)
  expect((await h.request('approve',{fingerprint:h.row.lars_review.fingerprint})).status).toBe(200)
  const args={fingerprint:h.row.lars_review.fingerprint,description:'Extra uttag på garageväggen'}
  expect((await h.request('ata',args)).status).toBe(200)
  expect((await h.request('ata',args)).status).toBe(200)
  expect(h.tables.pending_approvals).toHaveLength(1)
  const approval=h.tables.pending_approvals[0]
  expect(approval.payload).toMatchObject({project_id:'project',source_preparation_id:id,routed_agent:'lars'})
  const queue=selectQueue([deriveRevenueRecoveryCase({approval:{...approval,created_at:'2026-09-05T10:00:00Z',resolved_at:null},project:{...h.project,completed_at:null},changes:[],invoice:null})],'action')
  expect(queue[0]).toMatchObject({phase:'needs_review',next_action:{href:'/dashboard/approvals'}})
  expect((await h.request('link',{project_id:null})).status).toBe(409)
})
test('review works without a project or history and caches the same source',async()=>{
  const h=harness();expect((await h.request('review')).status).toBe(200)
  expect((await h.request('review')).status).toBe(200);expect(h.state.aiCalls).toBe(1)
  expect(h.row.lars_review.project_id).toBeNull()
})
test('role, fuel, missing migration and foreign customer prevent work',async()=>{
  const h=harness();h.state.role='employee';expect((await h.request('review')).status).toBe(403)
  h.state.role='owner';h.state.fuel=false;expect((await h.request('review')).status).toBe(402)
  h.project.customer_id='other';expect((await h.request('link',{project_id:'project'})).status).toBe(403)
  delete h.row.lars_review;expect((await h.request('review')).status).toBe(503)
  expect(h.state.aiCalls).toBe(0)
})
test('unreadable or foreign images cannot produce a complete saved review',async()=>{
  const h=harness();h.row.images=['other/private.jpg'];expect((await h.request('review')).status).toBe(409)
  h.row.images=[`firm/${id}/photo.jpg`];h.state.failImage=true;expect((await h.request('review')).status).toBe(503)
  expect(h.state.aiCalls).toBe(0);expect(h.row.review_run_id).toBeNull();expect(h.row.lars_review).toBeNull()
})
test('valid private image reaches the model, storage paths and internal IDs do not',async()=>{
  const h=harness();h.row.images=[`firm/${id}/photo.jpg`]
  expect((await h.request('review')).status).toBe(200)
  expect(h.row.lars_review.image_count).toBe(1)
  expect(h.state.input.messages[0].content.some((c:any)=>c.type==='image')).toBe(true)
  expect(JSON.stringify(h.state.input)).not.toContain(id)
})
test('changed source during generation and invented source references are rejected',async()=>{
  const h=harness();h.state.afterAi=()=>{h.row.context='Ändrat underlag'}
  expect((await h.request('review')).status).toBe(409);expect(h.row.lars_review).toBeNull()
  h.state.afterAi=()=>{};h.state.result=JSON.stringify({summary:'Test',checks:[{text:'Fynd',sources:['invented']}],questions:[],possible_additions:[]})
  expect((await h.request('review')).status).toBe(503);expect(h.row.review_run_id).toBeNull()
})
test('changed project invalidates approval and a fresh review requires human review again',async()=>{
  const h=harness();await h.request('link',{project_id:'project'});await h.request('review')
  const old=h.row.lars_review.fingerprint
  await h.request('approve',{fingerprint:old});h.project.description='Ny omfattning'
  expect((await h.request('ata',{fingerprint:old,description:'Extra uttag på garaget'})).status).toBe(409)
  expect((await h.request('review')).status).toBe(200);expect(h.row.status).toBe('submitted')
})
test('simultaneous reviews invoke the model only once',async()=>{
  const h=harness();const responses=await Promise.all([h.request('review'),h.request('review')])
  expect(responses.map(r=>r.status).sort()).toEqual([200,409]);expect(h.state.aiCalls).toBe(1)
})


test('project changes during ATA generation prevent insertion',async()=>{
  const h=harness();await h.request('link',{project_id:'project'});await h.request('review')
  await h.request('approve',{fingerprint:h.row.lars_review.fingerprint})
  h.state.afterQuote=()=>{h.project.description='Ändrad omfattning under generering'}
  expect((await h.request('ata',{fingerprint:h.row.lars_review.fingerprint,description:'Extra uttag på garageväggen'})).status).toBe(503)
  expect(h.tables.pending_approvals).toHaveLength(0);expect(h.row.review_run_id).toBeNull()
})
test('an abandoned action lock can be retried after its lease expires',async()=>{
  const h=harness();await h.request('link',{project_id:'project'});await h.request('review')
  await h.request('approve',{fingerprint:h.row.lars_review.fingerprint})
  h.row.review_run_id='old-run';h.row.review_started_at='2026-01-01T00:00:00Z'
  expect((await h.request('ata',{fingerprint:h.row.lars_review.fingerprint,description:'Extra uttag på garageväggen'})).status).toBe(200)
  expect(h.tables.pending_approvals).toHaveLength(1)
})
