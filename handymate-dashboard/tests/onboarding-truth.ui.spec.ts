import { test, expect } from '@playwright/test'
import { readFileSync, mkdirSync } from 'fs'
import ts from 'typescript'

test.use({ storageState: { cookies: [], origins: [] }, launchOptions: process.env.HANDYMATE_TEST_CHROMIUM ? { executablePath: process.env.HANDYMATE_TEST_CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {} })

function preview() {
  const src = readFileSync('app/onboarding/components/StepGenomgang.tsx', 'utf8')
  const code = ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS } }).outputText
  const safe = (s: string) => s.replace(/<\/script/gi, '<\\/script')
  // Riktig klientkomponent, isolerad dataradbyggare och avatar. StrictMode
  // provar även effektens setup/cleanup. Nätverket fångas av Playwright.
  const boot = `const exports={}; const mods={react:React,'lucide-react':{ArrowRight:()=>null,Check:()=>null},'./OnboardingHeader':{default:()=>null},'../constants':{OB_DOTS:{genomgang:5},OB_DOT_TOTAL:9},'@/components/agents/AgentAvatar':{AgentAvatar:()=>null},'@/lib/onboarding/company-scan-rows':{buildScanRows:d=>d.rows,teamGorNarDuAktiverar:()=>null,KALLA_LABEL:{importerat:'Importerat'}}};new Function('require','exports',${JSON.stringify(code)})(x=>mods[x],exports);window.saved=[];ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(exports.default,{onNext:()=>{},onBack:()=>{},data:{},setData:fn=>window.saved.push(fn({}))})));`
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${readFileSync('app/onboarding/onboarding.css','utf8')}body{margin:0}*{box-sizing:border-box}.ob-screen{max-width:480px;margin:auto}</style></head><body><div id="root"></div><script>${safe(readFileSync('node_modules/react/umd/react.development.js','utf8'))}</script><script>${safe(readFileSync('node_modules/react-dom/umd/react-dom.development.js','utf8'))}</script><script>${safe(boot)}</script></body></html>`
}

for (const width of [375, 1280]) test(`genomgång: läsfel följt av verkliga rader ${width}px`, async ({ page }) => {
  let recover = false
  const writes: string[] = []
  await page.setViewportSize({ width, height: 812 })
  await page.route('**/*', route => {
    if (route.request().method() !== 'GET') writes.push(route.request().method())
    if (route.request().url() === 'http://start.test/') return route.fulfill({ contentType:'text/html', body:preview() })
    if (route.request().url().endsWith('/api/onboarding/company-scan')) return route.fulfill({ status:recover?200:503, contentType:'application/json', body:JSON.stringify({ rows:[{key:'kunder',text:'2 kunder hittade',kalla:'importerat'}] }) })
    return route.abort()
  })
  await page.goto('http://start.test/')
  await expect(page.getByRole('alert')).toContainText('Vi kunde inte hämta dina uppgifter just nu')
  await expect(page.getByText('Inget att gå igenom än')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).saved)).toEqual([])
  mkdirSync('test-results', { recursive:true })
  await page.screenshot({path:`test-results/genomgang-error-${width}.png`,fullPage:true})
  recover = true
  await page.getByRole('button',{name:'Försök igen'}).click()
  await expect(page.getByText('2 kunder hittade')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).saved.at(-1).genomgang[0].text)).toBe('2 kunder hittade')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(writes).toEqual([])
})

test('genomgång: lyckad tom läsning är fortsatt ett ärligt tomläge', async ({ page }) => {
  await page.route('**/*', r => r.request().url() === 'http://start.test/' ? r.fulfill({contentType:'text/html',body:preview()}) : r.fulfill({contentType:'application/json',body:'{"rows":[]}'}))
  await page.goto('http://start.test/')
  await expect(page.getByText('Inget att gå igenom än')).toBeVisible()
  await expect(page.getByRole('button',{name:'Försök igen'})).toHaveCount(0)
})

test('genomgång: timeout blir fel och kan försöka igen', async ({ page }) => {
  await page.clock.install()
  let recover = false
  await page.route('**/*', async r => {
    if (r.request().url() === 'http://start.test/') return r.fulfill({contentType:'text/html',body:preview()})
    if (recover) return r.fulfill({contentType:'application/json',body:'{"rows":[]}'})
    // Låt anropet vänta tills klientens femsekundersgräns avbryter det.
  })
  await page.goto('http://start.test/')
  await page.clock.runFor(5100)
  await expect(page.getByRole('alert')).toContainText('Vi kunde inte hämta dina uppgifter just nu')
  recover = true
  await page.getByRole('button',{name:'Försök igen'}).click()
  await expect(page.getByText('Inget att gå igenom än')).toBeVisible()
})
