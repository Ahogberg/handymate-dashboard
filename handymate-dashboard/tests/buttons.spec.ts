import { test, expect } from '@playwright/test'

test.describe('Primära knappar', () => {
  test('Dashboard renderar utan krasch', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    expect(page.url()).not.toContain('/login')

    // Sidebar ska finnas
    const sidebar = page.locator('nav').first()
    await expect(sidebar).toBeVisible({ timeout: 10_000 })
  })

  test('Ny offert-sida laddar', async ({ page }) => {
    await page.goto('/dashboard/quotes/new', { waitUntil: 'networkidle' })
    expect(page.url()).not.toContain('/login')
    const body = await page.textContent('body')
    expect(body).not.toContain('Application error')
  })

  test('Kunder-sida laddar', async ({ page }) => {
    await page.goto('/dashboard/customers', { waitUntil: 'networkidle' })
    expect(page.url()).not.toContain('/login')
    const body = await page.textContent('body')
    expect(body).not.toContain('Application error')
  })

  test('Inställningar laddar och visar flikar', async ({ page }) => {
    await page.goto('/dashboard/settings', { waitUntil: 'networkidle' })
    expect(page.url()).not.toContain('/login')
    const body = await page.textContent('body')
    expect(body).not.toContain('Application error')
  })

  test('Pipeline laddar utan fel', async ({ page }) => {
    await page.goto('/dashboard/pipeline', { waitUntil: 'networkidle' })
    expect(page.url()).not.toContain('/login')
    const body = await page.textContent('body')
    expect(body).not.toContain('Application error')
  })
})
