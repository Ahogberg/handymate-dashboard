const { PGlite } = require('@electric-sql/pglite')
const fs = require('node:fs'),
  assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto')
const tests = []
const test = (name, run) => tests.push([name, run])
const actor = '10000000-0000-4000-8000-000000000001',
  other = '10000000-0000-4000-8000-000000000002'
let db, accountId, sessionId, token, draftId
async function cmd(
  command,
  input = {},
  request = randomUUID(),
  email = 'a@handymate.se',
  manager = false,
) {
  const r = await db.query(
    'select public.revenue_v2_command($1,$2,$3,$4,$5,$6) as result',
    [
      email === 'a@handymate.se' ? actor : other,
      email,
      manager,
      request,
      command,
      input,
    ],
  )
  return r.rows[0].result
}
async function row() {
  return (
    await db.query('select * from revenue_accounts where id=$1', [accountId])
  ).rows[0]
}
async function count(table) {
  return (await db.query(`select count(*)::integer as n from ${table}`)).rows[0]
    .n
}
test('creates company once and normalizes organization across retries and independent imports', async () => {
  const req = randomUUID(),
    input = { company_name: 'Testfirman', org_number: '556487-1234' }
  const a = await cmd('create', input, req)
  accountId = a.account_id
  assert.equal((await cmd('create', input, req)).account_id, accountId)
  assert.equal(
    (await cmd('create', { ...input, org_number: '5564871234' })).account_id,
    accountId,
  )
  assert.equal(await count('revenue_accounts'), 1)
  await assert.rejects(
    cmd('create', { ...input, company_name: 'Changed' }, req),
    /annat innehåll/,
  )
})
test('seller cannot read/modify another account or replay its command', async () => {
  await assert.rejects(
    cmd('session', { account_id: accountId }, randomUUID(), 'b@handymate.se'),
    /inte tillgängligt/,
  )
  const o = await db.query('select revenue_v2_overview($1,false) as d', [
    'b@handymate.se',
  ])
  assert.equal(o.rows[0].d.total, 0)
})
test('contact is durable and invalid contact rolls back', async () => {
  await cmd('contact', {
    account_id: accountId,
    name: 'Kundkontakt',
    contact_basis: 'inbound',
  })
  await assert.rejects(
    cmd('contact', {
      account_id: accountId,
      name: 'Bad',
      contact_basis: 'invented',
    }),
  )
  assert.equal(await count('revenue_contacts'), 1)
})
test('notes do not become contact, retries make one activity', async () => {
  const req = randomUUID(),
    input = {
      account_id: accountId,
      activity_type: 'note',
      outcome: 'completed',
      summary: 'Förberedelse',
    }
  await cmd('activity', input, req)
  await cmd('activity', input, req)
  assert.equal((await row()).last_contact_at, null)
  assert.equal(await count('revenue_activities'), 1)
})
test('contact never moves backwards and future timestamps roll back', async () => {
  await cmd('activity', {
    account_id: accountId,
    activity_type: 'call',
    outcome: 'connected',
    summary: 'Ringde',
    occurred_at: '2026-09-10T10:00:00Z',
    next_action: 'Följ upp',
    next_action_at: '2026-09-11T10:00:00Z',
    draft_body: 'Tack för samtalet',
  })
  await cmd('activity', {
    account_id: accountId,
    activity_type: 'call',
    outcome: 'completed',
    summary: 'Historisk kontakt',
    occurred_at: '2026-09-01T10:00:00Z',
  })
  assert.equal(
    new Date((await row()).last_contact_at).toISOString(),
    '2026-09-10T10:00:00.000Z',
  )
  const n = await count('revenue_activities')
  await assert.rejects(
    cmd('activity', {
      account_id: accountId,
      activity_type: 'call',
      outcome: 'connected',
      occurred_at: '2099-01-01',
    }),
    /framtiden/,
  )
  assert.equal(await count('revenue_activities'), n)
})
test('starts a durable session with immutable meeting date', async () => {
  const req = randomUUID()
  const s = await cmd('session', { account_id: accountId }, req)
  assert.deepEqual(await cmd('session', { account_id: accountId }, req), s)
  sessionId = s.session_id
  assert.equal(await count('revenue_sessions'), 1)
})
test('publishes one case on retry and creates a followup without changing stage', async () => {
  const req = randomUUID(),
    input = {
      account_id: accountId,
      session_id: sessionId,
      session_version: 0,
      payload: {
        company: { name: 'Testfirman' },
        meeting: { iso: '2099-01-01' },
        goal: { name: 'Få tillbaka tid', quote: '10 timmar' },
      },
      draft_body: 'Se https://example.test/case/{{CASE_TOKEN}}',
    }
  const out = await cmd('case', input, req)
  token = out.token
  assert.deepEqual(await cmd('case', input, req), out)
  assert.equal(await count('sales_case'), 1)
  const data = (await db.query('select payload from sales_case')).rows[0]
  assert.notEqual(data.payload.meeting.iso, '2099-01-01')
  assert.equal((await row()).status, 'identified')
  draftId = (
    await db.query(
      "select id from revenue_followup_drafts where status='draft'",
    )
  ).rows[0].id
})
test('approval is not a send and a reply invalidates approval', async () => {
  const approveId = randomUUID()
  await cmd(
    'draft',
    { account_id: accountId, draft_id: draftId, body: 'Granskat' },
    approveId,
  )
  assert.equal(
    (
      await db.query('select status from revenue_followup_drafts where id=$1', [
        draftId,
      ])
    ).rows[0].status,
    'approved',
  )
  await cmd('activity', {
    account_id: accountId,
    activity_type: 'email',
    outcome: 'replied',
    summary: 'Kunden svarade',
    draft_body: 'Must not be created',
  })
  await assert.rejects(
    cmd('draft', {
      account_id: accountId,
      draft_id: draftId,
      body: 'För gammalt',
    }),
    { code: 'PT409', message: /inte längre aktuellt/ },
  )
  await assert.rejects(
    cmd(
      'draft',
      { account_id: accountId, draft_id: draftId, body: 'Granskat' },
      approveId,
    ),
    { code: 'PT409', message: /inte längre aktuellt/ },
  )
  assert.equal(
    (
      await db.query(
        "select count(*)::integer as n from revenue_followup_drafts where status<>'cancelled'",
      )
    ).rows[0].n,
    0,
  )
})
test('case rejects missing optimistic version and stale save', async () => {
  await assert.rejects(
    cmd('case', {
      account_id: accountId,
      session_id: sessionId,
      payload: {},
      draft_body: 'x',
    }),
    { code: 'PT409', message: /ändrades/ },
  )
  await assert.rejects(
    cmd('case', {
      account_id: accountId,
      session_id: sessionId,
      session_version: 0,
      payload: {},
      draft_body: 'x',
    }),
    { code: 'PT409', message: /ändrades/ },
  )
})
test('account updates conflict rather than lose newer activity', async () => {
  await assert.rejects(
    cmd('next', { account_id: accountId, version: 0, status: 'contacted' }),
    { code: 'PT409', message: /ändrades/ },
  )
})
test('pausing clears next action and removes company from queue', async () => {
  await cmd('activity', {
    account_id: accountId,
    activity_type: 'call',
    outcome: 'pause',
    summary: 'Efter semestern',
    next_action: 'Should clear',
  })
  assert.equal((await row()).next_action, null)
  const q = (
    await db.query("select revenue_v2_overview('a@handymate.se',false) as d")
  ).rows[0].d
  assert.equal(q.queue.length, 0)
})
test('opt out cannot be silently resumed', async () => {
  await cmd('activity', {
    account_id: accountId,
    activity_type: 'call',
    outcome: 'opt_out',
    summary: 'Ingen mer kontakt',
  })
  await assert.rejects(
    cmd('next', {
      account_id: accountId,
      version: (await row()).version,
      status: 'contacted',
      contact_state: 'active',
    }),
    /Kontaktspärren/,
  )
})
test('repeated source imports reuse organization and advertisement', async () => {
  const input = {
    company_name: 'Elbolag',
    org_number: '5560000000',
    source: 'Platsbanken',
    external_id: 'ad-123',
    title: 'Elektriker',
    source_url: 'https://arbetsformedlingen.se/platsbanken/annonser/123',
    observed_at: '2026-09-12T10:00:00Z',
  }
  await cmd('import', input)
  await cmd('import', input)
  assert.equal(await count('revenue_signals'), 1)
})
test('existing Launch Desk suppression blocks imports', async () => {
  await db.query(
    "insert into gtm_suppression(org_number) values ('556111-1111')",
  )
  await assert.rejects(
    cmd('import', { company_name: 'Spärrad', org_number: '5561111111' }),
    /spärrat/,
  )
})
test('queue prioritizes due low-score company beyond 250 high-score rows', async () => {
  await db.exec(
    "insert into revenue_accounts(company_name,owner_email,icp_score,pain_score,timing_score,growth_score,warmth_score,ability_to_pay_score) select 'High '||i,'a@handymate.se',25,20,20,15,10,10 from generate_series(1,300) i; insert into revenue_accounts(company_name,owner_email,next_action,next_action_at) values ('Due low','a@handymate.se','Ring','2000-01-01');",
  )
  const d = (
    await db.query("select revenue_v2_overview('a@handymate.se',false) as d")
  ).rows[0].d
  assert.equal(d.queue[0].company_name, 'Due low')
  assert.equal(d.queue.length, 30)
  assert.equal(d.accounts.length, 50)
  assert(d.total > 300)
})
test('anonymous and authenticated roles cannot invoke commands or read private tables', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`)
    await assert.rejects(
      db.query('select * from revenue_commands'),
      /permission denied/,
    )
    await assert.rejects(
      cmd('session', { account_id: accountId }),
      /permission denied/,
    )
    await db.exec('reset role')
  }
})
async function main() {
  db = new PGlite()
  await db.exec(
    'create role anon; create role authenticated; create role service_role bypassrls; create table gtm_suppression(id uuid default gen_random_uuid(),org_number text,email text,phone text);',
  )
  await db.exec(
    fs
      .readFileSync('sql/revenue_os_v1.sql', 'utf8')
      .replace('create extension if not exists pgcrypto;', ''),
  )
  await db.exec(fs.readFileSync('sql/v231_sales_case.sql', 'utf8'))
  await db.exec(fs.readFileSync('sql/v2_revenue_os.sql', 'utf8'))
  for (const [name, run] of tests) {
    await run()
    console.log('PASS', name)
  }
  await db.close()
  console.log(`${tests.length} SQL scenarios passed`)
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
