import { test, expect } from '@playwright/test'
import { valueDatabase, card, events } from './helpers/value-events-database'
import { readFileSync } from 'fs'

test('immutable under owner and service role, member reads isolated, no direct writes', async () => {
 const db=await valueDatabase();try {
 await card(db);await card(db,'other','missad_intakt','pending',{},'b')
 for(const query of ['UPDATE value_events SET payload=\'{}\'', 'DELETE FROM value_events', 'TRUNCATE value_events']) await expect(db.exec(query)).rejects.toThrow('value_events_immutable')
 await db.exec("SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'")
 expect((await events(db)).map(e=>e.business_id)).toEqual(['a'])
 await expect(db.exec("SELECT append_value_event('a','{}')")).rejects.toThrow('permission denied')
 await db.exec('RESET ROLE; SET ROLE service_role')
 await expect(db.exec("INSERT INTO value_events(business_id) VALUES('a')")).rejects.toThrow('permission denied')
 await expect(db.exec("UPDATE value_events SET payload='{}'")).rejects.toThrow('permission denied')
 expect((await events(db)).length).toBe(2)
 } finally {await db.close()}
})
test('RPC rejects reserved stages, foreign sources/cards, subject mismatch and invented measured time', async () => {
 const db=await valueDatabase();try {
 await card(db);await card(db,'foreign','missad_intakt','pending',{},'b')
 const original=(await events(db))[0]
 await db.exec('SET ROLE service_role')
 for(const patch of [{event_type:'invoice_issued'},{event_type:'payment_received'},{source_id:'foreign',subject_id:'foreign'},
 {card_id:'foreign'},{subject_id:'elsewhere'},{event_type:'time_measured',amount_minor:null,amount_basis:null,minutes:60,minutes_basis:'measured',payload:{metric:'elapsed_minutes'}}]) {
 await expect(db.query('SELECT append_value_event($1,$2)', ['a',JSON.stringify({...original,...patch,idempotency_key:'bad'})])).rejects.toThrow()
 }
 const again=await db.query<any>('SELECT append_value_event($1,$2) AS event',['a',JSON.stringify(original)])
 expect(again.rows[0].event.id).toBe(original.id)
 expect(again.rows[0].event.amount_minor).toBe('10000')
 }finally {await db.close()}
})
test('backfill dry-run does not write; bounded replay seeds once and marks provenance',async()=>{
 const db=await valueDatabase(false);try{
 await card(db,'one','missad_intakt','approved');await card(db,'two')
 await db.exec('SET ROLE deployer');await db.exec(readFileSync('sql/v241_value_events.sql','utf8'));await db.exec('RESET ROLE; SET ROLE service_role')
 await db.exec("SELECT backfill_value_events('a')")
 expect(await events(db)).toHaveLength(0)
 const page=await db.query<any>("SELECT backfill_value_events('a',false,'',1) AS result")
 expect(page.rows[0].result).toMatchObject({has_more:true,last_id:'one'})
 await db.exec("SELECT backfill_value_events('a',false,'one',1)")
 const first=await events(db)
 expect(first).toHaveLength(3);expect(first.every(e=>e.payload.backfilled===true)).toBe(true)
 await db.exec("SELECT backfill_value_events('a',false)")
 expect(await events(db)).toEqual(first)
 await expect(db.exec("SELECT backfill_value_events('a',NULL)")).rejects.toThrow('invalid_backfill_options')
 }finally{await db.close()}
})

test('M1: RLS-permitted member writes append events through all three trigger wrappers', async () => {
 const db = await valueDatabase()
 try {
  // Model the existing member-write policies without granting privileged producers
  // or access to the project/lead lookup tables to the caller.
  await db.exec(`
   DROP POLICY pending_approvals_policy ON pending_approvals;
   DROP POLICY v3_automation_logs_policy ON v3_automation_logs;
   ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
   ALTER TABLE invoice ENABLE ROW LEVEL SECURITY;
   INSERT INTO leads VALUES ('member-lead','a','2026-08-02 10:00Z');
   INSERT INTO project VALUES ('member-project','a','2026-08-02 10:00Z');
  `)
  for (const table of ['pending_approvals', 'v3_automation_logs', 'quotes', 'invoice']) {
   await db.exec(`GRANT SELECT, INSERT, UPDATE ON ${table} TO authenticated;
    CREATE POLICY member_write ON ${table} FOR ALL TO authenticated
    USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));`)
  }
  await db.exec("SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'")
  await expect(db.exec('SELECT * FROM project')).rejects.toThrow('permission denied')
  await expect(db.exec('SELECT * FROM leads')).rejects.toThrow('permission denied')

  await card(db, 'member-card')
  await db.exec("UPDATE pending_approvals SET status='approved', resolved_at='2026-08-03' WHERE id='member-card'")
  await db.exec(`INSERT INTO quotes VALUES ('member-quote','a','member-lead',NULL);
   UPDATE quotes SET sent_at='2026-08-02 11:00Z' WHERE quote_id='member-quote';
   INSERT INTO invoice(invoice_id,business_id,project_id) VALUES ('member-invoice','a','member-project');
   UPDATE invoice SET sent_at='2026-08-02 10:30Z' WHERE invoice_id='member-invoice';
   INSERT INTO v3_automation_logs(id,business_id,rule_name,trigger_type,action_type,status,context,created_at)
   VALUES ('member-log','a','reminder','cron','send_sms','failed',
    '{"earned_autonomy":true,"autonomy_key":"booking_reminder"}','2026-08-03');
   UPDATE v3_automation_logs SET status='success' WHERE id='member-log';`)
  const produced = await events(db)
  expect(produced).toHaveLength(6)
  expect(produced.every(e => e.business_id === 'a')).toBe(true)
  expect(produced.filter(e => e.event_type === 'opportunity_acted')).toHaveLength(2)
  expect(produced.filter(e => e.event_type === 'time_measured').map(e => Number(e.minutes))).toEqual([60, 30])
  await db.exec("UPDATE pending_approvals SET status='approved' WHERE id='member-card'; UPDATE v3_automation_logs SET status='success' WHERE id='member-log'")
  expect(await events(db)).toEqual(produced)

  // Definer privilege is confined to the trigger; it does not bypass the
  // original source table's RLS or make the privileged RPCs public.
  for (const sql of [
   "INSERT INTO pending_approvals(id,business_id,approval_type,title) VALUES('forbidden-card','b','missad_intakt','x')",
   "INSERT INTO quotes VALUES('forbidden-quote','b',NULL,'2026-08-03')",
   "INSERT INTO invoice(invoice_id,business_id,sent_at) VALUES('forbidden-invoice','b','2026-08-03')",
   "INSERT INTO v3_automation_logs(id,business_id,rule_name,trigger_type,action_type,status) VALUES('forbidden-log','b','x','cron','send_sms','success')",
  ]) await expect(db.exec(sql)).rejects.toThrow('row-level security')
  for (const sql of [
   "SELECT append_value_event('a','{}')",
   "SELECT record_value_approval('a','member-card')",
   "SELECT record_value_automation('a','member-log')",
   "SELECT record_value_time('a','quote','member-quote','test',NULL,now(),1)",
  ]) await expect(db.exec(sql)).rejects.toThrow('permission denied')
  await expect(db.exec("INSERT INTO value_events(business_id) VALUES('a')")).rejects.toThrow('permission denied')
  expect(await events(db)).toEqual(produced)
 } finally { await db.close() }
})
