import { test,expect } from '@playwright/test'
import type { FollowupDatabase } from './helpers/followup-database'
import { followupDatabase,seedFollowup,scheduleTest,makeDue } from './helpers/followup-database'
import {readFileSync} from 'fs'
import {normalizeSwedishPhone} from '../lib/phone-normalize'
let db:FollowupDatabase
test.describe.configure({mode:'serial'})
test.beforeAll(async()=>{db=await followupDatabase()})
test.afterAll(async()=>{await db?.close()})
test.beforeEach(async()=>{await seedFollowup(db)})
async function row(){return (await db.query<any>('SELECT * FROM agent_followup')).rows[0]}
async function tick(){return db.query('SELECT run_agent_followups()')}
test('actual SQL creates one durable plan, repeats same request, never prepares early',async()=>{
 const a=await scheduleTest(db),b=await scheduleTest(db);expect(a.id).toBe(b.id)
 await tick();expect((await row()).state).toBe('scheduled');expect((await db.query('SELECT * FROM pending_approvals')).rows).toHaveLength(0)
 await expect(scheduleTest(db,'request-0002')).rejects.toThrow(/unique/)
 await expect(db.query(`select schedule_agent_followup('a','owner','q',now()+interval '3 hours','request-0001','m')`)).rejects.toThrow(/request_changed/)
})
test('late worker prepares exactly one review card and event; repeated and concurrent calls are harmless',async()=>{
 await scheduleTest(db);await makeDue(db);await Promise.all([tick(),tick(),tick()])
 expect((await row()).state).toBe('prepared')
 const cards=(await db.query<any>('SELECT * FROM pending_approvals')).rows;expect(cards).toHaveLength(1)
 expect(cards[0]).toMatchObject({status:'pending',approval_type:'send_sms',payload:{requires_manual_approval:true,mission_id:'m'}})
 expect((await db.query(`SELECT * FROM agent_followup_event WHERE state='prepared'`)).rows).toHaveLength(1)
 expect((await db.query('SELECT * FROM sms_log')).rows).toHaveLength(0)
})
for(const [name,sql,reason] of [
 ['customer SMS',`INSERT INTO sms_log(business_id,customer_id,direction) VALUES('a','c','inbound')`,'customer_contact'],
 ['email by address',`INSERT INTO email_conversations(business_id,from_email,direction) VALUES('a','TEST@example.invalid','inbound')`,'customer_contact'],
 ['portal message',`INSERT INTO customer_message(business_id,customer_id,direction) VALUES('a','c','inbound')`,'customer_contact'],
 ['new phone call',`INSERT INTO call_recording(business_id,from_number,direction) VALUES('a','+46700000000','inbound')`,'customer_contact'],
 ['quote change',`UPDATE quote_items SET quantity=2`,'source_changed'],
 ['customer change',`UPDATE customer SET phone_number='+46700000001'`,'source_changed'],
 ['new quote version',`INSERT INTO quotes(quote_id,business_id,parent_quote_id,version_number,status) VALUES('q2','a','q',2,'draft')`,'source_changed'],
 ['acceptance',`UPDATE quotes SET status='accepted'`,'quote_closed'],
 ['mission cancellation',`UPDATE mission SET status='cancelled'`,'mission_ended'],
 ['deleted member',`DELETE FROM business_users WHERE id='owner'`,'owner_unavailable'],
 ['withdrawn permission',`UPDATE business_users SET is_active=false WHERE id='owner'`,'owner_unavailable'],
 ['paused business',`UPDATE business_config SET agents_globally_paused=true WHERE business_id='a'`,'team_paused'],
 ['unknown subscription',`UPDATE business_config SET subscription_status=null,onboarding_completed_at=now(),trial_ends_at=now()+interval '1 day' WHERE business_id='a'`,'team_inactive'],
 ['unknown quote state',`UPDATE quotes SET status=null`,'quote_closed'],
 ['STOP',`UPDATE customer SET sms_opt_out=true`,'recipient_unavailable'],
 ['previous send',`INSERT INTO sms_log(business_id,related_id,direction,status) VALUES('a','q','outbound','sent')`,'already_contacted'],
]) test(`${name} stops old plan before any card`,async()=>{await scheduleTest(db);await makeDue(db);await db.exec(sql);await tick();expect(await row()).toMatchObject({state:'blocked',reason});expect((await db.query('SELECT * FROM pending_approvals')).rows).toHaveLength(0)})
test('foreign customer contact has no effect; foreign business cannot schedule or cancel',async()=>{
 await scheduleTest(db);await makeDue(db);await db.exec(`INSERT INTO customer_message(business_id,customer_id,direction) VALUES('b','c','inbound')`)
 await expect(db.query(`select schedule_agent_followup('a','other','q',now()+interval '1 hour','other-key',null)`)).rejects.toThrow(/not_allowed/)
 await expect(db.query(`select schedule_agent_followup('a','employee','q',now()+interval '1 hour','other-key',null)`)).rejects.toThrow(/not_allowed/)
 const f=await row();await expect(db.query(`select cancel_agent_followup('b','other',$1)`,[f.id])).rejects.toThrow(/missing/);await tick();expect((await row()).state).toBe('prepared')
})
test('disabled or stale runner cannot accept a promise',async()=>{
 await db.exec(`UPDATE agent_followup_runner SET last_tick_at=now()-interval '10 minutes'`);await expect(scheduleTest(db)).rejects.toThrow(/runner_unavailable/)
 await db.exec(`UPDATE agent_followup_runner SET enabled=false`);await tick();await expect(scheduleTest(db)).rejects.toThrow(/runner_unavailable/)
})
test('cancel after preparation revokes pending card and cannot be undone by worker',async()=>{
 await scheduleTest(db);await makeDue(db);await tick();const f=await row();await db.query(`select cancel_agent_followup('a','owner',$1)`,[f.id]);await tick()
 expect((await row()).state).toBe('cancelled');expect((await db.query<any>('SELECT status FROM pending_approvals')).rows[0].status).toBe('rejected')
})
test('send requires real approval, fresh sources and can only be claimed once',async()=>{
 await scheduleTest(db);await makeDue(db);await tick();const f=await row();const claim=()=>db.query(`select claim_agent_followup_send('a',$1,$2,'+46700000000')`,[f.id,f.approval_id])
 await expect(claim()).rejects.toThrow(/approval_required/)
 await db.exec(`UPDATE pending_approvals SET status='approved'`);await claim();await expect(claim()).rejects.toThrow(/followup_not_sendable/)
 await expect(db.query(`select cancel_agent_followup('a','owner',$1)`,[f.id])).rejects.toThrow(/approval_in_progress/)
})
test('new customer reply after preparation also blocks the actual send claim',async()=>{
 await scheduleTest(db);await makeDue(db);await tick();const f=await row()
 await db.exec(`UPDATE pending_approvals SET status='approved';INSERT INTO customer_message(business_id,customer_id,direction) VALUES('a','c','inbound')`)
 await expect(db.query(`select claim_agent_followup_send('a',$1,$2,'+46700000000')`,[f.id,f.approval_id])).rejects.toThrow(/customer_contact/)
 expect((await row()).send_claimed_at).toBeNull()
})
test('worker failure rolls back preparation and retries without losing intent',async()=>{
 await scheduleTest(db);await makeDue(db)
 await db.exec(`CREATE FUNCTION fail_card() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated'; END $$;CREATE TRIGGER fail_card BEFORE INSERT ON pending_approvals FOR EACH ROW EXECUTE FUNCTION fail_card();`)
 await tick();expect(await row()).toMatchObject({state:'scheduled',attempts:1,reason:'preparation_failed'});expect((await db.query('SELECT * FROM pending_approvals')).rows).toHaveLength(0)
 await db.exec('DROP TRIGGER fail_card ON pending_approvals;DROP FUNCTION fail_card();');await makeDue(db);await tick();expect((await row()).state).toBe('prepared')
})
test('completion is derived only from persisted success, never mere approval',async()=>{
 await scheduleTest(db);await makeDue(db);await tick();await db.exec(`UPDATE pending_approvals SET status='approved'`);await tick();expect((await row()).state).toBe('prepared')
 await makeDue(db);await db.exec(`UPDATE pending_approvals SET payload=payload||'{"execution_result":{"outcome":"success"}}'::jsonb`);await tick();expect((await row()).state).toBe('completed')
})
test('public callers cannot read or execute privileged functions',async()=>{
 const r=await db.query<any>(`SELECT has_table_privilege('authenticated','agent_followup','SELECT') as can_read,has_function_privilege('anon','run_agent_followups(integer)','EXECUTE') as can_run,has_function_privilege('authenticated','schedule_agent_followup(text,text,text,timestamptz,text,text)','EXECUTE') as can_schedule`)
 expect(r.rows[0]).toEqual({can_read:false,can_run:false,can_schedule:false})
 expect(readFileSync('sql/v2_durable_quote_followup.sql','utf8')).toBe(readFileSync('supabase/migrations/20260908165615_durable_quote_followup.sql','utf8'))
})

test('actual send_sms executor branch uses the durable claim before the sender',async()=>{
 await scheduleTest(db);await makeDue(db);await tick();const f=await row();await db.exec(`UPDATE pending_approvals SET status='approved'`)
 const card=(await db.query<any>('SELECT * FROM pending_approvals')).rows[0]
 const source=readFileSync('app/api/approvals/[id]/route.ts','utf8')
 const branch=source.slice(source.indexOf("      case 'quote_nudge':"),source.indexOf("      case 'send_email':",source.indexOf("      case 'quote_nudge':")))
 const ts=require('typescript');const executable=ts.transpileModule(`async function run(){switch(approval_type){${branch}}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
 let sends=0
 const adapter={rpc:async(_name:string,a:any)=>{
  try{return {data:(await db.query<any>(`select claim_agent_followup_send($1,$2,$3,$4) as ok`,[a.p_business,a.p_id,a.p_approval,a.p_to])).rows[0].ok,error:null}}
  catch(e){return {data:null,error:{message:String(e)}}}
 },from:()=>({insert:async()=>({error:null})})}
 const execute=new Function('approval_type','payload','businessId','approvalId','getSupabase','sendSms','extractAgentId',`${executable};return run();`)
 const run=()=>execute('send_sms',card.payload,'a',f.approval_id,async()=>adapter,async()=>{sends++;return {sms_sent:true,sms_id:'synthetic'}},()=> 'daniel')
 expect(await run()).toMatchObject({sms_sent:true});expect(await run()).toHaveProperty('error');expect(sends).toBe(1)
})

test('a missed day never sends a stale catch-up; fifth preparation failure stops retrying',async()=>{
 await scheduleTest(db);await db.exec(`UPDATE agent_followup SET due_at=now()-interval '2 days',next_attempt_at=now()-interval '2 days'`);await tick();expect(await row()).toMatchObject({state:'blocked',reason:'missed_window'})
 await seedFollowup(db);await scheduleTest(db);await makeDue(db)
 await db.exec(`CREATE FUNCTION fail_card() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated'; END $$;CREATE TRIGGER fail_card BEFORE INSERT ON pending_approvals FOR EACH ROW EXECUTE FUNCTION fail_card();`)
 for(let n=0;n<5;n++){await makeDue(db);await tick()}
 expect(await row()).toMatchObject({state:'failed',attempts:5});await tick();expect((await row()).attempts).toBe(5)
 await db.exec('DROP TRIGGER fail_card ON pending_approvals;DROP FUNCTION fail_card();')
})


test('service role can schedule through the restricted function',async()=>{
 await db.exec(`BEGIN;SET LOCAL ROLE service_role;SELECT schedule_agent_followup('a','owner','q',now()+interval '2 hours','role-test-0001','m');ROLLBACK;`)
 expect((await db.query('SELECT * FROM agent_followup')).rows).toHaveLength(0)
})

test('simultaneous scheduling requests share one durable identity',async()=>{
 const result=await Promise.all([scheduleTest(db),scheduleTest(db),scheduleTest(db)])
 expect(new Set(result.map(x=>x.id)).size).toBe(1)
 expect((await db.query('SELECT * FROM agent_followup')).rows).toHaveLength(1)
})


test('Swedish local phone formats match the existing sender and receive a normalized card',async()=>{
 for(const phone of ['070-000 00 00','0046700000000','46700000000','+46 (70) 000 00 00','+33123456789']){
  const r=await db.query<any>('SELECT agent_followup_phone($1) as phone',[phone]);expect(r.rows[0].phone).toBe(normalizeSwedishPhone(phone))
 }
 await db.exec(`UPDATE customer SET phone_number='070-000 00 00'`);await scheduleTest(db);await makeDue(db);await tick()
 const card=(await db.query<any>('SELECT payload FROM pending_approvals')).rows[0];expect(card.payload.to).toBe('+46700000000')
})
