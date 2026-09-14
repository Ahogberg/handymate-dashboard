import { test, expect } from '@playwright/test'
import { valueDatabase, card, events } from './helpers/value-events-database'
import { RECOVERY_APPROVAL_TYPES } from '../lib/value/recovered-revenue'

test('every recovery type and profitability warning produces exactly one snapshot per stage',async()=>{
 const db=await valueDatabase();try{
 for(const type of [...RECOVERY_APPROVAL_TYPES,'profitability_warning']) {
 await card(db,type,type,'pending',{amount_kr:12.34,amount_estimate:12.34,projected_overrun:12.34})
 await db.query("UPDATE pending_approvals SET status='approved', resolved_at='2026-08-03' WHERE id=$1",[type])
 await db.query("UPDATE pending_approvals SET payload=payload||'{\"execution_result\":{\"outcome\":\"success\"}}' WHERE id=$1",[type])
 }
 const all=await events(db)
 expect(all).toHaveLength((RECOVERY_APPROVAL_TYPES.length+1)*2)
 expect(all.every(e=>e.amount_minor==='1234' && e.amount_basis==='card_estimate')).toBe(true)
 await card(db,'other','not_a_recovery_type');expect(await events(db)).toHaveLength(all.length)
 }finally{await db.close()}
})
test('reject and expire record dismissal, source and event roll back together',async()=>{
 const db=await valueDatabase();try{
 await card(db,'rejected','missad_intakt','rejected');await card(db,'expired','missad_intakt','expired')
 expect((await events(db)).filter(e=>e.event_type==='opportunity_dismissed')).toHaveLength(2)
 await db.exec('BEGIN');await card(db,'rolled-back');await db.exec('ROLLBACK')
 expect((await events(db)).some(e=>e.card_id==='rolled-back')).toBe(false)
 }finally{await db.close()}
})
test('only earned successful autonomous logs without approval produce acted; retry is idempotent',async()=>{
 const db=await valueDatabase();try{
 let n=0
 for(const key of ['invoice_reminder','booking_reminder','quote_followup_sms','review_request','unknown']){
 for(const status of ['success','failed']){
 for(const approval of [null,'linked']){
 await db.query(`INSERT INTO v3_automation_logs(id,business_id,rule_name,trigger_type,action_type,status,approval_id,context,created_at)
 VALUES($1,'a','a','threshold','send_sms',$2,$3,$4,'2026-08-03')`,['log'+n++,status,approval,JSON.stringify({earned_autonomy:true,autonomy_key:key})])
 }}}
 expect((await events(db)).filter(e=>e.event_type==='opportunity_acted')).toHaveLength(4)
 await db.exec("UPDATE v3_automation_logs SET status='success' WHERE status='success'")
 expect((await events(db)).filter(e=>e.event_type==='opportunity_acted')).toHaveLength(4)
 }finally{await db.close()}
})
test('quote, invoice and reminder timestamp pairs use direct same-tenant sources; no historical dates backfilled',async()=>{
 const db=await valueDatabase();try{
 await db.exec(`INSERT INTO leads VALUES('lead','a','2026-08-02 10:00Z'),('foreign','b','2026-08-02 10:00Z');
 INSERT INTO quotes VALUES('q','a','lead','2026-08-02 11:00Z'),('q2','a','foreign','2026-08-02 11:00Z');
 INSERT INTO project VALUES('p','a','2026-08-02 11:00Z');
 INSERT INTO invoice(invoice_id,business_id,project_id,sent_at,due_date) VALUES('i','a','p','2026-08-02 11:30Z','2026-08-02');
 INSERT INTO v3_automation_logs(id,business_id,rule_name,trigger_type,action_type,status,context,created_at)
 VALUES('rem','a','invoice_reminder','cron','send_sms','success','{"invoice_id":"i"}','2026-08-03 00:00Z');`)
 const all=await events(db)
 expect(all.map(e=>Number(e.minutes))).toEqual([60,15,30,120]) // due date ends at Swedish midnight (22:00Z)
 expect(all.map(e=>e.minutes_basis)).toEqual(['measured','estimate','measured','measured'])
 expect(all.filter(e=>e.minutes_basis==='measured').every(e=>e.payload.metric==='elapsed_minutes')).toBe(true)
 await db.exec("UPDATE quotes SET sent_at='2026-08-04' WHERE quote_id='q'")
 expect(await events(db)).toHaveLength(4)
 }finally{await db.close()}
})
