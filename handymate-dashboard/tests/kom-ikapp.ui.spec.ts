import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { komIkappPreview } from './helpers/kom-ikapp-preview'

/**
 * UI-bevis: kom-ikapp-ytan i 375 px. Rutten byggdes först utan yta och svaret
 * på "hur kör jag den?" var webbläsarens konsol — värdelöst på en telefon.
 * Det här provet ser till att ytan finns, går att trycka på med handskar och
 * inte skenar i sidled.
 */
const UT = path.resolve(__dirname, '..', 'docs', 'ui')

// Samma mönster som intake-flow.ui.spec.ts: burkens chromium pekas ut via
// miljövariabel, så provet kan köras både här och i CI.
test.use({
  storageState: { cookies: [], origins: [] },
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] } }
    : {}),
})

test.describe('kom ikapp i 375 px', () => {
  test.beforeAll(() => fs.mkdirSync(UT, { recursive: true }))

  test('läget visas, knapparna når 44 px och ingenting skenar i sidled', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 })
    const html = await komIkappPreview()
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: html }))
    await page.goto('http://localhost/')
    await page.waitForSelector('text=Kom ikapp')

    // "Kör skarpt" är släckt tills läget visats — se sidans huvudkommentar.
    const skarpt = page.getByRole('button', { name: /Kör skarpt/ })
    await expect(skarpt).toBeDisabled()

    await page.getByRole('button', { name: /Visa läget/ }).click()
    await page.waitForSelector('text=Läget nu')
    await expect(skarpt).toBeEnabled()
    await expect(page.getByText('Elexperten Stockholm AB')).toBeVisible()
    await expect(page.getByText(/Uttag och strömbrytare/)).toBeVisible()

    for (const namn of [/Visa läget/, /Kör skarpt/]) {
      const box = await page.getByRole('button', { name: namn }).boundingBox()
      expect(box!.height, `${namn} är under 44 px`).toBeGreaterThanOrEqual(44)
    }
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth, 'sidan skenar i sidled i 375 px').toBeLessThanOrEqual(clientWidth)

    await page.screenshot({ path: path.join(UT, 'kom-ikapp-375.png'), fullPage: true })
  })
})
