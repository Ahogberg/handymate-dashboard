const assert=require('node:assert/strict')
const {load,database}=require('./integrity-loader.cjs')
const auth={'@/lib/auth':{getAuthenticatedBusiness:async()=>({business_id:'A'})},'@/lib/permissions':{getCurrentUser:async(_r,b)=>{assert.equal(b,'A');return {role:'owner'}},isOwnerOrAdmin:()=>true},'next/server':{NextResponse:{json:(body,init={})=>({status:init.status||200,body})}}}
;(async()=>{
 for(const mode of ['route','shared'])for(const scenario of ['foreign-business','wrong-customer','valid','changed']){
  const booking={booking_id:'booking',business_id:scenario==='foreign-business'?'B':'A',customer_id:scenario==='wrong-customer'?'other':'customer',scheduled_start:'2026-09-14T08:00:00Z',scheduled_end:'2026-09-14T09:00:00Z'}
  const suggestion={suggestion_id:'s',business_id:'A',customer_id:'customer',status:'pending',suggestion_type:'reschedule'}
  let writes=0
  const db=database(q=>{
   if(q.table==='ai_suggestion')return {data:suggestion,error:null}
   assert.equal(q.table,'booking')
   const matches=q.filters.every(([op,k,v])=>op!=='eq'||booking[k]===v)
   if(q.op==='update'){
    assert(q.filters.some(([op,k,v])=>k==='business_id'&&v==='A'))
    if(matches&&scenario!=='changed'){writes++;return {data:{booking_id:'booking'},error:null}}
    return {data:null,error:null}
   }
   return {data:matches?booking:null,error:null}
  })
  const mocks={...auth,'@/lib/supabase':{getServerSupabase:()=>db},'@/lib/rate-limit-db':{checkSmsRateLimitDb:async()=>({allowed:true})},'@/lib/quotes/create-quote':{}}
  const action={booking_id:'booking',date:'2026-09-16',time:'10:00'}
  const result=mode==='route'?(await load('app/api/suggestions/approve/route.ts',mocks).POST({json:async()=>({suggestion_id:'s',action_data:action})})).body:await load('lib/approve-actions.ts',mocks).executeApproveAction(db,suggestion,action)
  assert.equal(result.success,scenario==='valid',`${mode} ${scenario}`)
  assert.equal(writes,scenario==='valid'?1:0)
 }
 console.log('PASS both reschedule paths: foreign business/customer rejected, valid booking changed, concurrent change rejected')
})().catch(e=>{console.error(e);process.exitCode=1})
