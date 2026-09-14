/** C5 prevention tests: real migration and current projection, including stale attempt acknowledgements. */
import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'
import { receivablesDatabase, seedInvoice, domain } from './helpers/financial-receivables-database'

let fixture: Awaited<ReturnType<typeof receivablesDatabase>>
type Outcome = { command_id: string; state: string; recorded_minor?: string; settled_now?: string[];
  receivables?: { component: string; status: string; outstanding_minor: string }[];
  intents: { id: string }[]; replayed: boolean }
test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  fixture = await receivablesDatabase()

})
test.afterAll(async () => { await fixture?.db.close() })
test.beforeEach(async () => { await fixture.db.exec('BEGIN'); await seedInvoice(fixture.db, 'rot', '12500', 'a', 'rot', '9500') })
test.afterEach(async () => { await fixture.db.exec('ROLLBACK; RESET ROLE') })
function command(key: string, amount: string | null = null, observation: unknown = null) {
  return domain<{command:Outcome;projection:Record<string,unknown>}>(fixture.db, 'execute_payment_command', ['a', key, 'rot', 'status_patch', null, amount,
    '2026-09-14T12:00:00Z', 'manual', null, 'manual', observation, '100', ['portal_message'], 'manual', 'test', 'user', 'test'])
}


test('old command replay never downgrades the latest invoice projection', async () => {
 const a=await command('status_patch:customer');await command('status_patch:tax');const replay=await command('status_patch:customer');
 expect(replay.command.replayed).toBe(true);expect(replay.command.settled_now).toEqual(['customer']);expect(replay.projection.recorded_minor).toBe('1250000');expect(replay.projection.derived_status).toBe('paid');expect(replay.projection.written).toBe(false);
 await fixture.db.exec('RESET ROLE');expect((await fixture.db.query('SELECT status,paid_amount::text FROM invoice WHERE invoice_id=\'rot\'')).rows[0]).toEqual({status:'paid',paid_amount:'12500.00'});
})
test('no-new-money has complete current projection and owed intents',async()=>{
 await command('status_patch:customer');const out=await command('status_patch:observation',null,{paid_minor:'950000'});
 expect(out.command.state).toBe('no_new_money');expect(out.projection.recorded_minor).toBe('950000');expect(out.projection.intents_owed).toBe(1);expect(out.projection.receivables).toHaveLength(2);
})
test('old finish token cannot finish or unlock a newer attempt',async()=>{
 const out=await command('status_patch:customer');const id=out.command.intents[0].id;
 const claim=()=>domain<{claimed:{attempt_token:string;attempts:number}[]}>(fixture.db,'claim_effect_intents',['a','rot',3,10]);
 const first=(await claim()).claimed[0];const finish=(token:string,status='failed')=>domain(fixture.db,'finish_effect_intent',['a',id,token,status,{},null]);
 await finish(first.attempt_token);const second=(await claim()).claimed[0];expect(second.attempts).toBe(2);
 await fixture.db.exec('SAVEPOINT stale');await expect(finish(first.attempt_token)).rejects.toThrow('financial_effect_attempt_stale');await fixture.db.exec('ROLLBACK TO SAVEPOINT stale');
 expect((await claim()).claimed).toEqual([]);await finish(second.attempt_token,'sent');expect((await claim()).claimed).toEqual([]);
})
