/**
 * Renderprov för Daniels agentrad (app/dashboard/quotes/[id]/components/
 * DanielAgentrad.tsx) — den riktiga komponenten i en helt avlyssnad
 * webbläsare: ingen appsession, inget produktions-API, inga skrivningar.
 * Mönster: tests/job-preparation.ui.spec.ts.
 *
 * Skärmdumpar (hopfälld + utfälld, 1280 och 375 px) hamnar i
 * $AGENTRAD_SHOT_DIR (standard test-results/).
 *
 *   npx playwright test tests/daniel-agentrad.ui.spec.ts --no-deps --project=chromium
 */
import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import ts from 'typescript'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../tailwind.config'

test.use({ storageState: { cookies: [], origins: [] }, ...(process.env.HANDYMATE_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.HANDYMATE_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] } } : {}) })

const SHOT_DIR = process.env.AGENTRAD_SHOT_DIR || 'test-results'

const intelligence = {
  status: 'ready',
  show_warning: true,
  reason: null,
  analysis: {
    matched_by: 'job_type',
    match_label: 'badrum',
    similar_jobs: 7,
    financial_jobs: 5,
    quoted_hours: 16,
    avg_hours_diff_pct: 56,
    recommended_hours: 25,
    suggested_buffer_hours: 9,
    avg_realized_margin_pct: null,
    confidence: 'gott',
    message: 'Liknande jobb har i snitt tagit 56 % mer tid än offererat.',
  },
  agentrad: {
    over_count: 7,
    sample_count: 7,
    examples: [
      { project_id: 'p1', name: 'Badrum Ekvägen 4', closed_at: '2026-08-21T10:00:00Z', quoted_hours: 16, actual_hours: 27, delta_hours: 11 },
      { project_id: 'p2', name: 'Gästtoalett Björkstigen 2', closed_at: '2026-07-03T10:00:00Z', quoted_hours: 12, actual_hours: 19, delta_hours: 7 },
      { project_id: 'p3', name: 'Badrum Lindvägen 18', closed_at: '2026-05-12T10:00:00Z', quoted_hours: 18, actual_hours: 26, delta_hours: 8 },
    ],
    lesson: { project_id: 'p1', lesson_text: 'Rivning i äldre badrum tar en dag extra — golvbrunnen behöver nästan alltid bytas.', created_at: '2026-08-22T09:00:00Z' },
  },
}

const transpile = (file: string) => ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText

async function mount(page: Page, opts: { quoteStatus?: string; stored?: string | null } = {}) {
  const requests: Array<{ method: string; url: string; body: any }> = []
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/*', async route => {
    const request = route.request()
    if (request.url() === 'http://agentrad.test/') {
      return route.fulfill({ contentType: 'text/html', body: '<html lang="sv"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="background:#f8fafc"><main id="root" style="max-width:1200px;margin:24px auto;padding:0 12px"></main></body></html>' })
    }
    if (request.url().startsWith('http://agentrad.test/api/')) {
      requests.push({ method: request.method(), url: request.url(), body: request.postDataJSON?.() ?? null })
      if (request.url().startsWith('http://agentrad.test/api/quotes/intelligence/decision')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(intelligence) })
    }
    return route.abort()
  })
  await page.goto('http://agentrad.test/')
  if (opts.stored !== undefined) {
    await page.evaluate(v => { if (v == null) localStorage.removeItem('hm_daniel_rad_q1'); else localStorage.setItem('hm_daniel_rad_q1', v) }, opts.stored)
  }
  const css = await postcss([tailwind({ ...config, content: ['app/dashboard/quotes/[id]/components/DanielAgentrad.tsx'] })]).process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined })
  await page.addStyleTag({ content: css.css })
  await page.addScriptTag({ content: readFileSync('node_modules/react/umd/react.development.js', 'utf8') })
  await page.addScriptTag({ content: readFileSync('node_modules/react-dom/umd/react-dom.development.js', 'utf8') })
  await page.addScriptTag({ content: `
    const modules = {};
    function load(id, code) { const exports = {}; new Function('require','exports',code)(name => { if (!(name in modules)) throw Error('Unmocked '+name); return modules[name]; }, exports); modules[id] = exports; return exports; }
    modules.react = React;
    window.pushed = [];
    modules['next/navigation'] = { useRouter: () => ({ push: href => window.pushed.push(href) }) };
    modules['lucide-react'] = { X: () => React.createElement('span', {'aria-hidden':true}, '×') };
    modules['@/components/agents/AgentAvatar'] = { AgentAvatar: () => React.createElement('span', {'aria-label':'Daniel', style:{width:36,height:36,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'#fff',fontWeight:700,fontSize:12,background:'#d97706'}}, 'D') };
    load('@/lib/daniel-agentrad', ${JSON.stringify(transpile('lib/daniel-agentrad.ts'))});
    const component = load('component', ${JSON.stringify(transpile('app/dashboard/quotes/[id]/components/DanielAgentrad.tsx'))});
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(component.DanielAgentrad, { quoteId: 'q1', quoteStatus: ${JSON.stringify(opts.quoteStatus ?? 'draft')} }));
  `})
  return { requests, errors }
}

for (const width of [1280, 375]) {
  test(`raden renderas hopfälld och utfälld utan horisontell överflöd vid ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const h = await mount(page)
    const row = page.getByRole('region', { name: 'Daniels agentrad' })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Daniel')
    await expect(row).toContainText('Lärdom från 7 liknande jobb: 7 av 7 tog mer tid än offererat, i snitt +9 h. Den här offerten räknar med 16 h.')
    await expect(row).toContainText('Från debriefen')
    await expect(row.getByRole('button', { name: 'Visa varför' })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Snooza' })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Avfärda' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: path.join(SHOT_DIR, `agentrad-collapsed-${width}.png`), fullPage: true })

    await row.getByRole('button', { name: 'Visa varför' }).click()
    await expect(row.getByRole('button', { name: 'Dölj' })).toBeVisible()
    await expect(row).toContainText('Så kom Daniel fram till det')
    await expect(row).toContainText('Projekt · avslutat augusti 2026')
    await expect(row).toContainText('Badrum Ekvägen 4')
    await expect(row).toContainText('+11 h')
    await expect(row).toContainText('Debrief · 22 aug 2026')
    await expect(row.getByRole('button', { name: 'Lägg till 9 h' })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Behåll 16 h' })).toBeVisible()
    await expect(row).toContainText('Ditt val lär Daniel hur du vill räkna.')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: path.join(SHOT_DIR, `agentrad-expanded-${width}.png`), fullPage: true })

    // Exakt en hämtning av intelligensen — inte en per rendering.
    expect(h.requests.filter(r => r.url.includes('/api/quotes/intelligence?')).length).toBe(1)
    expect(h.errors).toEqual([])
  })
}

test('"Behåll 16 h" skriver beslutet och fäller ihop; "Lägg till 9 h" går till redigeraren med ?buffert=9', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const h = await mount(page)
  const row = page.getByRole('region', { name: 'Daniels agentrad' })
  await row.getByRole('button', { name: 'Visa varför' }).click()
  await row.getByRole('button', { name: 'Behåll 16 h' }).click()
  await expect(row.getByRole('button', { name: 'Visa varför' })).toBeVisible()
  await expect(row).not.toContainText('Så kom Daniel fram till det')
  await expect.poll(() => h.requests.filter(r => r.url.endsWith('/api/quotes/intelligence/decision')).length).toBe(1)
  expect(h.requests.find(r => r.url.endsWith('/api/quotes/intelligence/decision'))?.body).toEqual({ quoteId: 'q1', choice: 'behall', suggested_hours: 9, quoted_hours: 16 })

  await row.getByRole('button', { name: 'Visa varför' }).click()
  await expect(row).toContainText('Du behåller 16 h.')

  // Ny montering för "Lägg till": ingen rad ändras här — bara en navigation.
  const h2 = await mount(page)
  const row2 = page.getByRole('region', { name: 'Daniels agentrad' })
  await row2.getByRole('button', { name: 'Visa varför' }).click()
  await row2.getByRole('button', { name: 'Lägg till 9 h' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).pushed)).toEqual(['/dashboard/quotes/q1/edit?buffert=9'])
  await expect.poll(() => h2.requests.filter(r => r.url.endsWith('/api/quotes/intelligence/decision')).length).toBe(1)
  expect(h2.requests.find(r => r.url.endsWith('/api/quotes/intelligence/decision'))?.body).toMatchObject({ choice: 'lagg_till' })
  expect(h.errors.concat(h2.errors)).toEqual([])
})

test('Snooza gömmer raden i 24 h per offert och webbläsare; Avfärda gömmer den för gott', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await mount(page, { stored: null })
  const row = page.getByRole('region', { name: 'Daniels agentrad' })
  await row.getByRole('button', { name: 'Snooza' }).click()
  await expect(row).toHaveCount(0)
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('hm_daniel_rad_q1') || 'null'))
  expect(stored.until).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000)

  // Snoozad ⇒ ingen hämtning alls vid nästa montering.
  const h = await mount(page)
  await expect(page.getByRole('region', { name: 'Daniels agentrad' })).toHaveCount(0)
  expect(h.requests).toEqual([])

  const h2 = await mount(page, { stored: null })
  await page.getByRole('region', { name: 'Daniels agentrad' }).getByRole('button', { name: 'Avfärda' }).click()
  await expect(page.getByRole('region', { name: 'Daniels agentrad' })).toHaveCount(0)
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('hm_daniel_rad_q1') || 'null'))).toEqual({ dismissed: true })
  expect(h2.errors).toEqual([])
})

test('en skickad offert får ingen rad — och ingen hämtning', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const h = await mount(page, { quoteStatus: 'sent', stored: null })
  await page.waitForTimeout(300)
  await expect(page.getByRole('region', { name: 'Daniels agentrad' })).toHaveCount(0)
  expect(h.requests).toEqual([])
  expect(h.errors).toEqual([])
})
