import { c5Modules } from './helpers/c5-module'
import { test, expect } from '@playwright/test'
import { getManadsLedger } from '../lib/value/ledger'
import { byggVardekvitto } from '../lib/value/vardekvitto'
import { valueDatabase, card } from './helpers/value-events-database'
import { valuePostgrest } from './helpers/value-postgrest'
import { readValueTime, readValueEvents, ledgerMethod } from '../lib/value/events/read'
import { readFileSync } from 'fs'

test('method 2 and 3 agree on a production-shaped backfilled cohort through invoice/payment facit',async()=>{
 const db=await valueDatabase(false);try{
 await card(db,'pending','profitability_warning','pending',{projected_overrun:500})
 await card(db,'rejected','missad_intakt','rejected',{amount_kr:400})
 await card(db,'paid','fakturera_projekt','approved',{amount_kr:2000,execution_result:{artifacts:{invoice_id:'paid'}}})
 await card(db,'ata','create_ata_draft','approved',{amount_estimate:500,execution_result:{artifacts:{ata_id:'ata'}}})
 await card(db,'draft','missad_intakt','approved',{amount_kr:1000,draft_invoice_id:'draft'})
 await card(db,'duplicate','missad_intakt','approved',{amount_kr:2000,draft_invoice_id:'paid'})
 await card(db,'reminder','invoice_reminder','approved',{amount_kr:1000,invoice_id:'rem'})
 await card(db,'foreign','missad_intakt','approved',{amount_kr:1000,draft_invoice_id:'foreign'})
 await db.exec(`INSERT INTO invoice(invoice_id,business_id,status,total,paid_amount,paid_at) VALUES
 ('paid','a','customer_paid',2500,2000,'2026-08-09'),('ata','a','sent',600,0,NULL),('draft','a','draft',1000,0,NULL),
 ('rem','a','paid',1000,1000,'2026-08-08'),('foreign','b','paid',1000,1000,'2026-08-08');
 INSERT INTO project_change VALUES('ata','a','ata','2026-08-05');`)
 await db.exec('SET ROLE deployer');await db.exec(readFileSync('sql/v241_value_events.sql','utf8'));await db.exec('RESET ROLE')
 await db.exec("SELECT backfill_value_events('a',false)")
 const client=valuePostgrest(db)
 const two=await getManadsLedger(client,'a','2026-08',2),three=await getManadsLedger(client,'a','2026-08',3)
 expect({...three,method_version:2}).toEqual(two)
 expect(three?.betalt.kr).toBe(3000);expect(three?.fakturerat.kr).toBe(3100)
 }finally{await db.close()}
})
test('late execution artifacts resolve the same cohort; deleting a card does not delete its identified work',async()=>{
 const db=await valueDatabase();try{
 await card(db,'late','fakturera_projekt','approved',{amount_kr:500})
 await db.exec(`INSERT INTO invoice(invoice_id,business_id,status,total,paid_amount) VALUES('i','a','sent',600,0);
 UPDATE pending_approvals SET payload=payload||'{"execution_result":{"artifacts":{"invoice_id":"i"}}}' WHERE id='late';`)
 const client=valuePostgrest(db)
 expect((await getManadsLedger(client,'a','2026-08',3))?.fakturerat.kr).toBe(600)
 await db.exec("DELETE FROM pending_approvals WHERE id='late'")
 expect((await getManadsLedger(client,'a','2026-08',3))?.identifierat.kr).toBe(500)
 }finally{await db.close()}
})
test('time read paginates beyond one page and separates measurements from estimates, money receipts unchanged',async()=>{
 const db=await valueDatabase();try{
 await db.exec(`INSERT INTO leads VALUES('l','a','2026-08-01 10:00Z');
 INSERT INTO quotes VALUES('q','a','l','2026-08-01 11:00Z');
 INSERT INTO v3_automation_logs(id,business_id,rule_name,trigger_type,action_type,status,created_at)
 SELECT 'l'||n,'a','test','cron','send_sms','success','2026-08-02' FROM generate_series(1,501)n;`)
 const time=await readValueTime(valuePostgrest(db),'a','2026-08-01','2026-09-01')
 expect(time).toMatchObject({measured_minutes:60,estimated_minutes:3006})
 const a=byggVardekvitto({period:'2026-08',attributions:[],potentialKr:null})
 const b=byggVardekvitto({period:'2026-08',attributions:[],potentialKr:null,time})
 expect(b.confirmed_kr).toBe(a.confirmed_kr);expect(b.confirmed_items).toEqual(a.confirmed_items)
 expect(b.measured_minutes).toBe(60)
 }finally{await db.close()}
})
test('method selection has explicit comparison and safe default',()=>{
 const old=process.env.VALUE_EVENTS_ENABLED;try{
 delete process.env.VALUE_EVENTS_ENABLED;expect(ledgerMethod()).toBe(2)
 expect(ledgerMethod('3')).toBe(3);process.env.VALUE_EVENTS_ENABLED='true';expect(ledgerMethod()).toBe(3)
 expect(ledgerMethod('2')).toBe(2);expect(()=>ledgerMethod('4')).toThrow()
 }finally{if(old===undefined) delete process.env.VALUE_EVENTS_ENABLED;else process.env.VALUE_EVENTS_ENABLED=old}
})

test('weekly response adds separate event time fields without changing money or legacy time contracts',async()=>{
 const recovered={total_recovered_kr:1234,attributions:[]}
 const load=c5Modules({
  './value/recovered-revenue':{getRecoveredRevenue:async()=>recovered},
  './value/events/read':{valueEventsEnabled:()=>true,readValueTime:async()=>({measured_minutes:120,estimated_minutes:7,measured_minutes_basis:'elapsed_workflow_time_not_labour_saved'})},
 })
 const {getWeeklyValue}=load('lib/weekly-value.ts')
 const query:any={select:()=>query,eq:()=>query,gte:()=>query,limit:()=>query,contains:()=>query,then:(f:any)=>Promise.resolve(f({data:[],count:0,error:null}))}
 const result=await getWeeklyValue({from:()=>query},'a')
 expect(result).toMatchObject({confirmed_kr:1234,time_minutes:0,time_hours:0,measured_minutes:120,estimated_minutes:7})
})


test('read boundary preserves bigint amounts and cursors beyond JS safe integers',async()=>{
 const db=await valueDatabase();try{
 await db.exec("SELECT setval('value_events_seq_seq',9007199254740992)")
 await card(db,'large','missad_intakt','pending',{amount_kr:90071992547410})
 const rows=await readValueEvents(valuePostgrest(db),'a')
 expect(rows[0].seq).toBe('9007199254740993')
 expect(rows[0].amount_minor).toBe('9007199254741000')
 }finally{await db.close()}
})
