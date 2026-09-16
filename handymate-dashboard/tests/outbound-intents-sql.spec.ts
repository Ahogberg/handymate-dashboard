import { test, expect } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

// Each numbered case is one acceptance item from H3B_OUTBOUND_INTENTS_BRIEF §6.
let db: PGlite
async function rpc(name: string, args: unknown[]) {
  const r = await db.query<{ value: any }>(`SELECT public.${name}(${args.map((_, n) => '$' + (n + 1)).join(',')}) value`, args)
  return r.rows[0].value
}
async function record(key = 'one', business = 'a', autonomy: string | null = null, reason: string | null = null) {
  return rpc('record_outbound_intent', [business, 'sms', 'approval', 'approval-1', key, '+46700000001', 'approved-sms', autonomy, null, reason])
}
async function claim(business = 'a', ids: string[] | null = null) {
  return rpc('claim_outbound_intents', [business, ids, 3, 10, 25])
}
async function row(id: string) {
  return (await db.query<any>('SELECT * FROM outbound_intents WHERE id=$1', [id])).rows[0]
}
async function attempt(autonomy: string | null = null) {
  const r = await record('one', 'a', autonomy)
  return (await claim('a', [r.id])).claimed[0]
}
async function finish(i: any, status = 'sent', business = 'a', token = i.attempt_token) {
  return rpc('finish_outbound_intent', [business, i.id, token, status, 'provider-1', null, 3])
}
async function stale() {
  const i = await attempt()
  await db.exec("UPDATE outbound_intents SET claimed_at=now()-interval '11 minutes'")
  await claim()
  return i
}
async function off() { return rpc('stop_supervised_autonomy', ['a', 'invoice_reminder', 'customer']) }
async function due() { await db.exec("UPDATE outbound_intents SET not_before=now()-interval '1 second'") }
async function resolve(id: string, action = 'delivered', actor = 'verified-admin', reason = 'Kontrollerat hos leverantören') {
  return rpc('resolve_outbound_intent', ['a', id, action, actor, reason, 3])
}
test.beforeEach(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE business_config(business_id text primary key); INSERT INTO business_config VALUES('a'),('b');
    CREATE TABLE pending_approvals(id text primary key,business_id text references business_config,approval_type text,title text,status text default 'pending',payload jsonb default '{}',created_at timestamptz default now(),expires_at timestamptz,resolved_at timestamptz,snoozed_until timestamptz);
    CREATE TABLE v3_automation_logs(id text primary key,business_id text,rule_name text,trigger_type text,action_type text,status text,context jsonb,result jsonb);
    CREATE TABLE v3_automation_settings(id text default gen_random_uuid()::text,business_id text unique,earned_autonomy jsonb default '{}');
  `)
  await db.exec(readFileSync('sql/v248_handoff_inbox_consent.sql', 'utf8'))
  await db.exec(readFileSync('sql/v249_outbound_intents.sql', 'utf8'))
  await db.exec(`INSERT INTO autonomy_controls(business_id,key,granted,mode,source) VALUES('a','invoice_reminder',true,'supervised','customer');
    INSERT INTO v3_automation_settings(business_id,earned_autonomy) VALUES('a','{"booking_reminder":{"status":"autonomous"}}');`)
})
test.afterEach(async () => { await db.close() })

test('01 same dedupe key returns the original promise', async () => {
  const a = await record(); const b = await record(); expect(b.id).toBe(a.id); expect(b.created).toBe(false)
})
test('02 duplicate recording leaves exactly one row', async () => {
  await record(); await record(); expect((await db.query('SELECT * FROM outbound_intents')).rows).toHaveLength(1)
})
test('03 revoked autonomy cannot create a promise', async () => {
  await off(); expect(await record('x', 'a', 'invoice_reminder')).toMatchObject({ blocked: true });
  expect((await db.query('SELECT * FROM outbound_intents')).rows).toHaveLength(0)
})
test('04 preflight defer persists reason and future not_before', async () => {
  const r = await record('x', 'a', null, 'saldo'); const i = await row(r.id)
  expect(i.status).toBe('pending'); expect(i.defer_reason).toBe('saldo'); expect(Date.parse(i.not_before)).toBeGreaterThan(Date.now())
})
test('05 deferred promise cannot be claimed early', async () => {
  await record('x', 'a', null, 'kontrollfel'); expect((await claim()).claimed).toEqual([])
})
test('06 legacy JSON grants work only in absence of control row', async () => {
  expect(await record('x', 'a', 'booking_reminder')).toMatchObject({ created: true })
  await rpc('stop_supervised_autonomy', ['a', 'booking_reminder', 'customer'])
  expect(await record('y', 'a', 'booking_reminder')).toMatchObject({ blocked: true })
})
test('07 claim creates a token and starts attempt one', async () => {
  const i = await attempt(); expect(i.attempt_token).toBeTruthy(); expect(i.attempts).toBe(1); expect((await row(i.id)).status).toBe('attempting')
})
test('08 a second claim cannot dispatch the same attempt', async () => { await attempt(); expect((await claim()).claimed).toEqual([]) })
test('09 stale or missing token cannot finish', async () => {
  const i = await attempt(); await expect(finish(i, 'sent', 'a', 'old')).rejects.toThrow('outbound_attempt_stale')
  await expect(finish(i, 'sent', 'a', '')).rejects.toThrow('outbound_attempt_token_required')
})
test('10 foreign tenant cannot finish a known id', async () => { const i = await attempt(); await expect(finish(i, 'sent', 'b')).rejects.toThrow('outbound_intent_not_found') })
test('11 sent stores the provider reference', async () => { const i = await attempt(); await finish(i); expect(await row(i.id)).toMatchObject({ status: 'sent', provider_ref: 'provider-1' }) })
test('12 finishing the same status is idempotent', async () => { const i = await attempt(); await finish(i); expect(await finish(i)).toMatchObject({ idempotent: true }) })
test('13 a finished attempt cannot change outcome', async () => { const i = await attempt(); await finish(i); await expect(finish(i, 'failed')).rejects.toThrow('outbound_attempt_finished') })
test('14 sent is never claimed again', async () => { const i = await attempt(); await finish(i); expect((await claim()).claimed).toEqual([]) })
test('15 failed gets future backoff', async () => { const i = await attempt(); await finish(i, 'failed'); expect(Date.parse((await row(i.id)).not_before)).toBeGreaterThan(Date.now()) })
test('16 failure backoff blocks early retry', async () => { const i = await attempt(); await finish(i, 'failed'); expect((await claim()).claimed).toEqual([]) })
test('17 after backoff a fresh token starts attempt two', async () => {
  const i = await attempt(); await finish(i, 'failed'); await due(); const next = (await claim()).claimed[0]
  expect(next.attempts).toBe(2); expect(next.attempt_token).not.toBe(i.attempt_token)
})
test('18 third failure is exhausted and listed for a human', async () => {
  let i = await attempt()
  for (let n = 1; n <= 3; n++) { await finish(i, 'failed'); await due(); if (n < 3) i = (await claim()).claimed[0] }
  expect((await claim()).claimed).toEqual([])
  expect(await rpc('list_unresolved_outbound_intents', ['a', 3, 100])).toEqual([expect.objectContaining({ id: i.id, status: 'failed', attempts: 3 })])
})
test('19 a stalled attempt becomes unknown', async () => { const i = await stale(); expect((await row(i.id)).status).toBe('unknown') })
test('20 unknown is never automatically resent', async () => { await stale(); expect((await claim()).claimed).toEqual([]) })
test('21 a late worker cannot finish behind a human', async () => { const i = await stale(); await expect(finish(i)).rejects.toThrow('outbound_attempt_unknown_needs_human') })
test('22 resolution requires both actor and reason', async () => {
  const i = await stale(); await expect(resolve(i.id, 'delivered', '')).rejects.toThrow('requires_actor_and_reason')
  await expect(resolve(i.id, 'delivered', 'admin', '')).rejects.toThrow('requires_actor_and_reason')
})
test('23 human delivery confirmation keeps the reason and actor', async () => {
  const i = await stale(); await resolve(i.id); const r = await row(i.id)
  expect(r.status).toBe('sent'); expect(r.resolution).toEqual([expect.objectContaining({ by: 'verified-admin', reason: 'Kontrollerat hos leverantören', from: 'unknown', to: 'sent' })])
})
test('24 off cancels both pending and failed promises', async () => {
  const i = await attempt('invoice_reminder'); await finish(i, 'failed'); await record('pending', 'a', 'invoice_reminder'); await off()
  expect((await db.query<any>('SELECT status FROM outbound_intents')).rows.map(r => r.status)).toEqual(['skipped', 'skipped'])
})
test('25 off preserves the in-flight status and token', async () => { const i = await attempt('invoice_reminder'); await off(); expect(await row(i.id)).toMatchObject({ status: 'attempting', attempt_token: i.attempt_token }) })
test('26 off persists the revocation and cooldown', async () => {
  await off(); const r = (await db.query<any>("SELECT * FROM autonomy_controls WHERE business_id='a' AND key='invoice_reminder'")).rows[0]
  expect(r.granted).toBe(false); expect(r.source).toBe('customer'); expect(Date.parse(r.cooldown_until)).toBeGreaterThan(Date.now())
})
test('27 in-flight completion records truth and cancellation', async () => { const i = await attempt('invoice_reminder'); await off(); expect(await finish(i)).toMatchObject({ status: 'sent', cancel_requested: true }) })
test('28 no new promise after off', async () => { await attempt('invoice_reminder'); await off(); expect(await record('next', 'a', 'invoice_reminder')).toMatchObject({ blocked: true }) })
test('29 cancelled or revoked unknown promise cannot be retried', async () => {
  const i = await attempt('invoice_reminder'); await off(); await db.exec("UPDATE outbound_intents SET claimed_at=now()-interval '11 minutes'"); await claim()
  await expect(resolve(i.id, 'retry')).rejects.toThrow('autonomy_revoked')
  const p = await record('p'); await rpc('cancel_outbound_intents', ['a', null, 'stop'])
  await expect(resolve(p.id, 'retry')).rejects.toThrow('not_resolvable')
})
test('30 revocation between record and claim skips rather than sends', async () => {
  const p = await record('p', 'a', 'invoice_reminder')
  await db.exec("UPDATE autonomy_controls SET granted=false WHERE business_id='a'")
  const r = await claim(); expect(r.claimed).toEqual([]); expect(r.cancelled_ids).toEqual([p.id])
})
test('31 work list includes tenants without financial kernel state', async () => {
  await record(); await record('other', 'b'); const list = await rpc('list_owed_outbound_intents', [3, 10, 50])
  expect(list.map((r: any) => r.business_id).sort()).toEqual(['a', 'b'])
})
test('32 one business cannot claim another business id', async () => { const p = await record('foreign', 'b'); expect((await claim('a', [p.id])).claimed).toEqual([]); expect((await row(p.id)).attempts).toBe(0) })
test('33 status read returns latest promise for each channel only', async () => {
  const old = await record(); await db.query("UPDATE outbound_intents SET created_at=now()-interval '1 day' WHERE id=$1", [old.id])
  const i = (await claim()).claimed[0]; await finish(i); await record('new')
  await rpc('record_outbound_intent', ['a', 'email', 'approval', 'approval-1', 'email', 'a@example.test', 'approved-email', null, null, null])
  const list = await rpc('read_outbound_status', ['a', 'approval', 'approval-1'])
  expect(list).toHaveLength(2); expect(list.every((r: any) => r.status === 'pending')).toBe(true)
  expect(await rpc('read_outbound_status', ['b', 'approval', 'approval-1'])).toEqual([])
})
for (const [n, role] of [[34, 'anon'], [37, 'authenticated']] as const) {
  test(`${n} ${role} cannot read`, async () => { await db.exec(`SET ROLE ${role}`); await expect(db.query('SELECT * FROM outbound_intents')).rejects.toThrow('permission denied') })
  test(`${n + 1} ${role} cannot produce`, async () => { await db.exec(`SET ROLE ${role}`); await expect(record()).rejects.toThrow('permission denied') })
  test(`${n + 2} ${role} cannot cancel or resolve`, async () => {
    const i = await stale(); await db.exec(`SET ROLE ${role}`)
    await expect(rpc('cancel_outbound_intents', ['a', 'invoice_reminder', 'stop'])).rejects.toThrow('permission denied')
    await expect(resolve(i.id)).rejects.toThrow('permission denied')
  })
}
test('40 service_role cannot insert directly', async () => { await db.exec('SET ROLE service_role'); await expect(db.exec("INSERT INTO outbound_intents(business_id,kind,source,source_id,dedupe_key,recipient,template,status) VALUES('a','sms','manual','1','1','+46700000001','sms','pending')")).rejects.toThrow('permission denied') })
test('41 service_role cannot rewrite outcomes directly', async () => { await record(); await db.exec('SET ROLE service_role'); await expect(db.exec("UPDATE outbound_intents SET status='sent',finished_at=now()")).rejects.toThrow('permission denied') })
test('42 service_role can read and erase its records', async () => { await record(); await db.exec('SET ROLE service_role'); expect((await db.query('SELECT * FROM outbound_intents')).rows).toHaveLength(1); await db.exec("DELETE FROM outbound_intents WHERE business_id='a'"); expect((await db.query('SELECT * FROM outbound_intents')).rows).toHaveLength(0) })
test('43 service_role cannot take the raw lock', async () => { await db.exec('SET ROLE service_role'); await expect(rpc('outbound_lock', ['a'])).rejects.toThrow('permission denied') })

test('44 dedupe identity cannot silently change recipient or template', async () => {
  await record()
  await expect(rpc('record_outbound_intent', ['a', 'sms', 'approval', 'approval-1', 'one', '+46700000002', 'approved-sms', null, null, null])).rejects.toThrow('outbound_dedupe_conflict')
  await expect(rpc('record_outbound_intent', ['a', 'sms', 'approval', 'approval-1', 'one', '+46700000001', 'other-template', null, null, null])).rejects.toThrow('outbound_dedupe_conflict')
})
test('45 failed preflight after claim preserves pending without consuming provider attempts', async () => {
  const i = await attempt()
  await rpc('defer_outbound_intent', ['a', i.id, i.attempt_token, 'saldo'])
  expect(await row(i.id)).toMatchObject({ status: 'pending', attempts: 0, attempt_token: null, finished_at: null, defer_reason: 'saldo' })
  expect((await claim()).claimed).toEqual([])
  await due(); expect((await claim()).claimed[0].attempts).toBe(1)
})
test('46 old worker cannot defer an attempt now owned by another worker', async () => {
  const i = await attempt(); await finish(i, 'failed'); await due(); await claim()
  await expect(rpc('defer_outbound_intent', ['a', i.id, i.attempt_token, 'saldo'])).rejects.toThrow('outbound_attempt_stale')
})
test('47 deferral cannot resurrect off or exhausted failure', async () => {
  const i = await attempt('invoice_reminder'); await off()
  expect(await rpc('defer_outbound_intent', ['a', i.id, i.attempt_token, 'saldo'])).toMatchObject({ status: 'skipped', deferred: false })
  const p = await record('other'); await db.query("UPDATE outbound_intents SET status='failed',attempts=3,finished_at=now() WHERE id=$1", [p.id])
  expect(await rpc('defer_outbound_intent', ['a', p.id, null, 'saldo'])).toMatchObject({ status: 'failed', deferred: false })
  expect((await claim()).claimed).toEqual([])
})
test('48 new defer RPC respects tenants and service-only execution', async () => {
  const p = await record()
  await expect(rpc('defer_outbound_intent', ['b', p.id, null, 'saldo'])).rejects.toThrow('not_found')
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`)
    await expect(rpc('defer_outbound_intent', ['a', p.id, null, 'saldo'])).rejects.toThrow('permission denied')
    await db.exec('RESET ROLE')
  }
})
test('49 replay retains the exact provider reference and cancellation fact without another claim', async () => {
  const i = await attempt('invoice_reminder')
  await off()
  await finish(i)
  expect(await record('one', 'a', 'invoice_reminder')).toMatchObject({
    id: i.id, status: 'sent', created: false, provider_ref: 'provider-1', cancel_requested: true,
  })
  expect((await claim()).claimed).toEqual([])
  expect((await row(i.id)).attempts).toBe(1)
})
async function source(version = 'v1', envelope: any = { message: 'Hej' }, autonomy: string | null = null) {
  return rpc('record_outbound_message', ['a','sms','cron','source-1','source-key','+46700000001','source-template',autonomy,null,version,envelope,null])
}
test('50 durable source and body-free intent are recorded atomically', async () => {
  const result = await source()
  expect(result).toMatchObject({ created: true, source_version: 'v1' })
  expect((await db.query<any>('SELECT envelope FROM outbound_messages')).rows[0].envelope).toEqual({ message: 'Hej' })
  const intent = await row(result.id)
  expect(intent.context).toEqual({ version: 'v1' })
  expect(JSON.stringify(intent)).not.toContain('Hej')
})
test('51 durable source replay is idempotent and changed content is refused', async () => {
  const first = await source(); const replay = await source()
  expect(replay).toMatchObject({ id: first.id, created: false })
  await expect(source('v2', { message: 'Ändrat' })).rejects.toThrow('outbound_dedupe_conflict')
  expect((await db.query('SELECT * FROM outbound_messages')).rows).toHaveLength(1)
})
test('52 revoked autonomy leaves neither source nor promise', async () => {
  await off(); expect(await source('v1', { message: 'Hej' }, 'invoice_reminder')).toMatchObject({ blocked: true })
  expect((await db.query('SELECT * FROM outbound_messages')).rows).toHaveLength(0)
  expect((await db.query('SELECT * FROM outbound_intents')).rows).toHaveLength(0)
})
test('53 source rows have the same service-only read and erase boundary', async () => {
  await source(); await db.exec('SET ROLE authenticated')
  await expect(db.query('SELECT * FROM outbound_messages')).rejects.toThrow('permission denied')
  await expect(source()).rejects.toThrow('permission denied')
  await db.exec('RESET ROLE'); await db.exec('SET ROLE service_role')
  expect((await db.query('SELECT * FROM outbound_messages')).rows).toHaveLength(1)
  await db.exec("DELETE FROM outbound_messages WHERE business_id='a'")
  expect((await db.query('SELECT * FROM outbound_messages')).rows).toHaveLength(0)
})
