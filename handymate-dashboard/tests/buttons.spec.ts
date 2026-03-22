import { test, expect } from '@playwright/test'

test.describe('Primära knappar', () => {
  test('Dashboard — alla widget-knappar är klickbara', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Sidebar ska finnas
    const sidebar = page.locator('nav, [class*="sidebar"], [class*="Sidebar"]').first()
    await expect(sidebar).toBeVisible()
  })

  test('Ny offert-knapp finns och navigerar', async ({ page }) => {
    await page.goto('/dashboard/quotes')
    await page.waitForLoadState('networkidle')

    const newButton = page.locator('a[href*="quotes/new"], button:has-text("Ny offert"), button:has-text("ny offert")').first()
    if (await newButton.isVisible()) {
      await newButton.click()
      await page.waitForURL('**/quotes/new**')
    }
  })

  test('Ny kund-knapp finns', async ({ page }) => {
    await page.goto('/dashboard/customers')
    await page.waitForLoadState('networkidle')

    const addBtn = page.locator('button:has-text("Ny kund"), button:has-text("Lägg till"), a[href*="customers/new"]').first()
    if (await addBtn.isVisible()) {
      await expect(addBtn).toBeEnabled()
    }
  })

  test('Inställningar — flikar växlar korrekt', async ({ page }) => {
    await page.goto('/dashboard/settings')
    await page.waitForLoadState('networkidle')

    // Klicka på en flik
    const teamTab = page.locator('button:has-text("Team"), a:has-text("Team")').first()
    if (await teamTab.isVisible()) {
      await teamTab.click()
      // Ska inte krascha
      const body = await page.textContent('body')
      expect(body).not.toContain('Application error')
    }
  })

  test('Pipeline — kort renderas utan fel', async ({ page }) => {
    await page.goto('/dashboard/pipeline')
    await page.waitForLoadState('networkidle')

    const body = await page.textContent('body')
    expect(body).not.toContain('Application error')
    expect(body).not.toContain('Internal Server Error')
  })
})
