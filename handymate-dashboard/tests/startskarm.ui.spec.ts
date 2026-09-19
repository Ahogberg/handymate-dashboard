import { mkdirSync } from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'
import { startskarmPreview } from './helpers/startskarm-preview'

/**
 * UI-bevis för startskärmen i 375 px — ytan Andreas klickprovade och tyckte
 * såg konstig ut. Renderar QuickIntake med den RIKTIGA jobbtypsremsan inuti
 * och Nordström El AB:s läge efter backfillen, så bilden visar det han möter.
 */
test.use({
  storageState: { cookies: [], origins: [] },
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] } }
    : {}),
})

const UT = path.resolve(__dirname, '..', 'docs', 'ui')

for (const [vald, fil] of [[null, 'startskarm-375'], ['byta_elcentral', 'startskarm-375-vald-jobbtyp']] as const) {
  test(`startskärmen i 375 px — ${fil}`, async ({ page }) => {
    mkdirSync(UT, { recursive: true })
    const html = await startskarmPreview(vald)
    await page.setViewportSize({ width: 375, height: 900 })
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: html }))
    await page.goto('http://localhost/')
    await page.waitForSelector('text=Berätta om jobbet')
    await page.waitForSelector('text=Byta elcentral')

    // Remsan ligger INUTI ytan, inte bakom dess fixed-lager — kravet som
    // briefen kallar "jobbtypsstarten renderas inuti ytan".
    await expect(page.getByText('Jobbtyp')).toBeVisible()
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth, 'startskärmen skenar i sidled i 375 px').toBeLessThanOrEqual(clientWidth)

    await page.screenshot({ path: path.join(UT, `${fil}.png`), fullPage: true })
  })
}
