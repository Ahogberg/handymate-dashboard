const assert=require('node:assert/strict')
const {load,database}=require('./integrity-loader.cjs')
const response={NextResponse:{json:(body,init={})=>({status:init.status||200,body})}}
const business={business_id:'tenant-A'}
const auth={'@/lib/auth':{getAuthenticatedBusiness:async()=>business},'@/lib/permissions':{getCurrentUser:async()=>({role:'owner'}),isOwnerOrAdmin:u=>u.role==='owner'},'next/server':response}
process.env.STRIPE_SECRET_KEY='synthetic';process.env.STRIPE_WEBHOOK_SECRET='synthetic'

function memoryDB(){
 const state={business_config:[{business_id:'tenant-A',stripe_customer_id:'cus_A',stripe_subscription_id:null}],billing_checkout_attempt:[]}
 const db={from(table){let op='read',value,single=false,filters=[];const q={}
  q.select=()=>q;q.single=q.maybeSingle=()=>{single=true;return q};q.eq=(k,v)=>{filters.push(r=>r[k]===v);return q}
  q.upsert=v=>{op='upsert';value=v;return q};q.update=v=>{op='update';value=v;return q};q.delete=()=>{op='delete';return q}
  q.then=(resolve,reject)=>Promise.resolve().then(()=>{
   const rows=state[table];let found=rows.filter(r=>filters.every(f=>f(r)))
   if(op==='upsert'&&!rows.some(r=>r.business_id===value.business_id))rows.push({...value,id:'attempt-1',created_at:new Date().toISOString()})
   if(op==='update')found.forEach(r=>Object.assign(r,value))
   if(op==='delete')state[table]=rows.filter(r=>!found.includes(r))
   return {data:single?found[0]||null:found,error:null}
  }).then(resolve,reject);return q}}
 return {db,state}
}
async function checkout(){
 const {createSubscriptionCheckout,CheckoutConflict}=load('lib/billing/checkout-session.ts')
 const {db,state}=memoryDB();const creates=[],portals=[];const sessions=new Map();let active=[]
 const stripe={subscriptions:{list:async()=>({data:active,has_more:false})},billingPortal:{sessions:{create:async p=>{portals.push(p);return {url:'portal'}}}},checkout:{sessions:{
  create:async(p,o)=>{creates.push({p,o});if(!sessions.has(o.idempotencyKey))sessions.set(o.idempotencyKey,{id:'cs_1',status:'open',url:'checkout'});return sessions.get(o.idempotencyKey)},
  retrieve:async()=>[...sessions.values()][0],
 }}}
 const params={mode:'subscription',line_items:[{price:'price_business',quantity:1}],cancel_url:'https://example.invalid/settings',success_url:'https://example.invalid/success'}
 const results=await Promise.all([createSubscriptionCheckout(db,stripe,'tenant-A',params),createSubscriptionCheckout(db,stripe,'tenant-A',params)])
 assert(results.every(r=>r.url==='checkout'));assert.equal(sessions.size,1)
 assert(creates.every(c=>c.o.idempotencyKey===creates[0].o.idempotencyKey))
 assert(creates.every(c=>JSON.stringify(c.p)===JSON.stringify(creates[0].p)))
 await assert.rejects(createSubscriptionCheckout(db,stripe,'tenant-A',{...params,line_items:[{price:'another'}]}),CheckoutConflict)
 active=[{id:'sub_A',metadata:{},status:'active',items:{data:[{id:'si_A',quantity:1}]}}]
 assert.equal((await createSubscriptionCheckout(db,stripe,'tenant-A',params)).url,'portal')
 assert.equal(portals[0].flow_data.subscription_update_confirm.subscription,'sub_A')
 assert.equal(portals[0].flow_data.subscription_update_confirm.items[0].price,'price_business')
 active=[];state.billing_checkout_attempt[0].stripe_session_id=null;state.billing_checkout_attempt[0].created_at='2020-01-01T00:00:00Z'
 const before=creates.length;await assert.rejects(createSubscriptionCheckout(db,stripe,'tenant-A',params),CheckoutConflict);assert.equal(creates.length,before)
 console.log('PASS checkout concurrency, immutable retry, price conflict, existing subscription and stale uncertain request')
}
async function routes(){
 for(const file of ['app/api/billing/checkout/route.ts','app/api/billing/onboarding-checkout/route.ts']){
  let called=0
  const mocks={...auth,'@/lib/supabase':{getServerSupabase:()=>database(()=>({data:{stripe_price_id:'price_A'},error:null}))},stripe:{default:class{}},'@/lib/billing/checkout-session':{CheckoutConflict:class extends Error{},createSubscriptionCheckout:async()=>{called++;return {url:'ok'}}}}
  let route=load(file,mocks)
  assert.equal((await route.POST({json:async()=>({planId:'starter'})})).status,400)
  assert.equal((await route.POST({json:async()=>({planId:'business'})})).status,200)
  assert.equal(called,1)
  route=load(file,{...mocks,'@/lib/permissions':{getCurrentUser:async()=>({role:'employee'}),isOwnerOrAdmin:()=>false}})
  assert.equal((await route.POST({json:async()=>({planId:'business'})})).status,403)
 }
 console.log('PASS both checkout routes enforce roles and purchasable plans')
}
async function webhook(){
 let fail=false;const order=[]
 const event={id:'evt_A',type:'checkout.session.completed',data:{object:{id:'cs_A',mode:'subscription',payment_status:'paid',customer:'cus_A',subscription:'sub_A',metadata:{business_id:'tenant-A',plan_id:'business'}}}}
 class Stripe{constructor(){this.webhooks={constructEvent:()=>event}}}
 const db=database(q=>{if(q.op==='insert')order.push('event');return {data:null,error:null}})
 const route=load('app/api/billing/webhook/route.ts',{'next/server':response,stripe:{default:Stripe},'@/lib/supabase':{getServerSupabase:()=>db},'@/lib/automations':{},'@/lib/partners/revenue-classification':{},'@/lib/partners/stripe-revenue':{},'@/lib/billing/write-billing-update':{byggAbonnemangsfalt:async()=>({critical:{subscription_status:'active'}}),writeBillingUpdate:async()=>{order.push('persist');if(fail)throw Error('synthetic failure')}},'@/lib/referral/discounts':{handleFirstPaymentReferral:async()=>({rewarded:false})},'@/lib/partners/webhook':{notifyPartnerWebhook:async()=>{}}})
 const request={text:async()=>'',headers:{get:()=> 'signature'}}
 assert.equal((await route.POST(request)).status,200);assert.deepEqual(order,['persist','event'])
 fail=true;order.length=0;assert.equal((await route.POST(request)).status,500);assert.deepEqual(order,['persist'])
 event.data.object.payment_status='unpaid';order.length=0;assert.equal((await route.POST(request)).status,200);assert.equal(order.length,0)
 console.log('PASS webhook persists before receipt, retries DB errors and defers unpaid sessions')
}
async function persistence(){
 const {byggAbonnemangsfalt,writeBillingUpdate}=load('lib/billing/write-billing-update.ts')
 const sub={id:'sub_A',status:'active',customer:'cus_A',items:{data:[{price:{id:'price_A'},current_period_start:1700000000,current_period_end:1701000000}]}}
 const stripe={subscriptions:{retrieve:async()=>sub}}
 const planDB=database(()=>({data:[{plan_id:'business_yearly'}],error:null}))
 const session={mode:'subscription',subscription:'sub_A',customer:'cus_A',metadata:{plan_id:'professional'}}
 const result=await byggAbonnemangsfalt(stripe,session,planDB)
 assert.equal(result.critical.subscription_plan,'business');assert.equal(result.period.start,'2023-11-14T22:13:20.000Z')
 await assert.rejects(byggAbonnemangsfalt({subscriptions:{retrieve:async()=>{throw Error('offline')}}},session,planDB),/offline/)
 await assert.rejects(writeBillingUpdate(database(()=>({data:null,error:null})),'tenant-A',{}),/kunde inte läsas/)
 await assert.rejects(writeBillingUpdate(database(()=>({data:{stripe_subscription_id:'sub_other'},error:null})),'tenant-A',{stripe_subscription_id:'sub_A'}),/annat abonnemang/)
 console.log('PASS current Stripe price and item periods, retrieval failure, missing business and replaced subscription')
}
async function delayedEvents(){
 let event,subscription,current='sub_current';const writes=[]
 class Stripe{constructor(){this.webhooks={constructEvent:()=>event};this.subscriptions={retrieve:async()=>subscription}}}
 const db=database(q=>{
  if(q.table==='business_config'&&q.op==='read')return {data:{business_id:'tenant-A',stripe_subscription_id:current,subscription_status:'active'},error:null}
  if(q.table==='business_config'&&q.op==='update'){
   const idFilter=q.filters.find(f=>f[1]==='stripe_subscription_id')
   assert(idFilter,'subscription deletion needs an atomic current-subscription filter')
   if(idFilter[2]===current){writes.push(q.value);return {data:{business_id:'tenant-A'},error:null}}
  }
  return {data:null,error:null}
 })
 const route=load('app/api/billing/webhook/route.ts',{'next/server':response,stripe:{default:Stripe},'@/lib/supabase':{getServerSupabase:()=>db},'@/lib/automations':{},'@/lib/partners/revenue-classification':{},'@/lib/partners/stripe-revenue':{classifyStripeInvoiceForPartner:async()=>({})},'@/lib/billing/write-billing-update':{STRIPE_STATUS_MAP:{active:'active',past_due:'past_due'},subscriptionPeriod:()=>({}),subscriptionPlan:async()=> 'business',writeBillingUpdate:async(...args)=>{assert.equal(args[4],'sub_current');writes.push(args[2])}},'@/lib/partners/webhook':{notifyPartnerWebhook:async()=>{}}})
 const request={text:async()=>'',headers:{get:()=> 'signature'}}
 event={id:'evt_old',type:'customer.subscription.deleted',data:{object:{id:'sub_old',metadata:{business_id:'tenant-A'}}}}
 assert.equal((await route.POST(request)).status,200);assert.equal(writes.length,0)
 event={id:'evt_invoice',type:'invoice.payment_failed',data:{object:{customer:'cus_A',parent:{subscription_details:{subscription:'sub_current'}}}}}
 subscription={id:'sub_current',status:'active',metadata:{}}
 assert.equal((await route.POST(request)).status,200);assert.equal(writes.at(-1).subscription_status,'active')
 writes.length=0;event.data.object.parent.subscription_details.subscription='sub_addon'
 assert.equal((await route.POST(request)).status,200);assert.equal(writes.length,0)
 event={id:'evt_update',type:'customer.subscription.updated',data:{object:{id:'sub_current',status:'past_due'}}}
 subscription={id:'sub_current',status:'active',metadata:{business_id:'tenant-A'}}
 assert.equal((await route.POST(request)).status,200);assert.equal(writes.at(-1).subscription_status,'active')
 console.log('PASS old cancellation cannot clear current subscription; delayed invoices/updates use current Stripe state; add-on invoice does not pause base plan')
}
async function leads(){
 const {cancelLeadsSubscriptions,syncLeadsSubscription}=load('lib/billing/leads-subscription.ts')
 let subs=[{id:'base',metadata:{},status:'active'},{id:'leads',metadata:{addon:'leads'},status:'active',items:{data:[{price:{id:'price_leads'}}]}}]
 const calls=[],writes=[];let fail=false
 const stripe={subscriptions:{list:async()=>({data:subs,has_more:false}),cancel:async id=>{calls.push(id);if(fail)throw Error('Stripe offline');subs=subs.filter(s=>s.id!==id)}}}
 const db=database(q=>{if(q.op==='update')writes.push(q.value);return {data:{business_id:'tenant-A'},error:null}})
 process.env.STRIPE_LEADS_PRO_PRICE_ID='price_leads'
 await syncLeadsSubscription(db,stripe,'tenant-A','cus_A');assert.equal(writes.at(-1).leads_addon_tier,'pro')
 writes.length=0;fail=true;await assert.rejects(cancelLeadsSubscriptions(db,stripe,'tenant-A','cus_A'),/offline/);assert.equal(writes.length,0)
 fail=false;await cancelLeadsSubscriptions(db,stripe,'tenant-A','cus_A');assert(calls.every(id=>id==='leads'));assert.equal(writes.at(-1).leads_addon,false);assert.equal(subs[0].id,'base')
 delete process.env.STRIPE_LEADS_PRO_PRICE_ID
 const route=load('app/api/billing/leads-addon/route.ts',{...auth,stripe:{default:class{}},'@/lib/supabase':{getServerSupabase:()=>db}})
 writes.length=0;assert.equal((await route.POST({json:async()=>({tier:'pro'})})).status,503);assert.equal(writes.length,0)
 console.log('PASS Leads: price-based activation, cancellation reaches Stripe, failures preserve state, missing price never grants free access')
}
;(async()=>{await checkout();await routes();await webhook();await persistence();await delayedEvents();await leads()})().catch(e=>{console.error(e);process.exitCode=1})
