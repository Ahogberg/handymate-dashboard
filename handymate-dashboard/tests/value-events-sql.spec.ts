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
