import { test, expect } from '@playwright/test'

test.describe('Offert-flöde', () => {
  test('Ny offert-sida laddar formulär', async ({ page }) => {
    await page.goto('/dashboard/quotes/new', { waitUntil: 'networkidle' })
    expect(page.url()).not.toContain('/login')
    const body = await page.textContent('body')
    expect(body).not.toContain('Application error')
  })

  test('Offertlistan visar offerter', async ({ page }) => {
    await page.goto('/dashboard/quotes', { waitUntil: 'networkidle' })
    expect(page.url()).not.toContain('/login')
    const body = await page.textContent('body')
    expect(body).not.toContain('Application error')
  })
})
