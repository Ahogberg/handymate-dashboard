import { test, expect } from '@playwright/test'
import { planningStartPreview } from './helpers/planning-start-preview'

test.use({ storageState: { cookies: [], origins: [] }, launchOptions: process.env.HANDYMATE_TEST_CHROMIUM ? { executablePath: process.env.HANDYMATE_TEST_CHROMIUM, args: ['--no-sandbox'] } : {} })
let html: string
test.beforeAll(async () => { html = await planningStartPreview() })
for (const width of [375, 1280]) test(`team → kalender, uttrycklig tom vecka och sparfel ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 812 })
  let teamConfirmed = false, fail = false
  const writes: any[] = [], errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/*', route => {
    if (route.request().url() === 'http://planning.test/') return route.fulfill({ contentType: 'text/html', body: html })
    if (route.request().url().endsWith('/api/onboarding/planning-start')) {
      if (route.request().method() === 'POST') {
        writes.push(route.request().postDataJSON())
        if (fail) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Kunde inte spara' }) })
        teamConfirmed = true
        return route.fulfill({ contentType: 'application/json', body: '{"saved":true}' })
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ memberCount:1, teamConfirmed, calendarStarted:false, weekStart:'2026-09-21', weekEnd:'2026-09-27', jobCount:0, unresolvedCount:0, revision:'r1' }) })
    }
    return route.abort()
  })
  await page.goto('http://planning.test/')
  await expect(page.getByRole('button', { name: 'Jag jobbar själv' })).toBeVisible()
  await page.screenshot({ path:`test-results/planning-team-${width}.png`, fullPage:true })
  await page.getByRole('button', { name: 'Jag jobbar själv' }).click()
  await expect(page.getByRole('status')).toContainText('Teamet är bekräftat')
  expect(writes).toHaveLength(1)
  expect(writes[0].action).toBe('solo')
  await page.evaluate(() => (window as any).preview.setStep('calendar'))
  await expect(page.getByRole('button', { name: /Visa veckan/ })).toBeVisible()
  expect(writes).toHaveLength(1)
  await page.getByRole('button', { name: /Visa veckan/ }).click()
  await expect(page.getByRole('button', { name: /Jag har inga kända jobb/ })).toBeVisible()
  await page.screenshot({ path:`test-results/planning-calendar-${width}.png`, fullPage:true })
  fail = true
  await page.getByRole('button', { name: /Jag har inga kända jobb/ }).click()
  await expect(page.getByRole('alert')).toHaveText('Kunde inte spara')
  await expect(page.getByRole('status')).toHaveCount(0)
  fail = false
  await page.getByRole('button', { name: /Jag har inga kända jobb/ }).click()
  await expect(page.getByRole('status')).toContainText('Du har bekräftat')
  expect(writes[2]).toEqual({ action:'calendar', revision:'r1', weekStart:'2026-09-21' })
  await page.evaluate(() => (window as any).preview.setTenant('firm-b'))
  await expect(page.getByRole('status')).toHaveCount(0)
  await page.evaluate(() => (window as any).preview.setOwner(false))
  await expect(page.getByRole('region', { name:'Kom igång med planeringen' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
