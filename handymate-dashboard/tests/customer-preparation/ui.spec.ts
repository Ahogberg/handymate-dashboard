import { test, expect } from '@playwright/test'
test.use({ storageState: { cookies: [], origins: [] }, ...(process.env.HANDYMATE_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.HANDYMATE_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] } } : {}) })
const origin = process.env.PREPARATION_TEST_URL || 'http://localhost:3020'
for (const width of [375, 1280]) {
  test(`customer form, error preservation and success at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    let posts = 0
    await page.route('**/api/preparation/*', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { template: 'charging', context: 'Laddbox vid garaget på Storgatan 12', due_date: '2026-09-10', status: 'open' } })
      posts++
      return posts === 1 ? route.fulfill({ status: 503, json: { error: 'Kunde inte spara. Försök igen.' } }) : route.fulfill({ json: { success: true } })
    })
    await page.goto(`${origin}/preparation/test-customer`)
    await expect(page.getByRole('heading', { name: 'Underlag för laddbox' })).toBeVisible()
    await page.getByLabel('Var vill du placera laddboxen?').fill('Garageväggen')
    await page.getByLabel('Beskriv sträckan från elcentralen').fill('Osäker, behöver undersökas')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/customer-preparation-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Lämna underlag' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Kunde inte spara' })).toContainText('Kunde inte spara')
    await expect(page.getByLabel('Var vill du placera laddboxen?')).toHaveValue('Garageväggen')
    await page.getByRole('button', { name: 'Lämna underlag' }).click()
    await expect(page.getByRole('heading', { name: 'Ditt svar är mottaget' })).toBeVisible()
    expect(posts).toBe(2)
  })
}
