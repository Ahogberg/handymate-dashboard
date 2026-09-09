const {load,database}=require('./integrity-loader.cjs'),assert=require('node:assert/strict')
const cases=[];const test=(n,f)=>cases.push([n,f])
const connection={id:'conn',business_id:'b',access_token:'access',refresh_token:'refresh',account_email:'owner@example.invalid',gmail_last_history_id:'100',gmail_sync_started_at:null,token_expires_at:null}
function setup(mode,options={}){
 const log=[],updates=[],ids=[];let historyPages=0,listPages=0,disabled=false
 const row={...connection,...options}
 const db=database(({table,op,value,filters})=>{
  log.push([table,op,value,filters]);assert(filters.some(f=>f[1]==='business_id'&&f[2]==='b'))
  if(table==='email_conversations')return {data:mode==='already-stored'?{id:'stored'}:null,error:mode==='dedup-read-error'?{}:null}
  assert.equal(table,'calendar_connection')
  if(op==='update'){
   updates.push(value)
   if('gmail_sync_started_at' in value)assert(filters.some(f=>f[0]==='is'&&f[1]==='gmail_sync_started_at'&&f[2]===null))
   if('gmail_last_history_id' in value)assert(filters.some(f=>f[1]==='gmail_last_history_id'&&f[2]===row.gmail_last_history_id))
   return {data:['cursor-empty','anchor-empty'].includes(mode)?null:{id:'conn'},error:mode==='cursor-error'?{}:null}
  }
  assert(filters.some(f=>f[1]==='gmail_sync_enabled'&&f[2]===true));assert(filters.some(f=>f[1]==='gmail_scope_granted'&&f[2]===true))
  return {data:mode==='disabled'||disabled?null:row,error:mode==='connection-error'?{}:null}
 })
 const provider={users:{history:{list:async args=>{
  log.push(['history',args]);historyPages++
  if(mode==='expired')throw {code:404}
  if(mode==='history-page-error'&&historyPages===2)throw Error('page failed')
  return {data:{historyId:historyPages===1?'200':'300',history:[{messagesAdded:[{message:{id:historyPages===1?'m1':'m2'}}]}],nextPageToken:historyPages===1?'page-two':mode==='repeated-page'?'page-two':null}}
 }},messages:{list:async args=>{
  log.push(['list',args]);listPages++
  return {data:{messages:[{id:listPages===1?'m1':'m2'}],nextPageToken:listPages===1?'page-two':null}}
 },get:async({id})=>{
  ids.push(id)
  if(mode==='message-error'&&id==='m2')throw Error('message failed')
  if(mode==='deleted')throw {response:{status:404}}
  if(mode==='empty-message')return {data:{}}
  if(mode==='disabled-during-fetch')disabled=true
  return {data:{id,threadId:'thread',payload:{headers:[]}}}
 }},getProfile:async()=>{log.push(['profile']);return {data:{historyId:'150'}}}}}
 const poller=load('lib/gmail/poller.ts',{
  '@/lib/supabase':{getServerSupabase:()=>db},googleapis:{google:{gmail:()=>provider}},
  '@/lib/google-calendar':{ensureValidToken:async()=>{if(mode==='token-throws')throw Error('refresh failed');return {access_token:'access'}},getGoogleAuthClient:()=>({setCredentials:()=>{}})},
  './processor':{processInboundEmail:async(db,b,msg)=>{log.push(['process',msg.messageId]);if(mode==='process-throws')throw Error('save failed');return {stored:!['process-false','duplicate'].includes(mode),reason:mode==='duplicate'?'duplicate':'database error'}}},
 })
 return {poller,log,updates,ids,row}
}
for(const mode of ['completed','message-error','process-false','process-throws','history-page-error','repeated-page','expired','deleted','empty-message','cursor-empty','cursor-error','dedup-read-error','disabled','disabled-during-fetch','connection-error','already-stored','duplicate','token-throws'])test(`actual poller ${mode}`,async()=>{
 const env=setup(mode);const result=await env.poller.pollGmailForBusiness(env.row)
 const success=['completed','deleted','already-stored','duplicate'].includes(mode)
 if(success){assert.equal(result.error,undefined);assert.equal(result.processed,2)}else if(mode!=='disabled')assert(result.error,mode)
 if(mode==='disabled'){assert.equal(result.processed,0);assert.equal(env.ids.length,0)}
 const cursors=env.updates.filter(x=>'gmail_last_history_id' in x)
 assert.equal(cursors.length,success||mode.startsWith('cursor-')?1:0,mode)
 if(success)assert.equal(cursors[0].gmail_last_history_id,'300')
 if(mode==='history-page-error'||mode==='expired')assert.equal(env.ids.length,0)
 if(mode==='disabled-during-fetch')assert(!env.log.some(x=>x[0]==='process'))
 if(mode==='already-stored')assert.equal(env.ids.length,0)
 assert.equal(env.row.gmail_last_history_id,'100','caller snapshot must not be mutated')
})
test('bootstrap lists all pages from a saved fixed window and captures baseline BEFORE listing',async()=>{
 const env=setup('completed',{gmail_last_history_id:null,gmail_sync_started_at:'2026-09-01T00:00:00.000Z'})
 const result=await env.poller.pollGmailForBusiness(env.row);assert.equal(result.error,undefined)
 const lists=env.log.filter(x=>x[0]==='list');assert.equal(lists.length,2);assert.equal(lists[1][1].pageToken,'page-two')
 assert.equal(lists[0][1].q,`in:inbox after:${Date.parse('2026-08-31T00:00:00Z')/1000}`)
 assert(env.log.findIndex(x=>x[0]==='profile')<env.log.findIndex(x=>x[0]==='list'))
 assert.equal(env.updates.at(-1).gmail_last_history_id,'150')
})
test('first bootstrap saves anchor before network; empty anchor claim cannot send requests',async()=>{
 const good=setup('completed',{gmail_last_history_id:null});await good.poller.pollGmailForBusiness(good.row)
 assert('gmail_sync_started_at' in good.updates[0])
 const bad=setup('anchor-empty',{gmail_last_history_id:null});assert((await bad.poller.pollGmailForBusiness(bad.row)).error);assert(!bad.log.some(x=>x[0]==='profile'))
})
test('elapsed budget leaves cursor intact',async()=>{
 const env=setup('completed');const result=await env.poller.pollGmailForBusiness(env.row,0);assert(result.error);assert.equal(env.updates.length,0)
})
for(const failed of [false,true])test(`all businesses respects opt-out and reports connection query failure=${failed}`,async()=>{
 const db={from:()=>{const filters=[];const q={select:()=>q,eq:(...a)=>{filters.push(a);return q},not:()=>q,then:resolve=>{assert(filters.some(f=>f[0]==='gmail_sync_enabled'&&f[1]===true));return Promise.resolve({data:[],error:failed?{}:null}).then(resolve)}};return q}}
 const poller=load('lib/gmail/poller.ts',{'@/lib/supabase':{getServerSupabase:()=>db},googleapis:{},'@/lib/google-calendar':{},'./processor':{}})
 const result=await poller.pollAllBusinesses();assert.equal(result.errors.length,failed?1:0)
})
for(const mode of ['duplicate','duplicate-read-error','customer-read-error','ambiguous-customer','outbound-no-receipt'])test(`actual email processor ${mode}`,async()=>{
 let writes=0
 const db=database(({table,op,filters})=>{
  if(op==='read')assert(filters.some(f=>f[1]==='business_id'&&f[2]==='b'))
  if(op==='insert'){writes++;return {data:null,error:null}}
  if(table==='email_conversations')return {data:mode==='duplicate'?{id:'saved'}:null,error:mode==='duplicate-read-error'?{}:null}
  assert.equal(table,'customer');return {data:{customer_id:'customer'},error:['customer-read-error','ambiguous-customer'].includes(mode)?{code:'PGRST116'}:null}
 })
 const processor=load('lib/gmail/processor.ts',{'@/lib/numbering':{},'@/lib/company/company-model':{},'@/lib/observability/driftlarm':{}})
 const message={messageId:'m1',threadId:'t',from:mode.startsWith('outbound')?'owner@example.invalid':'Buyer <buyer@example.invalid>',to:'buyer@example.invalid',subject:'Byggjobb',bodyText:'Test',date:'',snippet:''}
 if(mode.includes('error')||mode==='ambiguous-customer')await assert.rejects(()=>processor.processInboundEmail(db,'b',message,'owner@example.invalid'))
 else {const result=await processor.processInboundEmail(db,'b',message,'owner@example.invalid');assert.equal(result.stored,false);assert.equal(result.reason,mode==='duplicate'?'duplicate':'missing_receipt')}
 assert.equal(writes,mode==='outbound-no-receipt'?1:0)
})
test('customer insert without receipt cannot advance to storing email; name-only matching is absent',async()=>{
 let writes=0
 const db=database(({table,op,filters})=>{
  if(op==='read'){assert(filters.some(f=>f[1]==='business_id'&&f[2]==='b'));assert(!filters.some(f=>f[0]==='ilike'));return {data:null,error:null}}
  assert.equal(table,'customer');writes++;return {data:null,error:null}
 })
 const processor=load('lib/gmail/processor.ts',{'@/lib/numbering':{getNextCustomerNumber:async()=> 'K1'},'@/lib/company/company-model':{},'@/lib/observability/driftlarm':{}})
 const result=await processor.processInboundEmail(db,'b',{messageId:'m1',from:'Same Name <new@example.invalid>',threadId:'t',subject:'Work',bodyText:'',date:''},'owner@example.invalid')
 assert.equal(result.stored,false);assert.equal(result.reason,'customer_not_saved');assert.equal(writes,1)
})
test('cron reports partial failure instead of success',async()=>{
 const route=load('app/api/cron/gmail-poll/route.ts',{'next/server':{NextResponse:Response},'@/lib/cron/verify-secret':{verifyCronSecret:()=>true},'@/lib/gmail/poller':{pollAllBusinesses:async()=>({businesses:1,totalProcessed:1,totalStored:1,errors:['storage failed']})}})
 const result=await route.GET({});assert.equal(result.status,503);assert.equal((await result.json()).success,false)
})
;(async()=>{for(const [name,fn] of cases){let timer;try{await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout: '+name)),10000)})]);console.log('PASS',name)}finally{clearTimeout(timer)}}console.log(`PASS ${cases.length} Gmail polling/processor contracts; Google and database responses mocked`)})().catch(e=>{console.error(e);process.exitCode=1})
