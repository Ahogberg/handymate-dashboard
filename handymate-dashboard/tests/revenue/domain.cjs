const assert = require('node:assert/strict')
const { load } = require('../sprint/onboarding-completion.cjs')
async function main() {
  const recruitment = await load('lib/launch-desk/rekryteringssignal.ts', {})
  const domain = await load('lib/revenue/domain.ts', {
    '@/lib/launch-desk/rekryteringssignal': recruitment,
  })
  const auth = await load('lib/revenue/auth.ts', {
    'next/headers': {},
    '@supabase/auth-helpers-nextjs': {},
    '@/lib/admin-auth': {},
    '@/lib/auth': {},
  })
  assert.equal(auth.revenueRole({ email: 'x@handymate.se' }, ''), null)
  assert.equal(
    auth.revenueRole(
      {
        email: 'x@example.com',
        email_confirmed_at: '2026-01-01',
        user_metadata: { revenue_role: 'manager' },
      },
      '',
    ),
    null,
  )
  assert.equal(
    auth.revenueRole(
      {
        email: 'x@handymate.se',
        email_confirmed_at: '2026-01-01',
        app_metadata: { revenue_role: 'seller' },
      },
      '',
    ),
    'seller',
  )
  assert.equal(
    auth.revenueRole(
      {
        email: 'x@handymate.se',
        email_confirmed_at: '2026-01-01',
        app_metadata: { revenue_role: 'disabled' },
      },
      '',
    ),
    null,
  )
  assert.equal(
    auth.revenueRole(
      { email: 'x@handymate.se', email_confirmed_at: '2026-01-01' },
      '',
    ),
    'manager',
  )
  assert.equal(domain.normalizeOrg('165564871234'), '5564871234')
  assert.throws(() => domain.normalizeOrg('abc'))
  const now = Date.parse('2026-09-13T12:00:00Z'),
    signal = {
      title: 'Söker elektriker',
      signal_type: 'hiring',
      source_url: 'https://arbetsformedlingen.se/x',
      observed_at: '2026-09-12T12:00:00Z',
    }
  assert.equal(domain.makeBrief('Firman', [signal], now).timing_score, 15)
  assert.equal(
    domain.makeBrief('Firman', [{ ...signal, observed_at: '2025-01-01' }], now)
      .timing_score,
    0,
  )
  assert.equal(
    domain.makeBrief('Firman', [{ ...signal, source_url: null }], now)
      .timing_score,
    0,
  )
  assert.equal(
    domain.makeBrief('Firman', [{ ...signal, observed_at: '2099-01-01' }], now)
      .timing_score,
    0,
  )
  const payload = domain.casePayload(
    { company_name: 'Firman', org_number: '5564871234', city: 'Göteborg' },
    { pain: 'offers', quote: 'Offerter faller mellan stolarna' },
    '2026-09-04',
  )
  assert.equal(payload.meeting.iso, '2026-09-04')
  assert.equal(payload.focusTitle, 'Vinn fler offerter')
  assert.equal(payload.roi, undefined)
  const parser = await load('lib/launch-desk/platsbanken-kalla.ts', {
    './rekryteringssignal': recruitment,
  })
  const source = await load('lib/revenue/source.ts', {
    '@/lib/launch-desk/platsbanken-kalla': parser,
    '@/lib/launch-desk/rekryteringssignal': recruitment,
  })
  await assert.rejects(
    source.fetchCandidates(
      'elektriker',
      async () => new Response('{}', { status: 503 }),
    ),
    /503/,
  )
  await assert.rejects(
    source.fetchCandidates('elektriker', async () =>
      Response.json({ hits: 'invalid' }),
    ),
    /oväntat/,
  )
  const hits = [
    {
      id: '1',
      webpage_url: 'https://arbetsformedlingen.se/platsbanken/annonser/1',
      publication_date: '2026-09-12',
      employer: { name: 'El AB', organization_number: '5564871234' },
      application_contacts: [{ email: 'private@example.com' }],
    },
    {
      id: '2',
      webpage_url: 'javascript:bad',
      publication_date: '2026-09-12',
      employer: { name: 'Bad', organization_number: '5560000000' },
    },
  ]
  const result = await source.fetchCandidates(
    'elektriker',
    async () => Response.json({ hits }),
    new Date(now),
  )
  assert.equal(result.length, 1)
  assert.equal(result[0].external_id, '1')
  assert(!JSON.stringify(result).includes('private@example.com'))
  console.log(
    'PASS roles, organization normalization, source freshness, case date, pain-specific content, provider errors and personal-contact exclusion',
  )
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
