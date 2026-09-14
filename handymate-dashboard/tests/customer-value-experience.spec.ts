import { test, expect } from '@playwright/test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextRequest } from 'next/server'
import { c5Modules } from './helpers/c5-module'
import type { WeeklyValue } from '../lib/weekly-value'
const loadView = c5Modules({})
const { WeeklyValueReceipt } = loadView('components/dashboard/WeeklyValueDigest.tsx')
const { LedgerRader } = loadView('components/value/LedgerRader.tsx')
const receipt: WeeklyValue = { range_days: 7, confirmed_kr: 3500, paid_kr: 1000, accepted_quote_kr: 2500,
 confirmed_items: [{ label: 'Offert accepterad: Köksarbete', amount: 2500, agent: 'oskar', dagar: 2 }], captured_count: 1, captured_kr: 5000, calls_captured: 0, time_minutes: 6, time_hours: 0.1, autonomous_count: 1, measured_minutes: 45 }
const render = (data: WeeklyValue) => renderToStaticMarkup(React.createElement(WeeklyValueReceipt, { data }))
test('receipt distinguishes paid money, accepted quotes, estimated labour and measured elapsed time', () => {
 const html=render(receipt); expect(html).toContain('Registrerat betalt'); expect(html).toContain('Accepterade offerter')
 expect(html).toContain('45 min. Detta är inte sparad arbetstid.'); expect(html).toContain('6 min uppskattad arbetsbesparing')
 expect(html).not.toContain('intjänat'); expect(html).toContain('Offert accepterad: Köksarbete')
})
test('cold start has a concrete next step without claiming earnings',()=>{
 const html=render({...receipt,confirmed_kr:0,paid_kr:0,accepted_quote_kr:0,confirmed_items:[],captured_count:0,autonomous_count:0,time_minutes:0,measured_minutes:0})
 expect(html).toContain('Ännu finns inget registrerat utfall');expect(html).toContain('href="/dashboard/quotes/new"');expect(html).toContain('innan du skickar något');expect(html).not.toContain('0 kr')
})
test('older mixed amount never relabelled as paid',()=>{const html=render({...receipt,paid_kr:undefined,accepted_quote_kr:undefined});expect(html).toContain('Accepterade offerter och registrerade betalningar');expect(html).not.toContain('Registrerat betalt')})
test('ledger rows link to their own evidence',()=>{
 const html=renderToStaticMarkup(React.createElement(LedgerRader,{items:[
 {approval_id:'card-a',title:'Utkast',approval_type:'missad_intakt',created_at:'2026-09-14',steg:'identifierat',kr:50,invoice_id:null,paid_at:null},
 {approval_id:'card-b',title:'Utfört',approval_type:'missad_intakt',created_at:'2026-09-14',steg:'betalt',kr:50,invoice_id:'invoice-b',paid_at:'2026-09-14'}]}))
 expect(html).toContain('/dashboard/approvals#approval-card-a');expect(html).toContain('/dashboard/invoices/invoice-b')
})
function weekly(role:string|null,failure=false,authenticated=true){const calls:unknown[]=[];const load=c5Modules({
 '@/lib/auth':{getAuthenticatedBusiness:async()=>authenticated?{business_id:'verified-business'}:null},
 '@/lib/permissions':{getCurrentUser:async()=>role?{role}:null,isOwnerOrAdmin:(u:any)=>['owner','admin'].includes(u.role)},
 '@/lib/supabase':{getServerSupabase:()=>({})},'@/lib/weekly-value':{getWeeklyValue:async(...args:unknown[])=>{calls.push(args);if(failure)throw Error('private error');return receipt}}})
 return {calls,route:load('app/api/dashboard/weekly-value/route.ts')}
}
for(const role of [null,'employee','project_manager'])test(`weekly money denied before reads for ${role}`,async()=>{const h=weekly(role);expect((await h.route.GET(new NextRequest('https://test/?business_id=other'))).status).toBe(403);expect(h.calls).toEqual([])})
test('weekly uses server tenant and strict reads; failed reads never become zero',async()=>{
 const h=weekly('owner');expect((await h.route.GET(new NextRequest('https://test/?business_id=other&days=99999'))).status).toBe(200)
 expect(h.calls[0]).toEqual([{},'verified-business',7,{failOnReadError:true}]);expect(h.route.dynamic).toBe('force-dynamic')
 const error=await weekly('admin',true).route.GET(new NextRequest('https://test/'));expect(error.status).toBe(503);expect(await error.json()).not.toHaveProperty('confirmed_kr')
 const guest=weekly(null,false,false);expect((await guest.route.GET(new NextRequest('https://test/'))).status).toBe(401);expect(guest.calls).toEqual([])
})
for(let failure=0;failure<8;failure++)test(`onboarding query ${failure+1} failure is not an empty scan`,async()=>{
 let index=0;const scopes:any[]=[];const db={from(){const own=index++;const chain:any=new Proxy({},{get(_,key){if(key==='then')return(resolve:any)=>resolve({data:[],count:0,error:own===failure?{message:'private error'}:null});return(...args:unknown[])=>{if(key==='eq')scopes.push(args);return chain}}});return chain}}
 const load=c5Modules({'@/lib/auth':{getAuthenticatedBusiness:async()=>({business_id:'a'})},'@/lib/permissions':{getCurrentUser:async()=>({role:'owner'}),hasPermission:()=>true},'@/lib/supabase':{getServerSupabase:()=>db}})
 const r=await load('app/api/onboarding/instant-value/route.ts').GET(new NextRequest('https://test/'));expect(r.status).toBe(503);expect(await r.json()).not.toHaveProperty('headline')
 expect(scopes.filter(s=>s[0]==='business_id')).toHaveLength(8);expect(scopes.filter(s=>s[0]==='business_id').every(s=>s[1]==='a')).toBe(true)
})

test('weekly payment evidence follows ledger for partial payments, ROT, missing and invalid amounts',()=>{
 const {invoicePaymentEvidence}=c5Modules({})('lib/value/invoice-payment-evidence.ts')
 expect(invoicePaymentEvidence({total:1000,status:'paid',paid_amount:400})).toMatchObject({paid_kr:400,paid:true})
 expect(invoicePaymentEvidence({total:1000,status:'customer_paid',paid_amount:700})).toMatchObject({paid_kr:700,paid:true})
 expect(invoicePaymentEvidence({total:1000,status:'customer_paid',paid_amount:null})).toMatchObject({paid_kr:0,paid:false})
 expect(invoicePaymentEvidence({total:1000,status:'paid',paid_amount:null})).toMatchObject({paid_kr:1000,paid:true})
 expect(invoicePaymentEvidence({total:1000,status:'paid',paid_amount:'bad'})).toMatchObject({paid_kr:0,paid:false})
 expect(invoicePaymentEvidence({total:1000,status:'paid',paid_amount:2000})).toMatchObject({paid_kr:1000,paid:true})
 expect(invoicePaymentEvidence({total:1000,status:'cancelled',paid_amount:400})).toMatchObject({paid:false})
})
test('weekly API amounts split already deduplicated attribution, never summed twice',async()=>{
 const load=c5Modules({'./value/recovered-revenue':{getRecoveredRevenue:async()=>({total_recovered_kr:900,attributions:[
 {event_kind:'invoice_paid',amount_kr:400,label:'Betalning',occurred_at_ms:1000,card_resolved_at_ms:0},
 {event_kind:'quote_accepted',amount_kr:500,label:'Offert',occurred_at_ms:1000,card_resolved_at_ms:0} ]})},
 './value/events/read':{valueEventsEnabled:()=>false}})
 const query:any={select:()=>query,eq:()=>query,gte:()=>query,limit:()=>query,contains:()=>query,then:(f:any)=>Promise.resolve(f({data:[],count:0,error:null}))}
 expect(await load('lib/weekly-value.ts').getWeeklyValue({from:()=>query},'a')).toMatchObject({confirmed_kr:900,paid_kr:400,accepted_quote_kr:500})
})

test.describe('real receipt component interactions',()=>{
 test.describe.configure({mode:'serial'})
 let dom:any,root:any,host:HTMLElement,originalFetch:typeof fetch
 const originals=new Map<string,PropertyDescriptor|undefined>()
 const {act}=require('react-dom/test-utils')
 const {createRoot}=require('react-dom/client')
 const {BusinessContext}=loadView('lib/BusinessContext.tsx')
 const {default:Digest}=loadView('components/dashboard/WeeklyValueDigest.tsx')
 test.beforeEach(()=>{
  const {JSDOM}=require('jsdom');dom=new JSDOM('<div id="root"></div>',{url:'https://value.test/'})
  for(const key of ['window','self','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT']){originals.set(key,Object.getOwnPropertyDescriptor(global,key));Object.defineProperty(global,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]})}
  host=dom.window.document.getElementById('root');root=createRoot(host);originalFetch=global.fetch
 })
 test.afterEach(async()=>{await act(async()=>root.unmount());dom.window.close();global.fetch=originalFetch;for(const [key,descriptor]of Array.from(originals)){if(descriptor)Object.defineProperty(global,key,descriptor);else delete(global as any)[key]}originals.clear()})
 const render=async(business='a')=>act(async()=>root.render(React.createElement(BusinessContext.Provider,{value:{business_id:business}},React.createElement(Digest))))
 test('a failed read is visible, retry works, and forbidden reads hide money',async()=>{
  let count=0;global.fetch=(async()=>++count===1?Response.json({error:'read failed'},{status:503}):Response.json(receipt)) as typeof fetch
  await render();expect(host.querySelector('[role="alert"]')?.textContent).toContain('kunde inte hämtas')
  await act(async()=>host.querySelector('button')!.click());expect(host.textContent).toContain('Registrerat betalt');expect(count).toBe(2)
  global.fetch=(async()=>Response.json({error:'denied'},{status:403})) as typeof fetch
  await render('b');expect(host.textContent).toBe('')
 })
 test('a late company-A response never appears after switching to company B',async()=>{
  let settle!:(r:Response)=>void
  global.fetch=(()=>new Promise<Response>(r=>{settle=r})) as typeof fetch
  await render('a');const late=settle
  global.fetch=(async()=>Response.json({...receipt,confirmed_kr:0,paid_kr:0,accepted_quote_kr:0,confirmed_items:[],captured_count:0,autonomous_count:0,time_minutes:0,measured_minutes:0})) as typeof fetch
  await render('b');expect(host.textContent).toContain('Ännu finns inget registrerat utfall')
  await act(async()=>late(Response.json(receipt)));expect(host.textContent).not.toContain('Köksarbete');expect(host.textContent).toContain('Ännu finns inget registrerat utfall')
 })
})
