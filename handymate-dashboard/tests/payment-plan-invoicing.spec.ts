import { test, expect } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import { makeSnapshot, add, zero, stageItems } from '../lib/invoices/payment-plan/calculations'
import { createPlanInvoice, planState, loadPlan } from '../lib/invoices/payment-plan/service'
import { validateInvoiceForSkv } from '../lib/skv/validate-rot-request'
import { exportPlanCredit, assertPlanFortnoxAmounts } from '../lib/invoices/payment-plan/fortnox-credit'
const rows = [{ id:'r', item_type:'item', description:'Arbete', quantity:1, unit_price:1000, labor_amount:500, is_rot_eligible:true }]
const quote = { quote_id:'q', status:'accepted', quote_number:'Q1', total:1250, vat_amount:250, discount_amount:0, rot_rut_type:'rot', rot_rut_deduction:150, payment_plan:[{label:'Start',percent:40,amount:500},{label:'Klart',percent:60,amount:750}] }
const snapshot = makeSnapshot(quote,rows)
test('40/60 fördelar arbete, moms och ROT per faktura', () => {
  expect(snapshot.stages[0].amounts).toEqual({net:40000,vat:10000,labor:20000,deduction:6000})
  expect(snapshot.stages.reduce((s,e) => add(s,e.amounts),zero())).toEqual(snapshot.amounts)
  expect(stageItems(snapshot,snapshot.stages[0].amounts,'Start',0).filter(i=>i.item_type==='item').reduce((s,i)=>s+i.total,0)).toBe(400)
})
test('avrundningsrester hamnar i sista steget', () => {
  const s=makeSnapshot({...quote,total:1250.01,vat_amount:250,rot_rut_deduction:150,payment_plan:[{percent:33.33},{percent:33.33},{percent:33.34}]},[{...rows[0],unit_price:1000.01}])
  expect(s.stages.reduce((sum,e)=>add(sum,e.amounts),zero())).toEqual(s.amounts)
})
for (const [name,patch] of Object.entries({ 'över 100 procent':{payment_plan:[{percent:60},{percent:60}]}, 'negativ etapp':{payment_plan:[{percent:-10},{percent:110}]}, 'stale belopp':{total:1500}, 'ej accepterad':{status:'draft'}, 'för stort avdrag':{rot_rut_deduction:800} })) test(`avvisar ${name}`,()=>expect(()=>makeSnapshot({...quote,...patch},rows)).toThrow())
test('Fortnox kreditreferens återanvänds efter avbrutet svar', async()=>{
 const calls:string[]=[]
 expect(await exportPlanCredit(async(method,path)=>{calls.push(method+path);return {Invoice:{DocumentNumber:'1',CreditInvoiceReference:'2'}}},'1')).toBe('2')
 expect(calls).toEqual(['GET/invoices/1'])
})
test('Fortnox kreditering använder CreditInvoiceReference',async()=>{
 const calls:string[]=[]
 expect(await exportPlanCredit(async(method,path)=>{calls.push(method+path);return {Invoice:{DocumentNumber:'1',CreditInvoiceReference:method==='PUT'?'2':null}}},'1')).toBe('2')
 expect(calls).toEqual(['GET/invoices/1','PUT/invoices/1/credit'])
})
test('Fortnox tom kreditreferens får inte bli en debetfaktura',async()=>{
 await expect(exportPlanCredit(async()=>({Invoice:{DocumentNumber:'1'}}),'1')).rejects.toThrow('kreditreferens')
})

test('ROT-ansökan kräver utfört arbete även när kunden betalat',()=>{
 const result=validateInvoiceForSkv({invoice:{invoice_id:'i',payment_plan_quote_id:'q',status:'customer_paid',paid_at:new Date().toISOString(),rot_rut_type:'rot'},taxYear:new Date().getUTCFullYear()})
 expect(result.errors.some(e=>e.includes('Bekräfta utfört arbete'))).toBe(true)
})

test('Fortnox belopp kontrolleras före leverans, även krediter',()=>{
 expect(()=>assertPlanFortnoxAmounts({total:500,rot_rut_deduction:60},{Total:500,TaxReduction:60})).not.toThrow()
 expect(()=>assertPlanFortnoxAmounts({total:-500,rot_rut_deduction:-60},{Total:-500,TaxReduction:-60})).not.toThrow()
 expect(()=>assertPlanFortnoxAmounts({total:500,rot_rut_deduction:60},{Total:500,TaxReduction:0})).toThrow('skiljer')
 expect(()=>assertPlanFortnoxAmounts({total:500.45},{Total:500})).toThrow('avrundning')
})

test.describe('Verklig PostgreSQL-transaktion (PGlite)',()=>{
 let db:PGlite
 test.beforeAll(async()=>{
  db=new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE TABLE project(project_id text PRIMARY KEY,business_id text,customer_id text,quote_id text);
   CREATE TABLE quotes(quote_id text PRIMARY KEY,business_id text,customer_id text,status text);
   CREATE TABLE quote_items(id text,quote_id text,sort_order int);
   CREATE TABLE invoice(invoice_id text PRIMARY KEY,business_id text,project_id text,quote_id text,customer_id text,
     invoice_number text,ocr_number text,invoice_type text,status text,items jsonb,
     subtotal numeric,vat_amount numeric,total numeric,customer_pays numeric,rot_rut_deduction numeric,
     fortnox_sync_status text,fortnox_sync_attempted_at timestamptz,fortnox_document_number text,rot_work_cost numeric,rut_work_cost numeric,rot_deduction numeric,rut_deduction numeric,rot_rut_type text,vat_rate numeric,invoice_date date,paid_at timestamptz,credit_for_invoice_id text,created_at timestamptz DEFAULT now());`)
  await db.exec(`ALTER TABLE invoice ADD vat_rate_unused numeric;
   ALTER TABLE invoice ADD personnummer text, ADD fastighetsbeteckning text, ADD due_date date,
    ADD introduction_text text, ADD conclusion_text text, ADD our_reference text, ADD your_reference text,
    ADD partial_number int, ADD partial_total int, ADD rot_personal_number text, ADD rot_property_designation text,
    ADD is_credit_note boolean, ADD original_invoice_id text, ADD credit_reason text;
   CREATE TABLE business_config(business_id text PRIMARY KEY,business_name text,org_number text,bankgiro text,plusgiro text,bank_account_number text,default_payment_days int,next_invoice_number int,invoice_prefix text);
   INSERT INTO business_config VALUES('b','Test','Test','Test',NULL,NULL,30,1,'FV');`)
  await db.exec(fs.readFileSync('sql/v81_invoice_number_rpc.sql','utf8'))
  await db.exec(fs.readFileSync('sql/v214_payment_plan_invoicing.sql','utf8'))
 })
 test.afterAll(async()=>{await db?.close()})
 test.beforeEach(async()=>{
  await db.exec(`TRUNCATE invoice_payment_stage,invoice_payment_plan,invoice,project,quotes,quote_items CASCADE;
   INSERT INTO project VALUES('p','b','c','q'); INSERT INTO quotes VALUES('q','b','c','accepted');`)
  const source=(await db.query<any>(`SELECT payment_plan_source('b','p') AS value`)).rows[0].value
  await db.query(`SELECT activate_invoice_payment_plan('b','p',$1,$2)`,[source,snapshot])
 })
 function row(step:number,patch:any={}) {
  const a=snapshot.stages[step].amounts
  const effective = {...a,net:patch.subtotal == null ? a.net : patch.subtotal*100,vat:patch.vat_amount == null ? a.vat : patch.vat_amount*100,labor:patch.rot_work_cost == null ? a.labor : patch.rot_work_cost*100}
  return {invoice_date:'2026-09-05',rot_rut_type:'rot',business_id:'b',project_id:'p',quote_id:'q',customer_id:'c',invoice_type:step===1?'final':'partial',status:'draft',items:stageItems(snapshot,effective,'Etapp',0),subtotal:a.net/100,vat_amount:a.vat/100,total:(a.net+a.vat)/100,customer_pays:(a.net+a.vat-a.deduction)/100,rot_rut_deduction:a.deduction/100,rot_work_cost:a.labor/100,...patch}
 }
 async function write(step:number,patch:any={},original:string|null=null,business='b') {
  return (await db.query<any>(`SELECT write_payment_plan_invoice($1,'p',$2,$3,$4) AS value`,[business,step,original,row(step,patch)])).rows[0].value
 }
 test('retry och samtidiga köade anrop ger samma faktura',async()=>{
  const [a,b]=await Promise.all([write(0),write(0)])
  expect(a.invoice_id).toBe(b.invoice_id)
  expect((await db.query<any>('SELECT count(*)::int AS n FROM invoice')).rows[0].n).toBe(1)
  expect(a.created_at).toBeTruthy()
 })
 test('slutfakturan drar av tidigare etapp',async()=>{
  const a=await write(0)
  await db.query(`UPDATE invoice SET status='sent' WHERE invoice_id=$1`,[a.invoice_id])
  const final=await write(1)
  expect(Number(final.total)).toBe(750)
  expect((await db.query<any>('SELECT sum(total)::float AS total FROM invoice')).rows[0].total).toBe(1250)
 })
 test('fel företag, fel ordning och fel tak stoppas',async()=>{
  await expect(write(0,{},null,'other')).rejects.toThrow('saknas')
  await expect(write(1)).rejects.toThrow('ordning')
  await expect(write(0,{subtotal:900,total:1125})).rejects.toThrow('ogiltigt')
  expect((await db.query<any>('SELECT count(*)::int AS n FROM invoice')).rows[0].n).toBe(0)
 })
 test('utkast måste skickas före nästa steg',async()=>{
  await write(0)
  await expect(write(1)).rejects.toThrow('Skicka föregående')
 })
 test('kreditutkast frigör inget; utfärdad kredit avräknas exakt',async()=>{
  const a=await write(0)
  await db.query(`UPDATE invoice SET status='sent' WHERE invoice_id=$1`,[a.invoice_id])
  const credit=await write(0,{invoice_type:'credit',subtotal:-400,vat_amount:-100,total:-500,customer_pays:-440,rot_rut_deduction:-60,rot_work_cost:-200,credit_for_invoice_id:a.invoice_id},a.invoice_id)
  await expect(write(1)).rejects.toThrow('väntande kreditfakturan')
  expect((await db.query<any>('SELECT status FROM invoice WHERE invoice_id=$1',[a.invoice_id])).rows[0].status).toBe('sent')
  await db.query(`UPDATE invoice SET status='sent' WHERE invoice_id=$1`,[credit.invoice_id])
  const final=await write(1,{subtotal:1000,vat_amount:250,total:1250,customer_pays:1100,rot_rut_deduction:150,rot_work_cost:500})
  expect(Number(final.total)).toBe(1250)
  expect((await db.query<any>('SELECT sum(total)::float AS total FROM invoice')).rows[0].total).toBe(1250)
 })
 test('redigering, borttagning och vanlig offertfaktura kan inte kringgå planen',async()=>{
  const a=await write(0)
  await expect(db.query('UPDATE invoice SET total=9999 WHERE invoice_id=$1',[a.invoice_id])).rejects.toThrow('låsta')
  await expect(db.query('DELETE FROM invoice WHERE invoice_id=$1',[a.invoice_id])).rejects.toThrow('krediteras')
  await expect(db.exec(`INSERT INTO invoice(invoice_id,business_id,quote_id) VALUES('manual','b','q')`)).rejects.toThrow('betalplan')
 })
 test('RPC och register är stängda för klientroller',async()=>{
  await db.exec('SET ROLE authenticated')
  await expect(db.query(`SELECT write_payment_plan_invoice('b','p',0,NULL,$1)`,[row(0)])).rejects.toThrow('permission denied')
  await expect(db.exec('SELECT * FROM invoice_payment_plan')).rejects.toThrow('permission denied')
  await db.exec('RESET ROLE')
 })
 test('serverns fakturakärna, nummer, register och slutavräkning hänger ihop',async()=>{
   const adapter:any={
     rpc:async(name:string,args:any)=>{
       try {
         const keys=Object.keys(args)
         const sql=name==='next_invoice_number'?`SELECT * FROM ${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')})`:`SELECT ${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')}) AS value`
         const result=await db.query<any>(sql,Object.values(args))
         return {data:name==='next_invoice_number'?result.rows:result.rows[0]?.value,error:null}
       } catch(error){return {data:null,error}}
     },
     from:(table:string)=>{
       const filters:Array<[string,unknown]>=[];let one=false
       const q:any={select:()=>q,eq:(k:string,v:unknown)=>{filters.push([k,v]);return q},order:()=>q,single:()=>{one=true;return q},maybeSingle:()=>{one=true;return q},then:async(resolve:any,reject:any)=>{
         try {
           const where=filters.map(([k],i)=>`t.${k}=$${i+1}`).join(' AND ')
           const join=table==='invoice_payment_stage'?' LEFT JOIN invoice i ON i.invoice_id=t.invoice_id':''
           const fields=table==='invoice_payment_stage'?`t.*,to_jsonb(i) AS invoice`:'t.*'
           const result=await db.query(`SELECT ${fields} FROM ${table} t${join} WHERE ${where}`,filters.map(([,v])=>v))
           return resolve({data:one?result.rows[0]||null:result.rows,error:null})
         }catch(error){return resolve({data:null,error})}
       }};return q
     },
   }
   const first=await createPlanInvoice(adapter,'b','p',0)
   expect(first.invoice_number).toMatch(/^FV-\d{4}-\d+$/)
   expect(first.partial_number).toBe(1)
   expect(Number(first.customer_pays)).toBe(440)
   await db.query(`UPDATE invoice SET status='sent' WHERE invoice_id=$1`,[first.invoice_id])
   const final=await createPlanInvoice(adapter,'b','p',1)
   expect(final.invoice_type).toBe('final')
   expect(Number(final.total)).toBe(750)
   const state=await planState(adapter,await loadPlan(adapter,'b','p'))
   expect(state.remaining).toEqual(zero())
   expect((await createPlanInvoice(adapter,'b','p',1)).invoice_id).toBe(final.invoice_id)
 })
 test('årstaket räknar med utkast från andra projekt',async()=>{
   await db.exec(`INSERT INTO invoice(invoice_id,business_id,customer_id,status,invoice_type,rot_rut_type,rot_rut_deduction,invoice_date) VALUES('other','b','c','draft','standard','rot',49999,'2026-01-01')`)
   await expect(write(0)).rejects.toThrow('årstaket')
 })
 test('falska fakturarader rullas tillbaka tillsammans med registerposten',async()=>{
   await expect(write(0,{items:[]})).rejects.toThrow('Fakturaraderna')
   expect((await db.query<any>('SELECT count(*)::int AS n FROM invoice_payment_stage')).rows[0].n).toBe(0)
 })

 test('Fortnox-claim stoppar samtidiga och osäkra återförsök',async()=>{
   const invoice=await write(0)
   const claim=async()=> (await db.query<any>(`SELECT claim_payment_plan_fortnox('b',$1) AS ok`,[invoice.invoice_id])).rows[0].ok
   expect(await claim()).toBe(true)
   expect(await claim()).toBe(false)
   await db.query(`UPDATE invoice SET fortnox_sync_attempted_at=now()-interval '10 minutes' WHERE invoice_id=$1`,[invoice.invoice_id])
   expect(await claim()).toBe(false)
   await db.query(`UPDATE invoice SET fortnox_document_number='42' WHERE invoice_id=$1`,[invoice.invoice_id])
   expect(await claim()).toBe(true)
 })

})
