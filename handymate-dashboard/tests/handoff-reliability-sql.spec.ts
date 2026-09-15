import { test, expect } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
async function database(){const db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE business_config(business_id text PRIMARY KEY,agents_globally_paused boolean default false);
 CREATE TABLE v3_automation_rules(id text PRIMARY KEY,business_id text,is_active boolean,is_system boolean,action_type text,trigger_type text,action_config jsonb);
 INSERT INTO business_config(business_id) VALUES('a'),('b');
 INSERT INTO v3_automation_rules VALUES('rule-a','a',true,true,'run_agent','cron','{}'),('rule-b','b',true,true,'run_agent','cron','{}');
 UPDATE v3_automation_rules SET action_config=jsonb_build_object('instruction','Generera morgonrapport med dagens bokningar, utestående offerter, försenade fakturor och insikter.');`);await db.exec(readFileSync('sql/v245_handoff_reliability.sql','utf8'));return db}
const claim=async(db:PGlite,b='a',r='rule-a')=>(await db.query<any>('SELECT * FROM claim_morning_report($1,$2)',[b,r])).rows[0]
const finish=async(db:PGlite,r:any,outcome='failed',token=r.attempt_token)=>(await db.query<any>('SELECT finish_morning_report($1,$2,$3,$4,$5,$6,$7,false) AS ok',[r.business_id,r.day,token,outcome,'underlag',null,'Försenad'])).rows[0].ok

test('daily notice is atomic, tenant/channel scoped, durable and unavailable to member writes',async()=>{
 const db=await database();try{
 await db.exec("SET ROLE service_role")
 await Promise.all(Array.from({length:8},()=>db.exec("SELECT record_channel_notice('a','sms','saldo','Pausat')")))
 await db.exec("SELECT record_channel_notice('b','sms','saldo','Pausat');SELECT record_channel_notice('a','email','konfiguration','Pausat')")
 expect((await db.query('SELECT * FROM channel_notices')).rows).toHaveLength(3)
 await db.exec('SET ROLE authenticated');await expect(db.exec('SELECT * FROM channel_notices')).rejects.toThrow('permission denied')
 await expect(db.exec("SELECT record_channel_notice('a','sms','saldo','fake')")).rejects.toThrow('permission denied')
 await expect(db.exec("SELECT * FROM claim_morning_report('a','rule-a')")).rejects.toThrow('permission denied')
 }finally{await db.close()}
})
test('one initial claim, due-time enforced, exactly one retry, fencing and no third attempt',async()=>{
 const db=await database();try{
 expect(await claim(db,'a','rule-b')).toBeUndefined()
 const r=await claim(db);expect(r.attempts).toBe(1);expect(await claim(db)).toBeUndefined()
 expect(await finish(db,r,'failed','00000000-0000-0000-0000-000000000001')).toBe(false)
 expect(await finish(db,r)).toBe(true);expect(await claim(db)).toBeUndefined()
 await db.exec("UPDATE morning_report_runs SET next_attempt_at=now()-interval '1 second'")
 const retry=await claim(db);expect(retry.attempts).toBe(2);expect(retry.attempt_token).not.toBe(r.attempt_token)
 expect(await finish(db,r)).toBe(false);expect(await finish(db,retry)).toBe(true);expect(await claim(db)).toBeUndefined()
 expect((await db.query<any>('SELECT status FROM morning_report_runs')).rows[0].status).toBe('exhausted')
 }finally{await db.close()}
})
test('worker crash is unknown with visible notice; never blindly sends again; pause is respected',async()=>{
 const db=await database();try{
 const r=await claim(db);await db.exec("UPDATE morning_report_runs SET claimed_at=now()-interval '6 minutes'")
 expect(await claim(db)).toBeUndefined()
 expect((await db.query<any>('SELECT status,notice FROM morning_report_runs')).rows[0]).toMatchObject({status:'unknown'})
 expect(await finish(db,r,'delivered')).toBe(false)
 await db.exec("UPDATE business_config SET agents_globally_paused=true WHERE business_id='b'")
 expect(await claim(db,'b','rule-b')).toBeUndefined()
 await db.exec("DELETE FROM business_config WHERE business_id='a'")
 expect((await db.query('SELECT * FROM morning_report_runs')).rows).toHaveLength(0)
 }finally{await db.close()}
})
test('paused pending retry is cancelled without another attempt, preserving other tenants',async()=>{
 const db=await database();try{
 const a=await claim(db);await finish(db,a)
 const b=await claim(db,'b','rule-b');await finish(db,b)
 await db.exec("UPDATE business_config SET agents_globally_paused=true WHERE business_id='a'")
 expect(await claim(db)).toBeUndefined()
 const rows=(await db.query<any>('SELECT business_id,status,attempts FROM morning_report_runs ORDER BY business_id')).rows
 expect(rows).toEqual([{business_id:'a',status:'cancelled',attempts:1},{business_id:'b',status:'retry',attempts:1}])
 }finally{await db.close()}
})
test('quiet-hour deferral does not consume the one failure retry',async()=>{
 const db=await database();try{
 const r=await claim(db);await finish(db,r,'deferred');expect(await claim(db)).toBeUndefined()
 await db.exec("UPDATE morning_report_runs SET next_attempt_at=now()-interval '1 second'")
 const resumed=await claim(db);expect(resumed.attempts).toBe(1)
 await finish(db,resumed);await db.exec("UPDATE morning_report_runs SET next_attempt_at=now()-interval '1 second'")
 expect((await claim(db)).attempts).toBe(2)
 }finally{await db.close()}
})
