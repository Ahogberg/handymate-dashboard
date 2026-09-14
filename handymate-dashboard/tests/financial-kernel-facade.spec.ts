import {test,expect} from '@playwright/test'
import {receivablesDatabase,seedInvoice,domain} from './helpers/financial-receivables-database'
import {c5Modules} from './helpers/c5-module'
import {NextRequest} from 'next/server'
import ts from 'typescript'
import {readFileSync} from 'fs'
let f:Awaited<ReturnType<typeof receivablesDatabase>>
test.describe.configure({mode:'default'})
test.beforeAll(async()=>{f=await receivablesDatabase();await f.db.exec('GRANT SELECT ON invoice,business_config TO service_role; GRANT UPDATE ON invoice TO service_role')})
test.afterAll(async()=>{await f?.db.close()})
test.beforeEach(async()=>{await f.db.exec('BEGIN');await seedInvoice(f.db,'i','12500','a','rot','9500')})
test.afterEach(async()=>{await f.db.exec('ROLLBACK;RESET ROLE')})
function harness(){
 const effects:{effect:string;context:unknown}[]=[]
 // Each production RPC is its own transaction; savepoints keep expected SQL
 // errors from poisoning this test's outer rollback transaction.
 const rpc=async(name:string,args:Record<string,unknown>)=>{
  await f.db.exec('SAVEPOINT facade_rpc')
  const result=await f.rpc.rpc(name,args)
  if(result.error) await f.db.exec('ROLLBACK TO SAVEPOINT facade_rpc')
  await f.db.exec('RELEASE SAVEPOINT facade_rpc')
  return result
 }
 const sb={rpc,from(table:string){
  const filters:unknown[]=[];let sql='';let updates:Record<string,unknown>|undefined
  const read=async()=>{
   const row=(await f.db.query<Record<string,unknown>>('SELECT * FROM '+table+' WHERE '+sql,filters)).rows[0]
   // PostgREST transports invoice NUMERIC as JSON numbers; PGlite returns strings.
   if(row) for(const key of ['paid_amount','total','customer_pays','rot_rut_deduction']) if(row[key]!=null) row[key]=Number(row[key])
   return {data:row,error:null}
  }
  const q={select:()=>q,update:(values:Record<string,unknown>)=>{updates=values;return q},
   eq:(key:string,value:unknown)=>{filters.push(value);sql+=(sql?' AND ':'')+key+'=$'+filters.length;return q},
   maybeSingle:async()=>({data:{financial_kernel_enabled:true},error:null}),single:read,
   then:(done:(result:unknown)=>unknown)=>{
    if(!updates) return read().then(done)
    const keys=Object.keys(updates)
    return f.db.query('UPDATE '+table+' SET '+keys.map((key,i)=>key+'=$'+(filters.length+i+1)).join(',')+' WHERE '+sql,[...filters,...Object.values(updates)])
     .then(()=>done({error:null}))
   }}
  return q
 }}
 const load=c5Modules({'@/lib/supabase':{getServerSupabase:()=>sb},'@/lib/approvals/artifact-write':{},'@/lib/customers/namn':{},'@/lib/sms-reply-number':{},
 '@/lib/auth':{getAuthenticatedBusiness:async()=>({business_id:'a'})},
 '@/lib/financial-kernel/kernel-db':{kernelDb:()=>({rpc})},'@/lib/observability/driftlarm':{rapporteraTystFel:async()=>{}},
 '../effects/runners':{runPaymentEffect:async(_biz:string,_inv:string,intent:{effect:string;context:unknown})=>{effects.push(intent);return {effect:intent.effect,status:'succeeded'}}}})
 const app=load('lib/invoices/apply-payment.ts')
 return {effects,app,load,run:(key:string,extra:Record<string,unknown>={})=>app.applyInvoicePayment({businessId:'a',invoiceId:'i',source:'status_patch',commandKey:'status_patch:'+key,...extra})}
}
test('real status route delegates thanks to intents and replay never re-enters its legacy SMS block',async()=>{
 const h=harness(),route=h.load('app/api/invoices/[id]/status/route.ts')
 for(let i=0;i<2;i++) {
  const response=await route.PATCH(new NextRequest('https://test.local/status',{method:'PATCH',headers:{'Idempotency-Key':'same'},body:JSON.stringify({status:'paid'})}),{params:{id:'i'}})
  expect(response.status).toBe(200);expect((await response.json()).command_id).toBe('same')
 }
 expect(h.effects.filter(e=>e.effect==='invoice_paid_thanks')).toHaveLength(1)
 expect(h.effects.filter(e=>e.effect==='review_request_schedule')).toHaveLength(1)
})
test('facade replay keeps current paid projection and dispatches each owed effect once',async()=>{
 const h=harness();expect((await h.run('a')).status).toBe('customer_paid');expect(h.effects).toHaveLength(8)
 expect((await h.run('b')).status).toBe('paid');const retry=await h.run('a',{amount:1,paidAt:'2099-01-01'})
 expect(retry.status).toBe('paid');expect(retry.paid_amount).toBe(12500);expect(retry.kernel.replayed).toBe(true);expect(h.effects).toHaveLength(8)
})
test('recovery through another caller uses persisted approval choices and original approval id',async()=>{
 await domain(f.db,'execute_payment_command',['a','customer_confirmed:original','i','customer_confirmed','customer',null,null,'manual','customer_confirmed','manual',null,100,['portal_message'],'manual',null,'system',null,
  {approvalFollowUps:{approvalId:'original',prepareCustomerMessages:true,updateWorkflows:false,runAutomationRules:false}}])
 const h=harness();await h.run('recovery',{amount:1})
 expect(h.effects).toHaveLength(1);expect(h.effects[0].context).toMatchObject({source:'customer_confirmed',approvalFollowUps:{approvalId:'original'},paidAmountMinor:'950000'})
})
for(const shortfall of [1,100,101]) test(`explicit rounding boundary ${shortfall} minor units`,async()=>{
 await seedInvoice(f.db,'plain','100');const h=harness();const result=await h.app.applyInvoicePayment({businessId:'a',invoiceId:'plain',source:'manual',commandKey:'manual:round',amount:(10000-shortfall)/100})
 expect(result.status).toBe(shortfall<=100?'paid':'sent');expect(h.effects.length).toBe(shortfall<=100?6:0)
 expect((await f.db.query('SELECT delta_minor::text FROM financial_receivable_adjustments')).rows).toEqual(shortfall<=100?[{delta_minor:String(-shortfall)}]:[])
})
test('ROT total minus fifty ore allocates both components and rounds only tax',async()=>{
 const h=harness();const result=await h.run('round',{amount:12499.50});expect(result.status).toBe('paid');expect(result.paid_amount).toBe(12499.5);expect(result.remaining_rot_kr).toBe(0)
})
test('overpayment remains unallocated and visible',async()=>{
 const h=harness();const result=await h.run('over',{amount:12600});expect(result.status).toBe('paid');expect(result.kernel.unallocatedMinor).toBe('10000')
})
test('GP5: two non-ROT partial payments leave open then settle once',async()=>{
 await seedInvoice(f.db,'plain','100');const h=harness()
 const call=(key:string,amount:number)=>h.app.applyInvoicePayment({businessId:'a',invoiceId:'plain',source:'manual',commandKey:'manual:'+key,amount})
 expect((await call('first',40)).status).toBe('sent');expect(h.effects).toEqual([])
 const second=await call('second',60);expect(second.status).toBe('paid');expect(second.paid_amount).toBe(100);expect(h.effects).toHaveLength(6)
})
test('real Fortnox sync passes distinct snapshots and stable keys while preserving legacy amount',async()=>{
 const calls:Record<string,any>[]=[];let balance=0
 const invoice={invoice_id:'i',business_id:'a',status:'customer_paid',fortnox_document_number:'doc',fortnox_invoice_number:'42',total:12500,customer_pays:9500,rot_rut_type:'rot'}
 const sb={from(table:string){const q={select:()=>q,eq:()=>q,not:()=>q,update:()=>q,then:(done:(r:unknown)=>unknown)=>Promise.resolve({data:table==='invoice'?[invoice]:null,error:null}).then(done)};return q}}
 const load=c5Modules({'@/lib/supabase':{getServerSupabase:()=>sb},'@/lib/fortnox':{isFortnoxConnected:async()=>true,fortnoxRequest:async()=>({Invoice:{Total:12500,Balance:balance}})},
 '@/lib/invoices/apply-payment':{applyInvoicePayment:async(opts:Record<string,any>)=>{calls.push(opts);return {ok:true,transition:'settled'}}}})
 const sync=load('lib/fortnox/sync-payments.ts').syncFortnoxPaymentsForBusiness
 expect((await sync('a')).marked_settled).toBe(1);await sync('a');balance=-100;await sync('a')
 expect(calls[0].amount).toBeUndefined();expect(calls[0].commandKey).toBe(calls[1].commandKey);expect(calls[2].commandKey).not.toBe(calls[0].commandKey)
 expect(calls[0].providerObservation).toMatchObject({documentNumber:'doc',paidMinor:'1250000',balance:0})
 expect(calls[2].providerObservation.paidMinor).toBe('1260000')
})

// Execute the real approval executor (AST extraction avoids loading unrelated
// route services); payment allocation itself runs against the implemented SQL.
function approvalExecutor(app:Record<string,any>) {
 const source=readFileSync('app/api/approvals/[id]/route.ts','utf8')
 const ast=ts.createSourceFile('route.ts',source,ts.ScriptTarget.Latest,true)
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='executeApprovalPayload')!
 const js=ts.transpileModule(fn.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
 return new Function('require',js+'; return executeApprovalPayload;')((name:string)=>{
  if(name==='@/lib/invoices/apply-payment') return app
  throw Error('Unexpected approval dependency: '+name)
 })
}
for(const amount of [12500,undefined]) test(`approval ROT allocation with reviewed amount ${amount}`,async()=>{
 const h=harness(),execute=approvalExecutor(h.app)
 const result=await execute({id:'review',approval_type:'confirm_payment',payload:{}},'a',undefined,undefined,undefined,undefined,undefined,
  {invoiceId:'i',amount,choices:{update_workflows:false,prepare_customer_messages:false,run_automation_rules:false}})
 expect(result.ok).toBe(true)
 const row=(await f.db.query<{status:string;paid_amount:string}>("SELECT status,paid_amount::text FROM invoice WHERE invoice_id='i'")).rows[0]
 expect(row.status).toBe(amount===undefined?'customer_paid':'paid')
 expect(Number(row.paid_amount)).toBe(amount===undefined?9500:12500)
 const payment=(await f.db.query<{unallocated:string}>("SELECT (amount_minor-allocated_minor)::text unallocated FROM financial_payments")).rows[0]
 expect(payment.unallocated).toBe('0')
})
test('second customer confirmation is a no-op, leaving tax open and effects unchanged',async()=>{
 const h=harness()
 await h.run('customer-first',{source:'customer_confirmed',target:'customer'})
 const effectsBefore=h.effects.length
 const result=await h.run('customer-again',{source:'customer_confirmed',target:'customer'})
 expect(result).toMatchObject({ok:true,status:'customer_paid',transition:'none',paid_amount:9500})
 expect(h.effects).toHaveLength(effectsBefore)
 expect((await f.db.query('SELECT * FROM financial_payments')).rows).toHaveLength(1)
 expect((await f.db.query("SELECT status FROM financial_receivables WHERE component='tax_authority'")).rows).toEqual([{status:'open'}])
})
test('legacy-routed retry invokes the legacy body once and reads current invoice status',async()=>{
 await f.db.exec("RESET ROLE; UPDATE invoice SET status='customer_paid',paid_amount=9500 WHERE invoice_id='i'; SET LOCAL ROLE service_role")
 const h=harness();let legacyCalls=0
 const legacy=h.app.applyInvoicePaymentLegacy
 h.app.applyInvoicePaymentLegacy=async(opts:unknown)=>{legacyCalls++;return legacy(opts)}
 const first=await h.run('legacy-retry')
 expect(first).toMatchObject({ok:true,status:'paid',transition:'settled'})
 const result=await h.run('legacy-retry')
 expect(legacyCalls).toBe(1)
 expect(result).toMatchObject({ok:true,status:'paid',already_paid:true,transition:'none',kernel:{replayed:true}})
 expect((await f.db.query('SELECT * FROM financial_payments')).rows).toHaveLength(0)
})
for(const failure of ['rpc-error','transport','flag-read']) test(`delivered invoice stays delivered after eager issuance ${failure}`,async()=>{
 const reports:unknown[][]=[],writes:unknown[]=[]
 const sb={from:()=>{const q={update:(v:unknown)=>{writes.push(v);return q},eq:()=>q,select:async()=>({data:[{invoice_id:'i'}],error:null}),insert:async()=>({error:null})};return q}}
 const source=readFileSync('lib/invoices/send-invoice.ts','utf8')
 const ast=ts.createSourceFile('send.ts',source,ts.ScriptTarget.Latest,true)
 const deps:Record<string,unknown>={}
 for(const statement of ast.statements) if(ts.isImportDeclaration(statement)) deps[(statement.moduleSpecifier as ts.StringLiteral).text]={}
 Object.assign(deps,{
  '@/lib/invoices/evidence-manifest':{markInvoiceDelivered:async()=>({ok:true,row:{status:'complete'}})},
  '@/lib/observability/driftlarm':{rapporteraTystFel:async(...args:unknown[])=>{reports.push(args)}},
  '@/lib/financial-kernel/dispatch-flag':{readKernelDispatchFlag:async()=>{if(failure==='flag-read') throw Error('flag unavailable');return true}},
  '@/lib/financial-kernel/kernel-db':{kernelDb:()=>({rpc:async()=>{if(failure==='transport') throw Error('connection lost');return {error:{message:'issuance failed'}}}})},
 })
 const send=c5Modules(deps)('lib/invoices/send-invoice.ts')
 const results={email:true,sms:false,errors:[] as string[]}
 const outcome=await send.applyInvoiceDeliveryOutcome(sb,{businessId:'a',invoiceId:'i',invoice:{business_id:'a',customer_id:'c',invoice_number:'42'},results})
 expect(outcome).toEqual({delivered:true,sentMethod:'email'})
 expect(writes).toEqual([expect.objectContaining({status:'sent',delivery_status:'delivered'})])
 expect(results.errors).toHaveLength(1)
 expect(reports).toEqual([expect.arrayContaining(['a','financial-kernel:eager-issuance-failed'])])
})
