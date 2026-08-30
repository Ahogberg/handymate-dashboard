const baseUrl = (process.argv.find((arg) => arg.startsWith('--base-url='))?.split('=')[1]
  || 'https://app.handymate.se').replace(/\/$/, '')

const probes = [
  { key: 'health', path: '/api/health', allowed: [200], requiresFreshTimestamp: true },
  { key: 'invalid_quote_token', path: '/api/quotes/public/__launch_probe_invalid__', allowed: [400, 404] },
  { key: 'invalid_portal_token', path: '/api/portal/__launch_probe_invalid__', allowed: [400, 401, 404] },
  { key: 'invalid_jobbpass_token', path: '/api/jobbpass/public/__launch_probe_invalid__', allowed: [400, 401, 404] },
  { key: 'cron_without_secret', path: '/api/cron/check-overdue', allowed: [401] },
]

let failed = false

for (const probe of probes) {
  const url = `${baseUrl}${probe.path}`
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Handymate-Launch-Smoke/1.0' },
      cache: 'no-store',
      redirect: 'manual',
    })

    let detail = `HTTP ${response.status}`
    let ok = probe.allowed.includes(response.status)

    if (ok && probe.requiresFreshTimestamp) {
      const body = await response.json().catch(() => null)
      const timestampMs = Date.parse(body?.timestamp || '')
      const ageMs = Date.now() - timestampMs
      const fresh = Number.isFinite(timestampMs) && ageMs >= 0 && ageMs < 5 * 60 * 1000
      ok = fresh && body?.status === 'healthy'
      detail += fresh
        ? ` · healthy · ${Math.round(ageMs / 1000)} s gammal`
        : ' · health-responsen är äldre än 5 minuter eller saknar giltig timestamp'
    }

    console.log(`${ok ? 'PASS' : 'FAIL'} ${probe.key}: ${detail}`)
    if (!ok) failed = true
  } catch (error) {
    failed = true
    console.log(`FAIL ${probe.key}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (failed) {
  console.error('\nPublikt lanseringsrökprov: FAIL')
  process.exit(1)
}

console.log('\nPublikt lanseringsrökprov: PASS')
