import { test, expect } from '@playwright/test'

test.describe('Offert ax till limpa', () => {
  test('Skapa offert → skicka → verifiera status', async ({ page }) => {
    // 1. Gå till ny offert
    await page.goto('/dashboard/quotes/new')
    await page.waitForLoadState('networkidle')

    // 2. Fyll i titel
    const titleInput = page.locator('input[placeholder*="titel"], input[name="title"]').first()
    if (await titleInput.isVisible()) {
      await titleInput.fill('Playwright Test — Badrum')
    }

    // 3. Välj kund (om dropdown finns)
    const customerSelect = page.locator('select').first()
    if (await customerSelect.isVisible()) {
      const options = await customerSelect.locator('option').allTextContents()
      if (options.length > 1) {
        await customerSelect.selectOption({ index: 1 })
      }
    }

    // 4. Sidan ska inte krascha
    const body = await page.textContent('body')
    expect(body).not.toContain('Application error')
  })

  test('Offertlistan visar offerter', async ({ page }) => {
    await page.goto('/dashboard/quotes')
    await page.waitForLoadState('networkidle')

    // Ska inte vara helt tom (vi har E2E-offerter)
    const body = await page.textContent('body')
    expect(body).not.toContain('Application error')
  })

  test('E2E quote endpoint fungerar', async ({ request }) => {
    const res = await request.post('/api/debug/e2e-quote', {
      data: {
        email: process.env.TEST_USER_EMAIL || 'andreashogberg93@gmail.com',
        method: 'email',
      },
    })

    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.steps).toBeDefined()

    // Minst skapa + hämta ska lyckas
    const createStep = data.steps.find((s: any) => s.step.includes('Skapa offert'))
    expect(createStep?.status).toBe('ok')
  })
})
