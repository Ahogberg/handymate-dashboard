import {test,expect} from '@playwright/test'
import {receivablesDatabase,seedInvoice,domain} from './helpers/financial-receivables-database'
let f:Awaited<ReturnType<typeof receivablesDatabase>>
test.describe.configure({mode:'serial'})
test.beforeAll(async()=>{f=await receivablesDatabase()})
test.afterAll(async()=>{await f?.db.close()})
test.beforeEach(async()=>{await f.db.exec('BEGIN');await seedInvoice(f.db,'i','12500','a','rot','9500')})
test.afterEach(async()=>{await f.db.exec('ROLLBACK;RESET ROLE')})
const command=(key:string,amount:string|null=null,observation:unknown=null)=>domain<any>(f.db,'execute_payment_command',['a',key,'i','manual',null,amount,null,'manual','manual','manual',observation,100,['portal_message'],'manual',null,'system',null])
test('stable identity cannot turn a customer retry into a tax payment, including fresh timestamp/amount',async()=>{
 const first=await command('manual:a');const replay=await command('manual:a','1');expect(replay.command.payment_id).toBe(first.command.payment_id);expect(replay.command.replayed).toBe(true);expect(replay.projection.derived_status).toBe('customer_paid');expect(replay.projection.recorded_minor).toBe('950000')
})
test('legacy evidence persists routing and creates no receivables even after evidence changes',async()=>{
 await f.db.exec("RESET ROLE;UPDATE invoice SET status='customer_paid',paid_amount=9500;SET LOCAL ROLE service_role")
 expect((await command('manual:old')).command.route).toBe('legacy')
 await f.db.exec("RESET ROLE;UPDATE invoice SET status='sent',paid_amount=0;SET LOCAL ROLE service_role")
 expect((await command('manual:other')).command.route).toBe('legacy');expect((await f.db.query('SELECT id FROM financial_receivables')).rows).toEqual([])
})
test('provider confirms manual money, only its new delta is recorded',async()=>{
 await command('manual:a');expect((await command('manual:observed',null,{paid_minor:'950000'})).command.state).toBe('no_new_money')
 expect((await command('manual:below',null,{paid_minor:'900000'})).command.state).toBe('provider_below_kernel')
 expect((await command('manual:tax',null,{paid_minor:'1250000'})).command.amount_minor).toBe('300000')
 expect((await f.db.query('SELECT id FROM financial_payments')).rows).toHaveLength(2)
})
test('injected projection failure rolls back issuance, payment, allocations, command and intents',async()=>{
 await f.db.exec("RESET ROLE;CREATE FUNCTION deny_projection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$;CREATE TRIGGER deny_projection BEFORE UPDATE ON invoice FOR EACH ROW EXECUTE FUNCTION deny_projection();SET LOCAL ROLE service_role;SAVEPOINT fault")
 await expect(command('manual:fail')).rejects.toThrow('injected');await f.db.exec('ROLLBACK TO SAVEPOINT fault')
 for(const table of ['financial_receivables','financial_payments','financial_payment_commands','financial_effect_intents','financial_events'])expect((await f.db.query('SELECT * FROM '+table)).rows).toEqual([])
})
test('stale attempts become unknown, are never reclaimed and accept only their late matching finish',async()=>{
 const out=await command('manual:a');const claim=await domain<any>(f.db,'claim_effect_intents',['a','i',3,10]);const attempt=claim.claimed[0]
 await f.db.exec("RESET ROLE;UPDATE financial_effect_intents SET claimed_at=clock_timestamp()-interval '11 minutes';SET LOCAL ROLE service_role")
 const sweep=await domain<any>(f.db,'claim_effect_intents',['a','i',3,10]);expect(sweep.claimed).toEqual([]);expect(sweep.unknown_ids).toEqual([attempt.id])
 expect((await domain<any>(f.db,'finish_effect_intent',['a',attempt.id,attempt.attempt_token,'sent',{},null])).was_unknown).toBe(true)
})
test('eager issuance obeys the same legacy route and is idempotent',async()=>{
 const issue=()=>domain<any>(f.db,'issue_invoice_receivables_if_eligible',['a','i']);expect((await issue()).inserted).toBe(true);expect((await issue()).inserted).toBe(false)
 await seedInvoice(f.db,'old');await f.db.exec("RESET ROLE;UPDATE invoice SET status='customer_paid',paid_amount=1 WHERE invoice_id='old';SET LOCAL ROLE service_role")
 expect((await domain<any>(f.db,'issue_invoice_receivables_if_eligible',['a','old'])).route).toBe('legacy')
})
test('clients cannot mutate command/intent tables or execute any C5 RPC',async()=>{
 const rows=(await f.db.query<{name:string;client:boolean;service:boolean}>(`SELECT proname name,
 has_function_privilege('authenticated',oid,'EXECUTE') OR has_function_privilege('anon',oid,'EXECUTE') client,
 has_function_privilege('service_role',oid,'EXECUTE') service FROM pg_proc WHERE proname IN
 ('execute_payment_command','claim_effect_intents','finish_effect_intent','financial_invoice_projection','financial_project_invoice','issue_invoice_receivables_if_eligible')`)).rows
 expect(rows).toHaveLength(6);for(const row of rows){expect(row.client).toBe(false);expect(row.service).toBe(!['financial_invoice_projection','financial_project_invoice'].includes(row.name))}
 for(const role of ['anon','authenticated','service_role'])for(const table of ['financial_payment_commands','financial_effect_intents'])
 expect((await f.db.query<{allowed:boolean}>('SELECT has_table_privilege($1,$2,\'INSERT\') allowed',[role,table])).rows[0].allowed).toBe(false)
})
test('failed effects stop after three attempts; reversal and resettlement never create new intents',async()=>{
 const first=await command('manual:a');const claim=()=>domain<any>(f.db,'claim_effect_intents',['a','i',3,10])
 for(let n=1;n<=3;n++){const i=(await claim()).claimed[0];expect(i.attempts).toBe(n);await domain(f.db,'finish_effect_intent',['a',i.id,i.attempt_token,'failed',{},'failure'])}
 expect((await claim()).claimed).toEqual([])
 const allocation=(await f.db.query<{id:string}>('SELECT id FROM financial_payment_allocations')).rows[0].id
 await domain(f.db,'reverse_payment_allocation',['a',allocation,'correction','system',null]);const second=await command('manual:replacement')
 expect(second.command.effects_suppressed).toEqual(['portal_message']);expect((await command('manual:replacement')).command.effects_suppressed).toEqual(['portal_message'])
 expect((await f.db.query('SELECT id FROM financial_effect_intents')).rows).toHaveLength(1)
})
