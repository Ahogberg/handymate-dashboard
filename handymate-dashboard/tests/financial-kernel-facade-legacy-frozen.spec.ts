import {test,expect} from '@playwright/test'
import {readFileSync} from 'fs'
import ts from 'typescript'
import {c5Modules} from './helpers/c5-module'

test('legacy function body is byte-identical to pre-C5 main',()=>{
 const source=readFileSync('lib/invoices/apply-payment.ts','utf8'),ast=ts.createSourceFile('a.ts',source,ts.ScriptTarget.Latest,true)
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='applyInvoicePaymentLegacy') as ts.FunctionDeclaration
 expect(fn.body!.getText(ast)).toBe(readFileSync('tests/fixtures/financial-kernel/apply-payment-legacy-body.txt','utf8'))
})
for(const mode of ['off','missing-column','missing-row'] as const) test(`dispatch ${mode}: frozen result and writes, zero RPCs`,async()=>{
 const writes:unknown[]=[];let rpcCalls=0
 const sb={rpc:()=>{rpcCalls++;throw Error('Forbidden RPC')},from(table:string){
  const q={select:()=>q,eq:()=>q,update:(value:unknown)=>{writes.push(value);return q},single:()=>Promise.resolve({data:{invoice_id:'i',status:'paid',paid_at:'2026-09-01'},error:null}),
   maybeSingle:()=>Promise.resolve(mode==='missing-column'?{data:null,error:{code:'42703',message:'column absent'}}:{data:mode==='missing-row'?null:{financial_kernel_enabled:false},error:null})}
  return q
 }}
 const load=c5Modules({'@/lib/supabase':{getServerSupabase:()=>sb},'@/lib/approvals/artifact-write':{},'@/lib/customers/namn':{},'@/lib/sms-reply-number':{}})
 const app=load('lib/invoices/apply-payment.ts'),opts={businessId:'a',invoiceId:'i',source:'manual',paidAt:'2026-09-01'}
 expect(await app.applyInvoicePayment(opts)).toEqual(await app.applyInvoicePaymentLegacy(opts));expect(writes).toEqual([]);expect(rpcCalls).toBe(0)
})
