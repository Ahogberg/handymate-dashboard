const { harness, load } = require('./harness.cjs'),
  assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto')
async function main() {
  const h = await harness()
  let checks = 0
  const post = (body) =>
    h.request('POST', 'https://revenue.test/api/admin/revenue', {
      request_id: randomUUID(),
      ...body,
    })
  h.setAllowed(false)
  assert.equal(
    (await post({ type: 'create', company_name: 'Denied' })).status,
    403,
  )
  assert.equal(
    (await h.request('GET', 'https://revenue.test/api/admin/revenue')).status,
    403,
  )
  h.setAllowed(true)
  checks += 2
  let r = await post({
    type: 'create',
    company_name: 'Test El',
    org_number: '556487-1234',
  })
  assert.equal(r.status, 200)
  const a = (await r.json()).account_id
  checks++
  r = await post({
    type: 'contact',
    account_id: a,
    name: 'Kund',
    contact_basis: 'public_business_contact',
  })
  assert.equal(r.status, 400)
  checks++
  r = await post({
    type: 'contact',
    account_id: a,
    name: 'Kund',
    email: 'kund@example.test',
    contact_basis: 'inbound',
  })
  assert.equal(r.status, 200)
  checks++
  const req = randomUUID(),
    activity = {
      type: 'activity',
      account_id: a,
      activity_type: 'call',
      outcome: 'connected',
      summary: 'Offerterna fastnar',
      next_action: 'Boka genomgång',
      next_action_at: new Date().toISOString(),
      make_draft: true,
      request_id: req,
    }
  assert.equal((await post(activity)).status, 200)
  assert.equal((await post(activity)).status, 200)
  assert.equal(
    (await h.db.query('select count(*)::int n from revenue_activities')).rows[0]
      .n,
    1,
  )
  checks++
  r = await post({ type: 'session', account_id: a })
  const ses = (await r.json()).session_id
  const caseBody = {
    type: 'case',
    account_id: a,
    session_id: ses,
    session_version: 0,
    pain: 'offers',
    quote: 'Vi missar uppföljning',
    goal: 'Fler följda offerter',
    request_id: randomUUID(),
  }
  r = await post(caseBody)
  assert.equal(r.status, 200)
  const token = (await r.json()).token
  assert.equal((await post(caseBody)).status, 200)
  checks += 2
  const detail = await (
    await h.request(
      'GET',
      `https://revenue.test/api/admin/revenue?account_id=${a}`,
    )
  ).json()
  assert.equal(detail.contacts.length, 1)
  assert.equal(detail.activities.length, 1)
  assert.equal(detail.sessions[0].case_token, token)
  assert.equal(detail.sessions[0].payload.focusTitle, 'Vinn fler offerter')
  checks++
  const pub = load('app/api/sales-case/[token]/route.ts', {
    '@/lib/supabase': {
      getServerSupabase: () => ({
        ...h.adapter,
        from: (table) => {
          const q = h.adapter.from(table)
          q.is = () => q
          return q
        },
      }),
    },
  })
  const response = await pub.GET(
    new Request(`https://revenue.test/api/sales-case/${token}`),
    { params: { token } },
  )
  assert.equal(response.status, 200)
  const prefill = await response.json()
  assert.equal(prefill.prefill.companyName, 'Test El')
  assert.equal(prefill.extras.mal, 'Fler följda offerter')
  assert(!('account_id' in prefill))
  checks++
  r = await post({ type: 'import_source', term: 'elektriker' })
  assert.equal(r.status, 200)
  let overview = await (
    await h.request('GET', 'https://revenue.test/api/admin/revenue')
  ).json()
  assert(
    overview.accounts.some(
      (a) =>
        a.company_name === 'Elkällan AB' &&
        a.why_now.includes('Elektriker sökes'),
    ),
  )
  checks++
  h.ctx.manager = false
  h.ctx.email = 'other@handymate.se'
  assert.equal(
    (
      await h.request(
        'GET',
        `https://revenue.test/api/admin/revenue?account_id=${a}`,
      )
    ).status,
    404,
  )
  assert.equal((await post({ type: 'session', account_id: a })).status, 404)
  checks += 2
  console.log(
    `${checks} real handler + PostgreSQL + existing onboarding prefill checks passed`,
  )
  await h.db.close()
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
