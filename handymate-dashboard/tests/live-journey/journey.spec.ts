import { test, expect, type APIResponse } from '@playwright/test'
const { configuration, verifyTenant, browserRequestAllowed, protectionHeaders } = require('./policy.cjs')

// No service-role key, no persisted session, no provider send or decision endpoint.
// This proves app authentication/session, API draft persistence and UI reopening;
// it does not prove keyboard-based login or quote creation through the editor.
test('Nordström El: session → navigering → valt utkast → återöppning', async ({ page, context }, info) => {
  const cfg = configuration(process.env)
  const headersFor = (url: string): Record<string, string> => protectionHeaders(url, cfg.origin, process.env.VERCEL_AUTOMATION_BYPASS_SECRET)
  const json = async (response: APIResponse, label: string) => {
    expect(response.ok(), `${label}: HTTP ${response.status()}`).toBe(true)
    return response.json()
  }
  const request = async (path: string, options: Parameters<typeof context.request.fetch>[1] = {}) => {
    try {
      return await context.request.fetch(cfg.origin + path, { ...options, maxRedirects: 0, headers: headersFor(cfg.origin + path) })
    } catch {
      // Playwright transport errors may include request headers. Never publish
      // those errors in HTML artifacts, where CI log masking does not apply.
      throw new Error('Testversionens API-anrop misslyckades; transportdetaljer utelämnas för att skydda inloggningsuppgifter.')
    }
  }
  const get = (path: string) => request(path)
  const health = await json(await get('/api/health'), 'Testversionens hälsa')
  expect(health.version, 'Fel driftsatt kodversion; inga inloggningsuppgifter skickas').toBe(cfg.version)

  const auth = await json(await request('/api/auth', {
    method: 'POST',
    data: { action: 'login', data: { email: process.env.LIVE_TEST_EMAIL, password: process.env.LIVE_TEST_PASSWORD } },
  }), 'Inloggning')
  expect(auth.success).toBe(true)
  expect(auth.businessId, 'Inloggningen valde fel företag').toBe(cfg.businessId)
  const checkTenant = async () => verifyTenant(await json(await get('/api/me'), 'Sessionskontroll'), cfg)
  await checkTenant()

  const blocked = new Set<string>()
  await context.route('**/*', async route => {
    const r = route.request()
    if (browserRequestAllowed(r.url(), r.method(), cfg.origin)) {
      // Never forward the automation credential through an HTTP redirect.
      // A redirect is fulfilled as-is; its destination must pass this guard again.
      try {
        const response = await route.fetch({ maxRedirects: 0, headers: { ...r.headers(), ...headersFor(r.url()) } })
        return await route.fulfill({ response })
      } catch {
        return route.abort('failed') // do not expose transport headers in artifacts
      }
    }
    const u = new URL(r.url())
    if (u.origin === cfg.origin && !['GET', 'HEAD'].includes(r.method())) blocked.add(`${r.method()} ${u.pathname}`)
    return route.abort('blockedbyclient')
  })
  const readScreen = async (path: string, label: string) => {
    const response = await page.goto(cfg.origin + path, { waitUntil: 'domcontentloaded' })
    expect(response?.ok(), `${label}: sidan svarar`).toBe(true)
    await expect(page).toHaveURL(cfg.origin + path)
    await expect(page.locator('main')).toBeVisible()
    await checkTenant()
  }
  // Existing onboarding is never reset or finalized. A redirect to onboarding
  // is a real unmet prerequisite, not something this probe bypasses.
  await readScreen('/dashboard', 'Hem')
  await readScreen('/dashboard/quotes', 'Offerter')
  await expect(page.getByRole('heading', { name: 'Offerter', exact: true })).toBeVisible()
  await json(await get('/api/job-types/quote-setup'), 'Jobbtyper och offertstandarder')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await checkTenant()
  await expect(page).toHaveURL(cfg.origin + '/dashboard/quotes')

  const quoteList = await json(await get('/api/quotes'), 'Offertlistans data')
  expect(Array.isArray(quoteList.quotes)).toBe(true)
  await expect(page.getByRole('heading', { name: 'Offerter', exact: true })).toBeVisible()
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 })
    await page.screenshot({ path: info.outputPath(`offertlista-${width}.png`), fullPage: true })
  }
  let quoteId: string | null = null
  if (cfg.createDraft) {
    await checkTenant()
    const runId = process.env.GITHUB_RUN_ID
    expect(runId, 'Utkast kräver spårbar GitHub-körning').toMatch(/^\d+$/)
    const title = `LIVETEST Nordström El ${runId}`
    const listed = await json(await get('/api/quotes?search=' + encodeURIComponent(title)), 'Återförsökskontroll')
    expect(Array.isArray(listed.quotes)).toBe(true)
    const matches = listed.quotes.filter((q: any) => q.title === title)
    expect(matches.length, 'Flera utkast för samma körning kräver granskning').toBeLessThanOrEqual(1)
    let quote = matches[0]
    if (!quote) {
      // Exactly one request. A timeout must be investigated/reconciled on rerun,
      // never followed by an automatic second POST.
      const result = await json(await request('/api/quotes', {
        method: 'POST',
        data: { title, description: 'Syntetiskt testutkast. Ingen kund, affär eller leverans.', status: 'draft', customer_id: null,
          vat_rate: 25, quote_items: [{ item_type: 'item', description: 'TEST — arbetstid', quantity: 2, unit: 'tim', unit_price: 100,
            labor_amount: 200, material_amount: 0, is_rot_eligible: false, is_rut_eligible: false }] },
      }), 'Spara testutkast')
      quote = result.quote
    }
    expect(quote?.quote_id).toMatch(/^[a-zA-Z0-9_-]+$/)
    quoteId = quote.quote_id
    const verifyDraft = async () => {
      const { quote: saved } = await json(await get('/api/quotes?quoteId=' + quoteId), 'Läs sparat testutkast')
      expect(saved.business_id).toBe(cfg.businessId)
      expect(saved.title).toBe(title)
      expect(saved.status).toBe('draft')
      expect(saved.customer_id).toBeNull()
      expect(saved.quote_items).toHaveLength(1)
      expect(saved.quote_items[0].description).toBe('TEST — arbetstid')
      expect(Number(saved.quote_items[0].quantity)).toBe(2)
      expect(Number(saved.quote_items[0].unit_price)).toBe(100)
      expect(Number(saved.total)).toBe(250)
    }
    await verifyDraft()
    await readScreen('/dashboard/quotes/' + quoteId, 'Sparat offertutkast')
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible()
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(page.getByText(title, { exact: true }).first()).toBeVisible()
      await page.screenshot({ path: info.outputPath(`testutkast-${width}.png`), fullPage: true })
    }
    await page.reload({ waitUntil: 'domcontentloaded' })
    await checkTenant()
    await verifyDraft()
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible()
  }
  await info.attach('bevis', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
    origin: cfg.origin, observedVersion: health.version, runnerCommit: process.env.GITHUB_SHA,
    businessId: cfg.businessId, draftRequested: cfg.createDraft, quoteId,
    blockedBrowserWrites: Array.from(blocked), limitation: 'Inga externa leveranskvitton; UI-skrivningar blockeras. Utkast skapas via appens API och återöppnas i UI.',
  }, null, 2)) })
})
