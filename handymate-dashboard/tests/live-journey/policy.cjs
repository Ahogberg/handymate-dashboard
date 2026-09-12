const assert = require('node:assert/strict')
function configuration(env) {
  for (const key of ['LIVE_TEST_BASE_URL', 'LIVE_TEST_COMMIT_SHA', 'LIVE_TEST_BUSINESS_ID', 'LIVE_TEST_EMAIL', 'LIVE_TEST_PASSWORD']) {
    assert(typeof env[key] === 'string' && env[key].trim(), `${key} saknas i GitHub environment live-test`)
  }
  const url = new URL(env.LIVE_TEST_BASE_URL)
  assert(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' && !url.port, 'Testadressen måste vara ett rent HTTPS-origin')
  assert(url.hostname === 'app.handymate.se' || url.hostname.endsWith('.vercel.app'), 'Testadressen måste vara Handymate eller dess Vercel-preview')
  assert(/^[a-f0-9]{40}$/.test(env.LIVE_TEST_COMMIT_SHA), 'Ange hela commit-SHA för den driftsatta versionen')
  assert(/^[a-zA-Z0-9_-]+$/.test(env.LIVE_TEST_BUSINESS_ID), 'Ogiltigt testföretags-ID')
  assert(['true', 'false', undefined, ''].includes(env.LIVE_TEST_CREATE_DRAFT), 'Ogiltigt val för utkast')
  return { origin: url.origin, version: env.LIVE_TEST_COMMIT_SHA.slice(0, 7), businessId: env.LIVE_TEST_BUSINESS_ID, createDraft: env.LIVE_TEST_CREATE_DRAFT === 'true' }
}
function verifyTenant(profile, config) {
  assert.equal(profile?.business?.business_id, config.businessId, 'Fel företag i sessionen')
  assert.equal(profile?.user?.business_id, config.businessId, 'Fel användarmedlemskap')
  assert.equal(profile?.business?.business_name, 'Nordström El AB', 'Sessionen är inte Nordström El')
}
function browserRequestAllowed(url, method, origin) {
  const u = new URL(url)
  // The UI is observed only; draft creation is a separate guarded API action.
  if (!['GET', 'HEAD'].includes(method)) return false
  if (u.origin !== origin) return false // no third-party HTTP from this test
  return !/^\/api\/(cron|debug)(\/|$)/.test(u.pathname)
}
function protectionHeaders(url, origin, secret) {
  assert.equal(new URL(url).origin, origin, 'Previewnyckeln får bara skickas till testversionens origin')
  return secret ? { 'x-vercel-protection-bypass': secret } : {}
}
module.exports = { configuration, verifyTenant, browserRequestAllowed, protectionHeaders }
if (require.main === module) { configuration(process.env); console.log('Testkonfiguration finns; inga hemligheter visas.') }
