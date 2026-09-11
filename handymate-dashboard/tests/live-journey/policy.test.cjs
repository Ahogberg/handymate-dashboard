const { test } = require('node:test')
const assert = require('node:assert/strict')
const { configuration, verifyTenant, browserRequestAllowed } = require('./policy.cjs')
const env = { LIVE_TEST_BASE_URL: 'https://handymate-test.vercel.app', LIVE_TEST_COMMIT_SHA: 'a'.repeat(40), LIVE_TEST_BUSINESS_ID: 'test-business', LIVE_TEST_EMAIL: 'fixture@example.invalid', LIVE_TEST_PASSWORD: 'fixture-only' }
test('read-only is default; draft requires explicit true', () => {
  assert.equal(configuration(env).createDraft, false)
  assert.equal(configuration({ ...env, LIVE_TEST_CREATE_DRAFT: 'true' }).createDraft, true)
  assert.throws(() => configuration({ ...env, LIVE_TEST_CREATE_DRAFT: 'yes' }))
})
for (const key of Object.keys(env)) test(`missing ${key} stops before login`, () => assert.throws(() => configuration({ ...env, [key]: '' })))
for (const url of ['http://app.handymate.se', 'https://user:pass@app.handymate.se', 'https://app.handymate.se/other', 'https://app.handymate.se?token=x', 'https://app.handymate.se#x', 'https://app.handymate.se:444', 'https://evil.invalid', 'https://app.handymate.se.evil.invalid']) test(`unsafe target rejected: ${url}`, () => assert.throws(() => configuration({ ...env, LIVE_TEST_BASE_URL: url })))
test('version must be explicit full SHA', () => assert.throws(() => configuration({ ...env, LIVE_TEST_COMMIT_SHA: 'main' })))
const profile = { business: { business_id: 'test-business', business_name: 'Nordström El AB' }, user: { business_id: 'test-business' } }
test('matching tenant passes; wrong business, membership or name fails closed', () => {
  const cfg = configuration(env)
  verifyTenant(profile, cfg)
  for (const changed of [null, { ...profile, user: { business_id: 'other' } }, { ...profile, business: { ...profile.business, business_id: 'other' } }, { ...profile, business: { ...profile.business, business_name: 'Other' } }]) assert.throws(() => verifyTenant(changed, cfg))
})
test('browser may read same origin but cannot send, approve, pay, run cron or contact third party', () => {
  const origin = configuration(env).origin
  assert.equal(browserRequestAllowed(origin + '/dashboard/quotes', 'GET', origin), true)
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(browserRequestAllowed(origin + '/api/quotes', method, origin), false)
  for (const url of [origin + '/api/cron/anything', origin + '/api/debug/sms', 'https://external.invalid/api/auth']) assert.equal(browserRequestAllowed(url, 'GET', origin), false)
})
