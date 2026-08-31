import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'fs'
import ts from 'typescript'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../tailwind.config'
import type { JobPreparation } from '../lib/job-preparation/types'

// Actual React component/hooks in a completely intercepted browser. No app session,
// production API, real customers, automatic chat turn, or fixture writes.
test.use({ storageState: { cookies: [], origins: [] } })
const preparation: JobPreparation = {
  version: 1, agent: 'lars', observedAt: '2026-08-31T09:00:00Z',
  project: { id: 'proj_a', name: 'Badrumsrenovering — testprojekt', href: '/dashboard/projects/proj_a' },
  booking: { id: 'book_a', start: '2026-09-01T09:00:00Z', end: null, href: '/dashboard/bookings/book_a' },
  customer: { id: 'cust_a', name: 'Testkund' },
  address: { text: 'Arbetsgatan 4', state: 'available', source: 'Projektadress i den signerade offerten. Kontrollera att den gäller detta besök.' },
  sections: [
    { key: 'scope', title: 'Överenskommet arbete', state: 'available', message: '1 post i det lästa underlaget.', truncated: false, items: [{ id: 'item_a', text: 'Montera skåp', source: 'Signerad offert — inte bevis på utfört arbete', href: '/dashboard/projects/proj_a?tab=quote_spec' }] },
    { key: 'changes', title: 'Ändringar och tillägg', state: 'available', message: '1 post i det lästa underlaget.', truncated: false, items: [{ id: 'ata_a', text: 'Väntar på godkännande: Extra uttag', source: 'Projektets ÄTA-register', href: '/dashboard/projects/proj_a?tab=changes' }] },
    { key: 'checklists', title: 'Kontrollpunkter', state: 'available', message: '1 post i det lästa underlaget.', truncated: false, items: [{ id: 'check_a', text: 'Ej avbockat: Kontrollera underlaget', source: 'Projektchecklista', href: '/dashboard/projects/proj_a?tab=checklists' }] },
    { key: 'documents', title: 'Handlingar', state: 'missing', message: 'Inga handlingar hittades på projektet.', items: [], truncated: false },
    { key: 'installations', title: 'Dokumenterade installationer', state: 'unavailable', message: 'Underlaget kunde inte läsas. Försök igen.', items: [], truncated: false },
    { key: 'communication', title: 'Projektkopplad kundkontakt', state: 'restricted', message: 'Kundkommunikation visas bara för ägare/admin här.', items: [], truncated: false },
  ],
}
const transpile = (file: string) => ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText

async function mount(page: Page, respond: (n: number) => { status?: number; body?: any; delay?: number } = () => ({ body: { preparation } })) {
  let reads = 0
  const requests: string[] = []
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/*', async route => {
    const request = route.request()
    requests.push(`${request.method()} ${request.url()}`)
    if (request.url() === 'http://job-preparation.test/') return route.fulfill({ contentType: 'text/html', body: '<html lang="sv"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="root" style="max-width:720px;margin:24px auto;padding:0 12px"></main></body></html>' })
    if (request.url().startsWith('http://job-preparation.test/api/job-preparation?')) {
      const result = respond(++reads)
      if (result.delay) await new Promise(resolve => setTimeout(resolve, result.delay))
      return route.fulfill({ status: result.status || 200, contentType: 'application/json', body: JSON.stringify(result.body || { preparation }) }).catch(() => {})
    }
    return route.abort()
  })
  await page.goto('http://job-preparation.test/')
  const css = await postcss([tailwind({ ...config, content: ['components/projects/JobPreparation.tsx'] })]).process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined })
  await page.addStyleTag({ content: css.css })
  await page.addScriptTag({ content: readFileSync('node_modules/react/umd/react.development.js', 'utf8') })
  await page.addScriptTag({ content: readFileSync('node_modules/react-dom/umd/react-dom.development.js', 'utf8') })
  await page.addScriptTag({ content: `
    const modules = {};
    function load(id, code) { const exports = {}; new Function('require','exports',code)(name => { if (!(name in modules)) throw Error('Unmocked '+name); return modules[name]; }, exports); modules[id] = exports; return exports; }
    modules.react = React;
    modules['next/link'] = p => React.createElement('a', p, p.children);
    modules['lucide-react'] = { ChevronDown: () => React.createElement('span', {'aria-hidden':true}, '⌄'), ChevronUp: () => React.createElement('span', {'aria-hidden':true}, '⌃'), Loader2: () => React.createElement('span', {'aria-hidden':true}, '…') };
    modules['@/components/agents/AgentAvatar'] = { AgentAvatar: () => React.createElement('span', {'aria-label':'Lars', style:{color:'#0f766e', fontWeight:700}}, 'L') };
    load('@/lib/BusinessContext', ${JSON.stringify(transpile('lib/BusinessContext.tsx'))});
    load('@/lib/JobbuddyContext', ${JSON.stringify(transpile('lib/JobbuddyContext.tsx'))});
    load('@/lib/job-preparation/types', ${JSON.stringify(transpile('lib/job-preparation/types.ts'))});
    const component = load('component', ${JSON.stringify(transpile('components/projects/JobPreparation.tsx'))});
    function Host() {
      const [tenant, setTenant] = React.useState('biz_a');
      const [book, setBook] = React.useState('book_a');
      const buddy = modules['@/lib/JobbuddyContext'].useJobbuddy();
      window.switchTenant = () => setTenant('biz_b');
      window.switchBooking = () => setBook('book_b');
      return React.createElement(modules['@/lib/BusinessContext'].BusinessContext.Provider, {value:{ business_id:tenant }},
        React.createElement(component.default, {bookingId:book}),
        buddy.isOpen ? React.createElement('textarea', {'aria-label':'Mattes utkast', readOnly:true, value:buddy.pendingPrompt || ''}) : null);
    }
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(modules['@/lib/JobbuddyContext'].JobbuddyProvider, null, React.createElement(Host)));
  ` })
  return { reads: () => reads, requests, errors }
}

for (const width of [375, 1280]) test(`actual UI ${width}px: sources, missing vs unreadable, no overflow and editable Matte handoff`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 })
  const h = await mount(page)
  expect(h.reads()).toBe(0) // lazy: the day-plan list creates no per-booking background reads
  await page.getByRole('button', { name: /Inför nästa jobb/ }).click()
  await expect(page.getByText('Badrumsrenovering — testprojekt')).toBeVisible()
  await expect(page.getByText('Underlaget kunde inte läsas. Försök igen.')).toBeVisible()
  await page.locator('summary').filter({ hasText: 'Överenskommet arbete' }).click()
  await expect(page.getByText('Montera skåp')).toBeVisible()
  await expect(page.getByRole('link', { name: /Signerad offert/ })).toHaveAttribute('href', '/dashboard/projects/proj_a?tab=quote_spec')
  await page.locator('summary').filter({ hasText: 'Handlingar' }).click()
  await expect(page.getByText('Inga handlingar hittades på projektet.')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/job-preparation-${width}.png`, fullPage: true })
  await page.getByRole('button', { name: 'Fråga Matte' }).click()
  await expect(page.getByRole('textbox', { name: 'Mattes utkast' })).toContainText('project_id: proj_a')
  expect(h.reads()).toBe(1)
  expect(h.requests.every(request => request.startsWith('GET '))).toBe(true)
  expect(h.requests.some(request => request.includes('/api/matte/'))).toBe(false)
  expect(h.errors).toEqual([])
})

test('failed response -> explicit error -> retry with fresh facts', async ({ page }) => {
  const h = await mount(page, n => n === 1 ? { status: 503, body: { error: 'Projektet kunde inte läsas.' } } : { body: { preparation } })
  await page.getByRole('button', { name: /Inför nästa jobb/ }).click()
  await expect(page.getByRole('alert')).toContainText('Projektet kunde inte läsas.')
  await expect(page.getByRole('button', { name: 'Fråga Matte' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Läs in igen' }).click()
  await expect(page.getByText('Badrumsrenovering — testprojekt')).toBeVisible()
  expect(h.reads()).toBe(2)
})

test('tenant and booking switches clear old data; closed request cannot populate another visit', async ({ page }) => {
  const h = await mount(page, n => ({ delay: n === 2 ? 150 : 0, body: { preparation } }))
  const toggle = page.getByRole('button', { name: /Inför nästa jobb/ })
  await toggle.click()
  await expect(page.getByText('Badrumsrenovering — testprojekt')).toBeVisible()
  await page.evaluate(() => (window as any).switchTenant())
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByText('Badrumsrenovering — testprojekt')).toHaveCount(0)
  await toggle.click()
  await expect.poll(h.reads).toBe(2)
  await page.evaluate(() => (window as any).switchBooking())
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByText('Badrumsrenovering — testprojekt')).toHaveCount(0)
  expect(h.errors).toEqual([])
})
