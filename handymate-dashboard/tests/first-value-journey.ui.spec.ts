import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'fs'
import { firstValuePreview } from './helpers/first-value-preview'
import { deriveKomIgangTasks } from '../lib/onboarding/kom-igang-tasks'

test.use({ storageState: { cookies: [], origins: [] }, launchOptions: process.env.HANDYMATE_TEST_CHROMIUM ? { executablePath: process.env.HANDYMATE_TEST_CHROMIUM, args: ['--no-sandbox'] } : {} })
const signals = { firstFocus:'mindre_admin', ring_test:false, karin_has_invoice_data:false, has_quote:false, has_mission:false, customer_count:0, segmented_customer_count:0, pwa:false, pending_real_cards:0 }
const payload = { tasks:deriveKomIgangTasks(signals) }
let html: string

test.beforeAll(async () => {
  html = await firstValuePreview()
  mkdirSync('test-results', { recursive:true })
  writeFileSync('test-results/first-value-review.html', html)
})
async function mount(page: Page, respond: (n: number) => { status?:number; body?:any } = () => ({ body:payload })) {
  let reads = 0
  const writes: string[] = [], errors: string[] = []
  page.on('pageerror', error => { errors.push(error.message); console.error('Preview error:', error.message) })
  await page.route('**/*', route => {
    if (route.request().method() !== 'GET') writes.push(route.request().url())
    if (route.request().url() === 'http://first-value.test/') return route.fulfill({ contentType:'text/html', body:html })
    if (route.request().url().endsWith('/api/onboarding/kom-igang')) {
      const result = respond(++reads)
      return route.fulfill({ contentType:'application/json', status:result.status || 200, body:JSON.stringify(result.body || payload) })
    }
    return route.abort()
  })
  await page.goto('http://first-value.test/')
  await page.evaluate(() => { const original = HTMLElement.prototype.scrollIntoView; HTMLElement.prototype.scrollIntoView = function(options) { (window as any).lastScrolledSection = this.dataset.section; original.call(this, options) } })
  return { errors, writes, reads:()=>reads }
}
for (const width of [375,1280]) test(`första uppdraget och offertguide ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height:812 })
  const h = await mount(page)
  await expect(page.getByText('Du valde:', { exact:false })).toContainText('Få in fler jobb')
  await page.getByRole('button', { name:'Förbered mitt första uppdrag' }).click()
  await expect(page.getByRole('textbox', { name:'Fråga till Matte' })).toHaveValue(/verifiera minst en riktig kanal/)
  await page.getByRole('textbox', { name:'Fråga till Matte' }).fill('Mitt eget uppdrag')
  expect(h.writes).toEqual([])
  await page.getByRole('button', { name:'offert', exact:true }).click()
  await page.getByRole('button', { name:'Välj kund', exact:true }).click()
  await expect(page.getByRole('combobox', { name:'Kund' })).toBeFocused()
  await page.getByRole('combobox').selectOption('a')
  await expect(page.getByRole('heading', { name:'Gör underlaget till ditt eget' })).toBeVisible()
  await page.getByRole('button', { name:'Visa rader och priser' }).click()
  await expect(page.locator('output')).toHaveText('inkluderat')
  await page.getByRole('button', { name:'Visa tips inför granskning' }).click()
  await expect(page.locator('output')).toHaveText('prisbild')
  await page.getByRole('button', { name:'Visa reservationer' }).click()
  await expect(page.locator('output')).toHaveText('reservationer')
  await expect.poll(() => page.evaluate(() => (window as any).lastScrolledSection)).toBe('reservationer')
  await page.getByRole('button', { name:'Dölj offertguiden' }).click()
  await expect(page.getByRole('complementary')).toHaveCount(0)
  await page.getByRole('button', { name:'Visa offertguiden' }).click()
  await expect(page.getByRole('complementary')).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path:`test-results/first-value-offert-${width}.png`, fullPage:true })
  await page.getByRole('button', { name:'start', exact:true }).click()
  await page.screenshot({ path:`test-results/first-value-start-${width}.png`, fullPage:true })
  expect(h.errors).toEqual([])
  expect(h.writes).toEqual([])
})
test('blockerad lagring visar fel och lämnar uppdragsvalet kvar', async ({ page }) => {
  await mount(page)
  await page.evaluate(()=>Object.defineProperty(window, 'sessionStorage', { configurable:true, get(){ throw Error('blocked') } }))
  await page.getByRole('button', { name:'Förbered mitt första uppdrag' }).click()
  await expect(page.getByRole('alert')).toContainText('Kunde inte ta med din fråga')
  await expect(page.getByRole('heading', { name:'Vad ska vi ta tag i först?' })).toBeVisible()
  await page.getByRole('button', { name:'Utforska själv' }).click()
  await expect(page.getByRole('heading', { name:'Nästa steg för ditt företag' })).toBeVisible()
})
test('startlista: läsfel, återförsök, fokusuppdatering och företagsbyte', async ({ page }) => {
  const h = await mount(page, n => n === 1 ? { status:503 } : { body:n >= 3 ? { tasks:deriveKomIgangTasks({ ...signals, has_mission:true }) } : payload })
  await page.getByRole('button', { name:'hem', exact:true }).click()
  await expect(page.getByRole('alert')).toContainText('Kunde inte hämta nästa steg')
  await page.getByRole('button', { name:'Försök igen' }).click()
  await page.getByRole('button', { name:/Förbered ditt första uppdrag med Matte/ }).click()
  await expect(page.getByRole('textbox')).toHaveValue(/slippa administration/)
  await page.getByRole('button', { name:'Stäng Matte' }).click()
  await expect(page.getByRole('button', { name:/Förbered ditt första uppdrag med Matte/ })).toHaveCount(0)
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await expect.poll(h.reads).toBe(4)
  await page.evaluate(()=>(window as any).preview.setTenant('firm-b'))
  await expect.poll(h.reads).toBe(5)
  await expect(page.getByRole('textbox')).toHaveCount(0)
  expect(h.errors).toEqual([])
})
