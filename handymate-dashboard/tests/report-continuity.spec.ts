import {test,expect} from '@playwright/test'
import fs from 'fs'
import {followupDatabase,type FollowupDatabase} from './helpers/followup-database'
let db:FollowupDatabase
const parts: Array<{toolName:string;toolInput:Record<string,unknown>;summary:string}>=[{toolName:'log_time',toolInput:{project_id:'p',work_date:'2026-09-08',duration_minutes:60},summary:'En timme'},{toolName:'log_material',toolInput:{project_id:'p',name:'Kabel',quantity:2},summary:'Två meter kabel'}]
test.describe.configure({mode:'serial'})
test.beforeAll(async()=>{db=await followupDatabase();await db.exec("CREATE TABLE public.project(project_id text primary key,business_id text);INSERT INTO business_config(business_id) VALUES('b'),('other');INSERT INTO business_users VALUES('u','b',true,'employee'),('foreign','other',true,'owner');INSERT INTO project VALUES('p','b');");await db.exec(fs.readFileSync('sql/v2_report_continuity.sql','utf8'))})
test.afterAll(async()=>{await db.close()})
test.beforeEach(async()=>{await db.exec("TRUNCATE work_report_session;UPDATE business_users SET is_active=true;");await db.query("INSERT INTO work_report_session(id,business_id,business_user_id,project_id,work_date,parts) VALUES('r','b','u','p','2026-09-08',$1)",[JSON.stringify(parts)])})
async function claim(tool=parts[0]){return (await db.query<any>('SELECT * FROM public.claim_work_report_step($1,$2,$3,$4,$5)',['b','u','r',tool.toolName,JSON.stringify(tool.toolInput)])).rows[0]}
async function finish(c:any,success=true,status='saved'){return (await db.query<any>('SELECT * FROM public.finish_work_report_step($1,$2,$3,$4,$5,$6,$7)',['b','u','r',c.completed,c.claim_id,success,JSON.stringify({tool:parts[c.completed].toolName,status})])).rows[0]}
test('plan survives new reads; one current step, two durable receipts, terminal state',async()=>{let c=await claim();await finish(c);const read=(await db.query<any>("SELECT * FROM work_report_session WHERE id='r'")).rows[0];expect(read.completed).toBe(1);expect(read.parts).toEqual(parts);c=await claim(parts[1]);const done=await finish(c);expect(done.state).toBe('finished');expect(done.receipts).toHaveLength(2);await expect(claim(parts[1])).rejects.toThrow('report_closed')})
test('simultaneous decisions claim one slot; duplicate completion cannot advance twice',async()=>{const results=await Promise.allSettled([claim(),claim()]);expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);const c=(results.find(x=>x.status==='fulfilled') as PromiseFulfilledResult<any>).value;await finish(c);expect((await finish(c)).completed).toBe(1)})
test('wrong company, user, tool or changed content cannot claim',async()=>{await expect(db.query("SELECT public.claim_work_report_step('other','foreign','r','log_time','{}')")).rejects.toThrow('report_not_found');await expect(claim(parts[1])).rejects.toThrow('stale_report_step');await expect(claim({...parts[0],toolInput:{...parts[0].toolInput,duration_minutes:90}})).rejects.toThrow('stale_report_step');await db.exec("UPDATE business_users SET is_active=false WHERE id='u'");await expect(claim()).rejects.toThrow('member_unavailable')})
test('lost worker keeps uncertainty and blocks discard; user may reclaim same step after timeout',async()=>{await claim();await expect(db.query("SELECT public.discard_work_report('b','u','r')")).rejects.toThrow('report_in_progress');await db.exec("UPDATE work_report_session SET claimed_at=now()-interval '3 minutes'");const c=await claim();expect(c.completed).toBe(0);expect(c.receipts).toEqual([]);await finish(c);expect((await db.query<any>('SELECT completed FROM work_report_session')).rows[0].completed).toBe(1)})
test('late failed worker cannot clear a newer claim',async()=>{const old=await claim();await db.exec("UPDATE work_report_session SET claimed_at=now()-interval '3 minutes'");const next=await claim();await expect(finish(old,false)).rejects.toThrow('stale_report_step');await finish(next);expect((await db.query<any>('SELECT completed FROM work_report_session')).rows[0].completed).toBe(1)})
test('failed/unconfirmed write never creates receipt; discard retains that uncertainty',async()=>{const c=await claim();const r=await finish(c,false);expect(r.completed).toBe(0);expect(r.last_error).toBe(true);const discarded=(await db.query<any>("SELECT * FROM public.discard_work_report('b','u','r')")).rows[0];expect(discarded.state).toBe('discarded');expect(discarded.last_error).toBe(true);await expect(claim()).rejects.toThrow('report_closed')})
test('null or false success receipt cannot become saved',async()=>{const c=await claim();await expect(db.query('SELECT public.finish_work_report_step($1,$2,$3,0,$4,true,$5)',['b','u','r',c.claim_id,JSON.stringify({tool:'log_time'})])).rejects.toThrow('invalid_receipt');expect((await db.query<any>('SELECT completed FROM work_report_session')).rows[0].completed).toBe(0)})
test('one open plan per owner job date; expired plan cannot be executed',async()=>{await expect(db.query("INSERT INTO work_report_session(id,business_id,business_user_id,project_id,work_date,parts) VALUES('second','b','u','p','2026-09-08',$1)",[JSON.stringify(parts)])).rejects.toThrow();await db.exec("UPDATE work_report_session SET expires_at=now()-interval '1 minute'");await expect(claim()).rejects.toThrow('report_closed');await db.query("SELECT public.discard_work_report('b','u','r')")})
test('public roles cannot read the plans or execute mutations; service role can claim',async()=>{
 // A single statement pins each role probe to one pool connection. Schema usage
 // permits reaching the table/function grants, which are the protection under test.
 await db.exec('GRANT USAGE ON SCHEMA public TO anon, authenticated')
 for(const role of ['anon','authenticated']) await db.exec(`DO $$ BEGIN
  SET LOCAL ROLE ${role};
  BEGIN
   PERFORM * FROM public.work_report_session;
   RAISE EXCEPTION 'unexpected report read permission';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
   PERFORM * FROM public.claim_work_report_step('b','u','r','log_time','{"project_id":"p","work_date":"2026-09-08","duration_minutes":60}'::jsonb);
   RAISE EXCEPTION 'unexpected report mutation permission';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END $$`)
 await db.exec(`DO $$ DECLARE report public.work_report_session; BEGIN
  SET LOCAL ROLE service_role;
  SELECT * INTO report FROM public.claim_work_report_step('b','u','r','log_time','{"project_id":"p","work_date":"2026-09-08","duration_minutes":60}'::jsonb);
  IF report.id IS DISTINCT FROM 'r' THEN RAISE EXCEPTION 'service role did not claim'; END IF;
 END $$`)
})
test('all four report types advance exactly once and retain all four receipts',async()=>{
 const all=[parts[0],{toolName:'add_work_note',toolInput:{project_id:'p',log_date:'2026-09-08',work_performed:'Montering'},summary:'Anteckning'},parts[1],{toolName:'create_ata_draft',toolInput:{project_id:'p',description:'Extra uttag'},summary:'ÄTA-förslag'}]
 await db.query("UPDATE work_report_session SET parts=$1 WHERE id='r'",[JSON.stringify(all)])
 for(let i=0;i<all.length;i++){const c=await claim(all[i]);const r=(await db.query<any>('SELECT * FROM public.finish_work_report_step($1,$2,$3,$4,$5,true,$6)',['b','u','r',i,c.claim_id,JSON.stringify({tool:all[i].toolName,status:'saved'})])).rows[0];expect(r.completed).toBe(i+1);expect(r.receipts).toHaveLength(i+1);expect(r.state).toBe(i===3?'finished':'open')}
})
