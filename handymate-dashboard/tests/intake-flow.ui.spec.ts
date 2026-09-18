import { mkdirSync } from 'fs'
import { test, expect } from '@playwright/test'
import { intakeFlowPreview } from './helpers/intake-flow-preview'

/**
 * UI-bevis för frågeflödet (2026-09-18). Renderar den riktiga komponenten i
 * 375 px och sparar en bild, så ytan går att TITTA på — inte bara påstås vara
 * grön. Byggd för att Vercels preview-bygge ligger nere och klickprovet
 * annars inte går att göra alls.
 *
 * Det som måste synas, och som är hela skillnaden mot enhetsmatchningen vi
 * rev: under varje fråga står vilka RADER svaret ändrar. Två frågor har samma
 * enhet (m²) men olika betydelse — golv och vägg — och den som svarar ska
 * aldrig behöva gissa vart talet tar vägen.
 */
test.use({
  storageState: { cookies: [], origins: [] },
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? {
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
      }
    : {}),
})

for (const [lage, filnamn] of [
  ['start', 'fragefloedet-375-tomt'],
  ['ifyllt', 'fragefloedet-375-ifyllt'],
] as const) {
  test(`frågeflödet i 375 px — ${lage}`, async ({ page }) => {
    test.setTimeout(90000)
    const html = await intakeFlowPreview(lage)
    const errors: string[] = []
    page.on('pageerror', e => {
      errors.push(e.message)
      console.error('UI runtime:', e.message)
    })
    await page.setViewportSize({ width: 375, height: 900 })
    await page.route('**/*', route =>
      route.request().url().endsWith('/')
        ? route.fulfill({ contentType: 'text/html', body: html })
        : route.fulfill({ status: 204, body: '' })
    )
    await page.goto('http://localhost/')
    await page.waitForSelector('text=Renovera badrum', { timeout: 20000 })

    // Alla fyra frågorna står på EN skärm — så som rivningen bestämde: på
    // telefon är det snabbare att scrolla än att bläddra.
    // .first(): varje fråga står två gånger i DOM:en, en gång som dold
    // <legend> för skärmläsare och en gång som synlig etikett. Utan den blir
    // det en strict mode-krock, inte ett underkänt påstående om ytan.
    for (const fraga of [
      'Hur många kvadratmeter golv?',
      'Hur många kvadratmeter vägg?',
      'Ska golvvärme ingå?',
      'Något mer vi bör veta?',
    ]) {
      await expect(page.getByText(fraga).first()).toBeVisible()
    }

    // Bindningen syns för användaren, och det är hela poängen: golvfrågan
    // pekar på golvraderna, väggfrågan på kakel vägg — trots att båda har
    // enheten m². Vore det enhetsmatchning igen skulle golvytan hamna på
    // allihop, och texten under frågorna skulle vara identisk.
    const sida = (await page.textContent('body')) ?? ''
    expect(sida).toContain('Sätter: Klinker golv, Tätskikt')
    expect(sida).toContain('Sätter: Kakel vägg')
    expect(sida).toContain('Kryssar: Golvvärme')
    if (lage === 'ifyllt') expect(sida).toContain('3 av 4 besvarade')

    // Ingen horisontell scroll i 375 px.
    const bredd = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      klient: document.documentElement.clientWidth,
    }))
    expect(bredd.scroll, 'sidan ska inte scrolla i sidled i 375 px').toBeLessThanOrEqual(
      bredd.klient + 1
    )

    mkdirSync('docs/ui', { recursive: true })
    await page.screenshot({ path: `docs/ui/${filnamn}.png`, fullPage: true })
    expect(errors, 'inga körtidsfel i ytan').toEqual([])
  })
}
