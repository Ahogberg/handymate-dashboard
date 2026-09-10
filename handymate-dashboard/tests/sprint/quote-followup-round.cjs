const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs')
const {load}=require('./onboarding-completion.cjs')
const clone=v=>structuredClone(v)
const sentAt=new Date(Date.now()-20*86400000).toISOString()
const scope={quote_id:'quote_waiting',sent_at:sentAt,round:1,channel:'sms'}
function setup() {
  const customer={customer_id:'customer_waiting',business_id:'biz_a',name:'Anders',phone_number:'+46700000001',email:'test@example.invalid',sms_opt_out:false}
  return {fail:null,calls:[],tables:{quotes:[{quote_id:scope.quote_id,business_id:'biz_a',customer_id:customer.customer_id,status:'sent',sent_at:sentAt,
    valid_until:new Date(Date.now()+60*86400000).toISOString().slice(0,10),follow_up_count:0,total:5000,customer_pays:5000,title:'Service',description:'Montering',accepted_at:null,declined_at:null,customer}],
    customer:[customer],quote_items:[{id:'qi_a',business_id:'biz_a',quote_id:scope.quote_id,description:'Arbetstid',quantity:4,unit_price:1000}]}}
}
function database(s) {return {from(table){
  let op='read',value,filters=[],one=false,head=false,ors=[]
  const read=(r,k)=>k==='payload->>quote_followup_send_claimed_at'?r.payload?.quote_followup_send_claimed_at:r[k]
  const q={select(_fields,options){head=options?.head||false;return q},eq(k,v){filters.push(r=>read(r,k)===v);return q},is(k,v){filters.push(r=>v===null?read(r,k)==null:read(r,k)===v);return q},
    in(k,values){filters.push(r=>values.includes(read(r,k)));return q},gte(k,v){filters.push(r=>read(r,k)>=v);return q},lt(k,v){filters.push(r=>read(r,k)<v);return q},
    contains(k,v){filters.push(r=>Object.entries(v).every(([a,b])=>r[k]?.[a]===b));return q},order(){return q},limit(){return q},
    or(str){ors.push(r=>str.split(',').some(part=>{const [k,cmp,v]=part.split('.');return cmp==='is'?r[k]==null:r[k]===Number(v)}));return q},
    update(v){op='update';value=v;return q},insert(v){op='insert';value=v;return q},
    maybeSingle(){one=true;return Promise.resolve(result())},single(){one=true;return Promise.resolve(result())},then(a,b){return Promise.resolve(result()).then(a,b)}}
  function result(){
    if(s.fail===`${table}:${op}`)return {data:null,error:{message:'injected failure'}}
    s.tables[table]||=[]
    if(op==='insert') {if(s.tables[table].some(r=>r.id===value.id && value.id))return {data:null,error:{code:'23505',message:'duplicate key'}}
      s.tables[table].push(clone({...value,created_at:new Date().toISOString()}));return {data:one?clone(value):[clone(value)],error:null}}
    const rows=s.tables[table].filter(r=>filters.every(f=>f(r))&&ors.every(f=>f(r)))
    if(op==='update')for(const row of rows)Object.assign(row,clone(value))
    return {data:head?null:one?clone(rows[0]||null):clone(rows),count:rows.length,error:null}
  }return q
}}}
async function modules(){const artifact=await load('lib/approvals/artifact-write.ts',{'node:crypto':crypto})
  const m=await load('lib/quotes/followup-round.ts',{'node:crypto':crypto,'@/lib/approvals/artifact-write':artifact});return m}
const payload={to:'+46700000001',message:'Hej! Har du funderingar kring offerten?'}
const tests=[];const test=(name,fn)=>tests.push([name,fn])
test('scoped runs cannot delegate or create unrelated artifacts',async m=>{
  for(const tool of ['send_agent_message','handoff_to_agent','create_invoice','create_quote','schedule_quote_followup','send_email'])assert.equal(m.isQuoteFollowupTool(tool,scope),false)
  for(const tool of ['get_customer','get_quotes','read_customer_emails','send_sms'])assert.equal(m.isQuoteFollowupTool(tool,scope),true)
  const router=fs.readFileSync('app/api/agent/trigger/tool-router.ts','utf8');assert(router.indexOf('!isQuoteFollowupTool(name, context.quoteFollowupRound)')<router.indexOf('switch (name)'))
})
test('concurrent composition and replay produce exactly one scoped approval',async m=>{
  const s=setup(),db=database(s);const [a,b]=await Promise.all([m.prepareQuoteFollowupRound(db,'biz_a',scope,'send_sms',payload),m.prepareQuoteFollowupRound(db,'biz_a',scope,'send_sms',payload)])
  assert.equal(a.data.approval_id,b.data.approval_id);assert.equal(s.tables.pending_approvals.length,1)
  const p=s.tables.pending_approvals[0].payload;assert.equal(p.quote_id,scope.quote_id);assert.equal(p.related_id,scope.quote_id);assert.equal(p.customer_id,'customer_waiting');assert.equal(p.agent_id,'daniel')
  assert.equal(s.tables.quotes[0].follow_up_count,0)
})
test('round keys isolate business, quote, send cycle and round',async m=>{
  const ids=[m.quoteFollowupApprovalId('biz_a',scope),m.quoteFollowupApprovalId('biz_b',scope),m.quoteFollowupApprovalId('biz_a',{...scope,quote_id:'q2'}),m.quoteFollowupApprovalId('biz_a',{...scope,round:2,channel:'email'}),m.quoteFollowupApprovalId('biz_a',{...scope,sent_at:'2026-01-01T00:00:00Z'})]
  assert.equal(new Set(ids).size,5)
})
for(const state of ['pending','rejected','approved','expired'])test(`${state} without provider receipt holds the round without a new card`,async m=>{
  const s=setup(),db=database(s);await m.prepareQuoteFollowupRound(db,'biz_a',scope,'send_sms',payload);s.tables.pending_approvals[0].status=state
  assert.equal((await m.reconcileQuoteFollowupRound(db,'biz_a',scope)).state,'held')
  await m.prepareQuoteFollowupRound(db,'biz_a',scope,'send_sms',payload);assert.equal(s.tables.pending_approvals.length,1);assert.equal(s.tables.quotes[0].follow_up_count,0)
})
test('only persisted success plus channel receipt advances once',async m=>{
  const s=setup(),db=database(s);await m.prepareQuoteFollowupRound(db,'biz_a',scope,'send_sms',payload);const card=s.tables.pending_approvals[0]
  card.status='approved';card.payload.execution_result={outcome:'success',executed_at:new Date().toISOString()}
  assert.equal((await m.reconcileQuoteFollowupRound(db,'biz_a',scope)).state,'held')
  card.payload.execution_result.artifacts={message_id:'wrong_channel'};assert.equal((await m.reconcileQuoteFollowupRound(db,'biz_a',scope)).state,'held')
  card.payload.execution_result.artifacts={sms_id:'provider_receipt'}
  assert.equal((await m.reconcileQuoteFollowupRound(db,'biz_a',scope)).advanced,true);assert.equal((await m.reconcileQuoteFollowupRound(db,'biz_a',scope)).advanced,false);assert.equal(s.tables.quotes[0].follow_up_count,1)
})
test('recipient/channel/tenant mismatch cannot prepare a message',async m=>{
  for(const [biz,type,p] of [['biz_b','send_sms',payload],['biz_a','send_email',payload],['biz_a','send_sms',{...payload,to:'+46700000002'}]]){
    const s=setup();await assert.rejects(()=>m.prepareQuoteFollowupRound(database(s),biz,scope,type,p));assert.equal(s.tables.pending_approvals?.length||0,0)}
})
for(const status of ['accepted','signed','declined','expired'])test(`${status} blocks preparation/execution`,async m=>{
  const s=setup();s.tables.quotes[0].status=status;await assert.rejects(()=>m.verifyQuoteFollowupSource(database(s),'biz_a',scope))
})
test('changed quote rows or recipient block the old reviewed source',async m=>{
  for(const change of [s=>s.tables.quote_items[0].quantity++,s=>s.tables.customer[0].phone_number='+46700000002']){
    const s=setup(),db=database(s);const v=await m.verifyQuoteFollowupSource(db,'biz_a',scope);change(s)
    await assert.rejects(()=>m.verifyQuoteFollowupSource(db,'biz_a',scope,payload.to,v.source))}
})
test('opening the quote is allowed while content remains unchanged',async m=>{
  const s=setup(),db=database(s);const v=await m.verifyQuoteFollowupSource(db,'biz_a',scope);s.tables.quotes[0].status='opened'
  await m.verifyQuoteFollowupSource(db,'biz_a',scope,payload.to,v.source)
})
for(const table of ['sms_log','email_conversations','customer_message','call_recording','call','communication_log'])test(`linked inbound ${table} stops the next send`,async m=>{
  const s=setup();s.tables[table]=[{business_id:'biz_a',customer_id:'customer_waiting',direction:'inbound',created_at:new Date().toISOString(),started_at:new Date().toISOString()}]
  await assert.rejects(()=>m.verifyQuoteFollowupSource(database(s),'biz_a',scope),/Kunden har hört av sig/)
})
test('read failures cannot create approval or advance the round',async m=>{
  for(const table of ['quotes','customer','quote_items','sms_log','pending_approvals']){const s=setup(),db=database(s);s.fail=`${table}:read`
    await assert.rejects(()=>m.prepareQuoteFollowupRound(db,'biz_a',scope,'send_sms',payload));assert.equal(s.tables.pending_approvals?.length||0,0)}
})
test('send claim survives lost provider response and blocks concurrent/blind retries',async m=>{
  const s=setup(),db=database(s);await m.prepareQuoteFollowupRound(db,'biz_a',scope,'send_sms',payload);const card=s.tables.pending_approvals[0];card.status='approved'
  const original=clone(card.payload),second=clone(card.payload)
  await m.claimQuoteFollowupSend(db,'biz_a',card.id,original);assert(original.quote_followup_send_claimed_at)
  await assert.rejects(()=>m.claimQuoteFollowupSend(db,'biz_a',card.id,second));await assert.rejects(()=>m.claimQuoteFollowupSend(db,'biz_a',card.id,clone(card.payload)))
  assert.equal((await m.reconcileQuoteFollowupRound(db,'biz_a',scope)).state,'held')
})
test('failed claim never authorizes provider execution',async m=>{
  const s=setup(),db=database(s);await m.prepareQuoteFollowupRound(db,'biz_a',scope,'send_sms',payload);const card=s.tables.pending_approvals[0];card.status='approved';s.fail='pending_approvals:update'
  await assert.rejects(()=>m.claimQuoteFollowupSend(db,'biz_a',card.id,card.payload));assert.equal(card.payload.quote_followup_send_claimed_at,undefined)
})
async function cron(m,s,source='app/api/cron/quote-follow-up/route.ts'){const db=database(s),cadence=await load('lib/quotes/followup-cadence.ts',{})
 const api=await load(source,{
  '@/lib/quotes/followup-round':m,'@/lib/followup/service':{hasDurableFollowup:async()=>false},'next/server':{NextRequest:Request,NextResponse:Response},
  '@/lib/cron/verify-secret':{verifyCronSecret:()=>true},'@/lib/supabase':{getServerSupabase:()=>db},
  '@/lib/agent-trigger':{makeIdempotencyKey:(...p)=>p.join('::'),triggerAgentInternal:async(biz,type,data)=>{if(!data.quote_followup_round)return {success:true,run_id:'old_group_run'};s.calls.push(data.quote_followup_round.quote_id)
    if(data.quote_followup_round.quote_id===scope.quote_id)await m.prepareQuoteFollowupRound(db,biz,data.quote_followup_round,'send_sms',payload)
    return {success:true,run_id:'run_without_delivery'}}},
  '@/lib/sms-reply-number':{buildSmsSuffix:()=>''},'@/lib/autonomy/earned-autonomy':{isAutonomous:async()=>false,getAutonomyCap:async()=>null,underAutonomyCap:()=>false,recordAutonomyFailure:async()=>{}},
  '@/lib/sms-send':{sendSmsViaElks:()=>{throw Error('Unexpected live send')}},'@/lib/auth':{getBusinessPlanFromConfig:()=>''},'@/lib/sms-usage':{checkSmsAllowance:()=>({allowed:false})},
  '@/lib/quotes/statuses':{OPEN_QUOTE_STATUSES:['sent','opened']},'@/lib/quotes/followup-cadence':cadence,
  '@/lib/agents/daniel/unopened-quotes':{filterOutConflicting:(items,conflicts)=>items.filter(i=>!conflicts.has(i.quote_id)),UNOPENED_CONFLICT_WINDOW_HOURS:168},
  '@/lib/testdata':{arTestId:()=>false,arTestNamn:()=>false},'@/lib/mandates/mission-mandate':{registerMandateDeliveryFailure:async()=>{}},
  '@/lib/mandates/resolve':{loadMandateResolutionCache:async()=>({}),resolveMandateForAction:async()=>({covered:false}),MANDATE_TRUTH_CLASS:{}},
 });return api.GET(new Request('https://unit.invalid/api/cron/quote-follow-up'))
}
test('actual cron: partial/no-tool agent result never spends either quote round',async m=>{
  const s=setup();s.tables.quotes.push({...clone(s.tables.quotes[0]),quote_id:'quote_second'})
  const r=await cron(m,s),body=await r.json();assert.equal(r.status,503);assert.equal(body.follow_ups_sent,0);assert.equal(body.follow_ups_prepared,1);assert.equal(body.follow_ups_failed,1)
  assert.deepEqual(s.tables.quotes.map(q=>q.follow_up_count),[0,0]);assert.deepEqual(s.calls,[scope.quote_id,'quote_second'])
  s.calls=[];await cron(m,s);assert.deepEqual(s.calls,['quote_second']);assert.equal(s.tables.pending_approvals.length,1)
  assert(s.tables.v3_automation_logs.every(l=>l.action_type==='prepare_quote_followup'))
})
test('approval preview and both actual execution cases revalidate and claim before provider',async()=>{
  const src=fs.readFileSync('app/api/approvals/[id]/route.ts','utf8'),review=fs.readFileSync('lib/approvals/prepare-review.ts','utf8')
  for(const name of ['send_sms','send_email']){const part=src.split(`case '${name}': {`)[1].split('\n      case ')[0];assert(part.indexOf('verifyQuoteFollowupSource')<part.indexOf('claimQuoteFollowupSend'));assert(part.includes('payload.quote_followup_source'))}
  assert(review.includes('await verifyQuoteFollowupSource'));assert(review.includes('if (p.quote_followup_send_claimed_at)'))
})
test('customer-facing handoff does not promise a next round after rejection or an unknown send',async()=>{
  const cadence=await load('lib/quotes/followup-cadence.ts',{}),h=await load('lib/quotes/handoff.ts',{'./followup-cadence':cadence,'./statuses':{OPEN_QUOTE_STATUSES:['sent','opened'],WON_QUOTE_STATUSES:['accepted','signed']}})
  const s=setup(),input={quote:s.tables.quotes[0],paused:false,teamActive:true,hasPhone:true,hasEmail:true,rules:[],logs:[],pendingId:null,intervalDays:5,today:new Date().toISOString().slice(0,10),now:Date.now()}
  for(const status of ['rejected','approved','expired']){const value=h.deriveQuoteHandoff({...input,followupRound:{id:'card',status,sendClaimed:status==='approved',providerAccepted:false,expired:status==='expired'}})
    assert.equal(value.state,'attention');assert.equal(value.eligibleAt,undefined);assert(value.next.includes('Inget nytt uppföljningskort'))}
})
module.exports={modules,setup,cron}
if(require.main===module)(async()=>{const m=await modules();for(const [name,fn] of tests){await fn(m);console.log('PASS',name)}console.log(`PASS ${tests.length} followup round contracts; actual helpers/cron, isolated DB and agent/provider`)})().catch(e=>{console.error(e);process.exitCode=1})
