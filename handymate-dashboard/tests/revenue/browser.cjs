const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict'),
  postcss = require('postcss'),
  tailwind = require('tailwindcss'),
  { chromium } = require('playwright')
const { harness, load } = require('./harness.cjs')
function bundle(entry) {
  const modules = {}
  function add(file) {
    file = path.normalize(file)
    if (modules[file]) return file
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
    }).outputText
    const deps = {}
    modules[file] = { code, deps }
    for (const match of code.matchAll(/require\(["']([^"']+)["']\)/g)) {
      const name = match[1]
      if (['react', 'next/navigation', 'next/link'].includes(name)) {
        deps[name] = name
        continue
      }
      const base = name.startsWith('@/')
        ? name.slice(2)
        : path.join(path.dirname(file), name)
      const resolved = [base, base + '.ts', base + '.tsx'].find(
        (f) => fs.existsSync(f) && fs.statSync(f).isFile(),
      )
      if (!resolved) throw Error(name)
      deps[name] = add(resolved)
    }
    return file
  }
  return { entry: add(entry), modules }
}
async function main() {
  const h = await harness()
  const executablePath =
    process.env.HANDYMATE_CHROMIUM_PATH ||
    (await require('@sparticuz/chromium').default.executablePath())
  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    headless: true,
  })
  let success = false
  try {
    const config = load('tailwind.config.ts').default
    const css = (
      await postcss([
        tailwind({
          ...config,
          content: [
            'app/admin/revenue/**/*.tsx',
            'components/revenue/*.tsx',
            'app/case/**/*.tsx',
          ],
        }),
      ]).process('@tailwind base;@tailwind components;@tailwind utilities;', {
        from: undefined,
      })
    ).css
    const context = await browser.newContext({
        viewport: { width: 1280, height: 1000 },
      }),
      page = await context.newPage(),
      errors = []
    page.setDefaultTimeout(15000)
    page.on('pageerror', (e) => {
      errors.push(e.message)
      console.error('PAGE ERROR', e.message)
    })
    await page.route('**/*', async (route) => {
      const req = route.request(),
        url = new URL(req.url())
      if (url.pathname === '/api/admin/revenue') {
        const r = await h.request(
          req.method(),
          req.url(),
          req.postData() ? JSON.parse(req.postData()) : undefined,
        )
        return route.fulfill({
          status: r.status,
          contentType: 'application/json',
          body: await r.text(),
        })
      }
      if (url.pathname.startsWith('/case/')) {
        const token = url.pathname.split('/')[2]
        const React = require('react'),
          { renderToStaticMarkup } = require('react-dom/server')
        const component = load('app/case/[token]/page.tsx', {
          '@/lib/supabase': { getServerSupabase: () => h.adapter },
          'next/link': ({ href, children, ...props }) =>
            React.createElement('a', { href, ...props }, children),
          'next/navigation': {
            notFound: () => {
              throw Error('not found')
            },
          },
        }).default
        global.React = React
        const result = await component({ params: { token } })
        return route.fulfill({
          contentType: 'text/html',
          body: `<html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${renderToStaticMarkup(result)}</body></html>`,
        })
      }
      if (url.pathname.startsWith('/admin/revenue')) {
        const isSession = url.pathname.includes('/session/'),
          b = bundle(
            isSession
              ? 'app/admin/revenue/session/[id]/page.tsx'
              : 'app/admin/revenue/page.tsx',
          )
        const code = `const b=${JSON.stringify(b)},cache={react:{exports:React},'next/link':{exports:({href,children,...p})=>React.createElement('a',{href,...p},children)},'next/navigation':{exports:{useRouter:()=>({push:url=>location.href=url}),useSearchParams:()=>new URLSearchParams(location.search)}}};function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;new Function('require','module','exports',b.modules[id].code)(n=>load(b.modules[id].deps[n]),m,m.exports);return m.exports}ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(load(b.entry).default,{params:{id:location.pathname.split('/').pop()}}));`
        return route.fulfill({
          contentType: 'text/html',
          body: `<html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${fs.readFileSync('node_modules/react/umd/react.development.js')}</script><script>${fs.readFileSync('node_modules/react-dom/umd/react-dom.development.js')}</script><script>${code.replace(/<\/script/gi, '<\\/script')}</script></body></html>`,
        })
      }
      return route.fulfill({ status: 404, body: 'Not found' })
    })
    console.log('STEP create')
    await page.goto('https://revenue.test/admin/revenue')
    await page.getByRole('button', { name: 'Lägg till företag' }).click()
    await page.getByLabel('Företagsnamn', { exact: true }).fill('Browser El AB')
    await page
      .getByLabel('Organisationsnummer', { exact: true })
      .fill('556487-1234')
    await page.getByRole('button', { name: 'Spara företag' }).click()
    await page.getByRole('heading', { name: 'Browser El AB' }).waitFor()
    console.log('STEP first contact')
    await page.getByLabel('Budskap att pröva', { exact: true }).selectOption('offers')
    await page.getByLabel('Nästa steg i mejlet', { exact: true }).selectOption('audit')
    await page.getByRole('button', { name: 'Förbered första mejlet' }).click()
    await page.getByText('Utkast att granska', { exact: true }).waitFor()
    assert((await page.getByLabel('Mejltext', { exact: true }).inputValue()).includes('20 minuters'))
    fs.mkdirSync('test-results/revenue', { recursive: true })
    await page.getByRole('heading', { name: 'Första kontakten' }).scrollIntoViewIfNeeded()
    await page.screenshot({path:'test-results/revenue/outreach-desktop.png'})
    await page.setViewportSize({width:375,height:900})
    await page.getByRole('heading', { name: 'Första kontakten' }).scrollIntoViewIfNeeded()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({path:'test-results/revenue/outreach-mobile.png'})
    await page.setViewportSize({width:1280,height:1000})
    await page.reload()
    await page.getByRole('button', { name: /Browser El AB/ }).first().click()
    await page.getByText('Utkast att granska', { exact: true }).waitFor()
    console.log('STEP contact')
    await page.getByText('Lägg till kontaktperson', { exact: true }).click()
    await page.getByLabel('Namn', { exact: true }).fill('Kundkontakt')
    await page
      .getByLabel('E-post', { exact: true })
      .fill('kontakt@example.test')
    await page.getByRole('button', { name: 'Spara kontakt' }).click()
    await page.getByText('kontakt@example.test', { exact: true }).waitFor()
    console.log('STEP activity')
    await page
      .getByLabel('Sammanfattning', { exact: true })
      .fill('Vi behöver följa upp offerterna bättre.')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Logga och planera' }).click()
    await page
      .getByText('Vi behöver följa upp offerterna bättre.', { exact: true })
      .waitFor()
    console.log('STEP session')
    await page.getByRole('button', { name: 'Starta säljgenomgång' }).click()
    await page.waitForURL('**/session/**')
    await page.getByRole('radio', { name: 'Vinn fler offerter' }).check()
    await page
      .getByLabel('Kundens egna ord', { exact: true })
      .fill('Vi tappar kontakten efter offerten.')
    await page
      .getByLabel('Ert mål med Handymate', { exact: true })
      .fill('Följa upp alla relevanta offerter')
    await page
      .getByRole('button', {
        name: 'Spara personligt case och förbered uppföljning',
      })
      .click()
    await page
      .getByRole('heading', { name: 'Genomgången finns sparad' })
      .waitFor()
    const url = await page
      .getByRole('link', { name: 'Öppna det personliga caset' })
      .getAttribute('href')
    await page.reload()
    await page
      .getByRole('link', { name: 'Öppna det personliga caset' })
      .waitFor()
    assert.equal(
      await page.getByLabel('Kundens egna ord', { exact: true }).inputValue(),
      'Vi tappar kontakten efter offerten.',
    )
    await page.goto('https://revenue.test' + url)
    await page
      .getByRole('heading', { name: 'Följa upp alla relevanta offerter' })
      .waitFor()
    assert(
      (
        await page
          .getByRole('link', { name: 'Kom igång med Handymate →' })
          .getAttribute('href')
      ).startsWith('/onboarding?case='),
    )
    fs.mkdirSync('test-results/revenue', { recursive: true })
    await page.screenshot({
      path: 'test-results/revenue/case-desktop.png',
      fullPage: true,
    })
    await page.goto('https://revenue.test/admin/revenue')
    await page
      .getByRole('button', { name: /Browser El AB/ })
      .first()
      .click()
    await page.getByRole('heading', { name: 'Mejlutkast' }).waitFor()
    await page.getByRole('button', { name: 'Godkänn och kopiera' }).click()
    await page
      .getByText('Godkänt utkast · inte skickat', { exact: true })
      .waitFor()
    await page.getByLabel('Utfall', { exact: true }).selectOption('replied')
    await page
      .getByLabel('Sammanfattning', { exact: true })
      .fill('Kunden svarade, vi tar nästa steg tillsammans.')
    await page.getByRole('button', { name: 'Logga och planera' }).click()
    await page.getByText('Inga aktuella utkast.', { exact: true }).waitFor()
    await page.setViewportSize({ width: 375, height: 900 })
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    )
    await page.screenshot({
      path: 'test-results/revenue/account-mobile.png',
      fullPage: true,
    })
    await page.getByRole('button', { name: 'Stäng företag' }).click()
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    )
    await page.screenshot({
      path: 'test-results/revenue/queue-mobile.png',
      fullPage: true,
    })
    await page.getByRole('button', { name: 'Hitta företag' }).click()
    await page
      .getByRole('button', { name: 'Hämta och förbered företag' })
      .click()
    await page
      .getByRole('status')
      .filter({ hasText: 'företag behandlade' })
      .waitFor()
    await page
      .getByRole('button', { name: /Elkällan AB/ })
      .first()
      .waitFor()
    assert.deepEqual(errors, [])
    console.log(
      'PASS real UI + handlers + PostgreSQL: create, contact, activity, session, case, reload, onboarding link, approval, reply invalidation, source import, 375/1280px',
    )
    success = true
  } finally {
    await browser.close()
    await h.db.close()
    if (!success) console.error('Browser journey did not complete')
  }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
