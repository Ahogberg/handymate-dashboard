import { test, expect } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
async function fixture() {
  const db = new PGlite()
  await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE business_config(business_id text primary key); INSERT INTO business_config VALUES('a'),('b');
 CREATE TABLE pending_approvals(id text primary key,business_id text not null references business_config,approval_type text not null,title text not null,status text default 'pending',payload jsonb default '{}',created_at timestamptz default now(),expires_at timestamptz,resolved_at timestamptz,snoozed_until timestamptz);
 CREATE TABLE v3_automation_logs(id text primary key,business_id text,rule_name text,trigger_type text,action_type text,status text,context jsonb,result jsonb);
 CREATE TABLE v3_automation_settings(id text default gen_random_uuid()::text,business_id text unique,earned_autonomy jsonb default '{}');
 `)
  await db.exec(readFileSync('sql/v248_handoff_inbox_consent.sql', 'utf8'))
  return db
}
test('notice expiry is impossible; actual mutation remains a decision; per-type expiry and one collected dismissal', async () => {
  const db = await fixture()
  try {
    await db.exec(
      `INSERT INTO pending_approvals(id,business_id,approval_type,title,expires_at) VALUES ('n','a','team_intro','Hej',now()),('d','a','send_sms','Skicka',now()),('c','a','checklist_forslag','Fäst checklista',now()),('o','a','autonomy_offer','Förtroende',now());`,
    )
    expect(
      (
        await db.query<any>(
          `select id,card_kind,round(extract(epoch from expires_at-created_at)/86400) days from pending_approvals order by id`,
        )
      ).rows,
    ).toEqual([
      { id: 'c', card_kind: 'decision', days: '7' },
      { id: 'd', card_kind: 'decision', days: '7' },
      { id: 'n', card_kind: 'notice', days: null },
      { id: 'o', card_kind: 'decision', days: '14' },
    ])
    await db.exec(
      `UPDATE pending_approvals SET status='expired',resolved_at=now(); UPDATE pending_approvals SET status='expired' WHERE id='d';`,
    )
    expect(
      (
        await db.query<any>(
          `select status,expires_at from pending_approvals where id='n'`,
        )
      ).rows[0],
    ).toEqual({ status: 'pending', expires_at: null })
    expect(
      (await db.query<any>(`select count(*)::int n from handoff_items`)).rows[0]
        .n,
    ).toBe(3)
  } finally {
    await db.close()
  }
})
test('consent is one-time and atomic; no grants for no; off survives stale settings and replay; cooldown blocks offer', async () => {
  const db = await fixture()
  try {
    await db.exec(
      `SET ROLE service_role; SELECT answer_autonomy_consent('a','owner',true); SELECT answer_autonomy_consent('a','owner',true); SELECT answer_autonomy_consent('b','owner',false); RESET ROLE;`,
    )
    expect(
      (
        await db.query<any>(
          `select business_id,count(*)::int n from autonomy_controls group by business_id`,
        )
      ).rows,
    ).toEqual([{ business_id: 'a', n: 4 }])
    await db.exec(
      `SELECT stop_supervised_autonomy('a','invoice_reminder'); UPDATE v3_automation_settings SET earned_autonomy=earned_autonomy||'{"invoice_reminder":{"status":"autonomous"}}' WHERE business_id='a'; SELECT answer_autonomy_consent('a','owner',true);`,
    )
    expect(
      (
        await db.query<any>(
          `select earned_autonomy?'invoice_reminder' active from v3_automation_settings where business_id='a'`,
        )
      ).rows[0].active,
    ).toBe(false)
    expect(
      (
        await db.query<any>(
          `select granted,cooldown_until>now() cooling from autonomy_controls where business_id='a' and key='invoice_reminder'`,
        )
      ).rows[0],
    ).toEqual({ granted: false, cooling: true })
    await expect(
      db.exec(`select accept_earned_autonomy_offer('a','invoice_reminder')`),
    ).rejects.toThrow('autonomy_cooldown')
    await db.exec(`SET ROLE authenticated`)
    await expect(
      db.exec(`select answer_autonomy_consent('b','forged',true)`),
    ).rejects.toThrow()
    await expect(db.exec(`select * from autonomy_controls`)).rejects.toThrow()
    await db.exec(`RESET ROLE; SET ROLE service_role`)
    await expect(
      db.exec(
        `insert into handoff_items(business_id,source_key,kind,title)values('b','fake','expired','fake')`,
      ),
    ).rejects.toThrow()
  } finally {
    await db.close()
  }
})
test('digest claims at most three, persists before push, fences finish and never reclaims unknown delivery', async () => {
  const db = await fixture()
  try {
    await db.exec(
      `INSERT INTO pending_approvals(id,business_id,approval_type,title,created_at) SELECT 'd'||n,'a','send_sms','Förslag '||n,now()-(n||' hours')::interval FROM generate_series(1,5)n; UPDATE pending_approvals SET status='expired' where id='d1';`,
    )
    const claim = (await db.query<any>(`select claim_handoff_digest('a') s`))
      .rows[0].s
    expect(claim.decisions.map((x: any) => x.id)).toEqual(['d5', 'd4', 'd3'])
    expect(claim.remaining).toBe(1)
    expect(claim.items).toHaveLength(1)
    expect(
      (await db.query<any>(`select claim_handoff_digest('a') s`)).rows[0].s,
    ).toBeNull()
    expect(
      (
        await db.query<any>(
          `select finish_handoff_digest('b',$1,$2,'delivered') ok`,
          [claim.day, claim.attempt_token],
        )
      ).rows[0].ok,
    ).toBe(false)
    await db.query(`select finish_handoff_digest('a',$1,$2,'unknown')`, [
      claim.day,
      claim.attempt_token,
    ])
    expect(
      (
        await db.query<any>(
          `select payload?'expiry_reported_at' marked from pending_approvals where id='d1'`,
        )
      ).rows[0].marked,
    ).toBe(false)
    expect(
      (await db.query<any>(`select claim_handoff_digest('a') s`)).rows[0].s,
    ).toBeNull()
  } finally {
    await db.close()
  }
})
test('autonomy audit exists before dispatch; revoked key cannot start, tenant cannot finish another audit', async () => {
  const db = await fixture()
  try {
    await db.exec(`select answer_autonomy_consent('a','owner',true)`)
    const id = (
      await db.query<any>(
        `select record_autonomy_attempt('a','booking_reminder','Bokning') id`,
      )
    ).rows[0].id
    expect(
      (
        await db.query<any>(
          `select mode,outcome from handoff_items where id=$1`,
          [id],
        )
      ).rows[0],
    ).toEqual({ mode: 'supervised', outcome: 'unknown' })
    expect(
      (
        await db.query<any>(
          `select finish_autonomy_attempt('b',$1,'success') ok`,
          [id],
        )
      ).rows[0].ok,
    ).toBe(false)
    await db.query(`select finish_autonomy_attempt('a',$1,'success')`, [id])
    await db.exec(`select stop_supervised_autonomy('a','booking_reminder')`)
    expect(
      (
        await db.query<any>(
          `select record_autonomy_attempt('a','booking_reminder','Bokning') id`,
        )
      ).rows[0].id,
    ).toBeNull()
  } finally {
    await db.close()
  }
})

test('direct authenticated writes cannot manufacture grants; ordinary settings updates still work', async () => {
  const db = await fixture()
  try {
    await db.exec(
      `GRANT SELECT,INSERT,UPDATE ON v3_automation_settings TO authenticated; SET ROLE authenticated; INSERT INTO v3_automation_settings(business_id) VALUES('a'); UPDATE v3_automation_settings SET earned_autonomy='{}' WHERE business_id='a';`,
    )
    await expect(
      db.exec(
        `UPDATE v3_automation_settings SET earned_autonomy='{"booking_reminder":{"status":"autonomous"}}' WHERE business_id='a'`,
      ),
    ).rejects.toThrow('autonomy_requires_server_transition')
    await expect(
      db.exec(
        `INSERT INTO v3_automation_settings(business_id,earned_autonomy) VALUES('b','{"booking_reminder":{"status":"autonomous"}}')`,
      ),
    ).rejects.toThrow('autonomy_requires_server_transition')
  } finally {
    await db.close()
  }
})
test('15 actual approvals promote supervised; edited approval breaks streak, automatic sends never count', async () => {
  const db = await fixture()
  try {
    await db.exec(
      `SELECT answer_autonomy_consent('a','owner',true); INSERT INTO pending_approvals(id,business_id,approval_type,title,status,resolved_at,payload) SELECT 'r'||n,'a','review_request','Recension','approved',now()-(n||' hours')::interval,'{}' FROM generate_series(1,14)n;`,
    )
    expect(
      (
        await db.query<any>(
          `select promote_supervised_autonomy('a','review_request') ok`,
        )
      ).rows[0].ok,
    ).toBe(false)
    await db.exec(
      `INSERT INTO pending_approvals(id,business_id,approval_type,title,status,resolved_at,payload) VALUES('r15','a','review_request','Recension','approved',now(),'{"edited":true}');`,
    )
    expect(
      (
        await db.query<any>(
          `select promote_supervised_autonomy('a','review_request') ok`,
        )
      ).rows[0].ok,
    ).toBe(false)
    await db.exec(`UPDATE pending_approvals SET payload='{}' WHERE id='r15';`)
    expect(
      (
        await db.query<any>(
          `select promote_supervised_autonomy('a','review_request') ok`,
        )
      ).rows[0].ok,
    ).toBe(true)
    expect(
      (
        await db.query<any>(
          `select mode from autonomy_controls where business_id='a' and key='review_request'`,
        )
      ).rows[0].mode,
    ).toBe('earned')
    expect(
      (
        await db.query<any>(
          `select count(*)::int n from autonomy_controls where business_id='a' and mode='supervised'`,
        )
      ).rows[0].n,
    ).toBe(3)
  } finally {
    await db.close()
  }
})
test('delivered digest marks expiry once; unknown audit finish is terminal and log is idempotent', async () => {
  const db = await fixture()
  try {
    await db.exec(
      `INSERT INTO pending_approvals(id,business_id,approval_type,title) VALUES('e','a','send_sms','Förslag'); UPDATE pending_approvals SET status='expired' WHERE id='e';`,
    )
    const c = (await db.query<any>(`select claim_handoff_digest('a') s`))
      .rows[0].s
    expect(
      (
        await db.query<any>(
          `select finish_handoff_digest('a',$1,$2,'delivered') ok`,
          [c.day, c.attempt_token],
        )
      ).rows[0].ok,
    ).toBe(true)
    expect(
      (
        await db.query<any>(
          `select payload?'expiry_reported_at' marked from pending_approvals where id='e'`,
        )
      ).rows[0].marked,
    ).toBe(true)
    expect(
      (
        await db.query<any>(
          `select finish_handoff_digest('a',$1,$2,'delivered') ok`,
          [c.day, c.attempt_token],
        )
      ).rows[0].ok,
    ).toBe(false)
    await db.exec(`select answer_autonomy_consent('a','owner',true)`)
    const id = (
      await db.query<any>(
        `select record_autonomy_attempt('a','booking_reminder','Bokning') id`,
      )
    ).rows[0].id
    await db.query(`select finish_autonomy_attempt('a',$1,'unknown',true)`, [
      id,
    ])
    expect(
      (
        await db.query<any>(
          `select finish_autonomy_attempt('a',$1,'success',true) ok`,
          [id],
        )
      ).rows[0].ok,
    ).toBe(false)
    expect(
      (await db.query<any>(`select status,result from v3_automation_logs`))
        .rows,
    ).toEqual([{ status: 'failed', result: { outcome: 'unknown' } }])
  } finally {
    await db.close()
  }
})
test('H1/H2 coexist with the real v241 producers: one dismissal and one acted event', async () => {
  const { valueDatabase, card, events } =
    await import('./helpers/value-events-database')
  const db = await valueDatabase()
  try {
    await db.exec(
      `ALTER TABLE pending_approvals ADD COLUMN snoozed_until timestamptz; CREATE TABLE v3_automation_settings(business_id text unique,earned_autonomy jsonb default '{}');`,
    )
    await db.exec(readFileSync('sql/v248_handoff_inbox_consent.sql', 'utf8'))
    await card(db, 'expire', 'send_sms')
    await db.exec(
      `UPDATE pending_approvals SET status='expired' WHERE id='expire'; UPDATE pending_approvals SET status='expired' WHERE id='expire';`,
    )
    expect(
      (await events(db)).filter(
        (e) => e.event_type === 'opportunity_dismissed',
      ),
    ).toHaveLength(1)
    await db.exec(`select answer_autonomy_consent('a','owner',true)`)
    const id = (
      await db.query<any>(
        `select record_autonomy_attempt('a','booking_reminder','Bokning') id`,
      )
    ).rows[0].id
    await db.query(`select finish_autonomy_attempt('a',$1,'success',true)`, [
      id,
    ])
    await db.query(`select finish_autonomy_attempt('a',$1,'success',true)`, [
      id,
    ])
    expect(
      (await events(db)).filter((e) => e.event_type === 'opportunity_acted'),
    ).toHaveLength(1)
  } finally {
    await db.close()
  }
})
test('late consent preserves prior earned cap and an explicit prior off',async()=>{
 const db=await fixture();try{
 await db.exec(`INSERT INTO v3_automation_settings(business_id,earned_autonomy) VALUES('a','{"invoice_reminder":{"status":"autonomous","cap_kr":9000}}'); SELECT stop_supervised_autonomy('a','review_request'); SELECT answer_autonomy_consent('a','owner',true);`)
 expect((await db.query<any>(`select earned_autonomy->'invoice_reminder' state from v3_automation_settings where business_id='a'`)).rows[0].state).toEqual({status:'autonomous',cap_kr:9000})
 expect((await db.query<any>(`select granted from autonomy_controls where business_id='a' and key='review_request'`)).rows[0].granted).toBe(false)
 expect((await db.query<any>(`select count(*)::int n from autonomy_controls where business_id='a' and granted`)).rows[0].n).toBe(2)
 }finally{await db.close()}
})
