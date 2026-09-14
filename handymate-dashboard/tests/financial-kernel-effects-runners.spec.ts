import { test, expect } from '@playwright/test'
import { NextRequest } from 'next/server'
import { c5Modules } from './helpers/c5-module'
import { readFileSync } from 'fs'
import ts from 'typescript'

function runner(success=true,recent=false) {
 const sms:any[]=[],inserted:any[]=[]
 const invoice={invoice_id:'i',customer_id:'c',customer:{name:'Test Kund',phone_number:'+46700000000'}}
 const sb={from(table:string){const q={select:()=>q,eq:()=>q,
  single:async()=>({data:table==='invoice'?invoice:{business_name:'Test',google_review_url:'https://example.test/review',review_request_enabled:true},error:null}),
  maybeSingle:async()=>({data:{review_request_sent_at:recent?new Date().toISOString():null},error:null}),
  insert:async(value:any)=>{inserted.push(value);return {error:null}}};return q}}
 const load=c5Modules({'@/lib/supabase':{getServerSupabase:()=>sb},'@/lib/invoices/apply-payment':{},
  '@/lib/sms-send':{sendSmsViaElks:async(args:any)=>{sms.push(args);return {success,error:success?undefined:'rejected'}}}})
 const run=(effect:string)=>load('lib/financial-kernel/effects/runners.ts').runPaymentEffect('a','i',{effect,context:{source:'status_patch',paidAmountMinor:'10000'}})
 return {run,sms,inserted}
}
for(const success of [true,false])test(`real thanks runner maps SMS outcome ${success}`,async()=>{
 const h=runner(success);expect((await h.run('invoice_paid_thanks')).status).toBe(success?'succeeded':'failed');expect(h.sms).toHaveLength(1);expect(h.sms[0]).toMatchObject({businessId:'a',relatedId:'i',purpose:'transactional'})
})
for(const recent of [false,true])test(`real review runner respects 180-day guard ${recent}`,async()=>{
 const h=runner(true,recent);expect((await h.run('review_request_schedule')).status).toBe(recent?'skipped':'succeeded');expect(h.sms).toEqual([]);expect(h.inserted).toHaveLength(recent?0:1)
 if(!recent)expect(h.inserted[0]).toMatchObject({business_id:'a',approval_type:'scheduled_review_request',payload:{invoice_id:'i'}})
})
for(const part of ['mark-paid','status'])test(`malformed key returns 400 in real ${part} route before payment`,async()=>{
 const sb={from(){const q={select:()=>q,eq:()=>q,single:async()=>({data:{invoice_id:'i',status:'sent'},error:null})};return q}}
 const load=c5Modules({'@/lib/supabase':{getServerSupabase:()=>sb},'@/lib/auth':{getAuthenticatedBusiness:async()=>({business_id:'a'})},
  '@/lib/permissions':{getCurrentUser:async()=>({}),hasPermission:()=>true},'@/lib/invoices/apply-payment':{applyInvoicePayment:()=>{throw Error('must not execute')}},'@/lib/invoices/payment-thanks':{}})
 const route=load(`app/api/invoices/[id]/${part}/route.ts`)
 const response=await (route.POST||route.PATCH)(new NextRequest('https://test/invoice',{method:part==='status'?'PATCH':'POST',headers:{'Idempotency-Key':'bad key'},body:JSON.stringify({status:'paid'})}),{params:{id:'i'}})
 expect(response.status).toBe(400)
})
test('Fortnox receipt read failure omits invoice number, reports and still saves receipt',async()=>{
 // Execute the exact production receipt guard with a failing query.
 const source=readFileSync('lib/invoices/sync-to-fortnox.ts','utf8')
 const start=source.indexOf('  try {\n    const { readKernelDispatchFlag }')
 const end=source.indexOf("  // 'submitted'",start)
 const code=ts.transpileModule('export async function run(supabase,businessId,invoiceId,updateData,rapporteraTystFel){'+source.slice(start,end)+';return updateData}',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
 const module={exports:{} as any},reports:any[]=[]
 new Function('require','module','exports',code)(()=>({readKernelDispatchFlag:async()=>true}),module,module.exports)
 const sb={from(){const q={select:()=>q,eq:()=>q,limit:async()=>({data:null,error:{message:'read failed'}})};return q}}
 const receipt=await module.exports.run(sb,'a','i',{invoice_number:'new',fortnox_document_number:'42',fortnox_sync_status:'synced'},async(...args:any[])=>reports.push(args))
 expect(receipt).toEqual({fortnox_document_number:'42',fortnox_sync_status:'synced'});expect(reports[0][2]).toBe('financial-kernel:issued-number-read-failed')
})
