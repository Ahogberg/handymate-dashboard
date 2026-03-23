import { test, expect } from '@playwright/test'

const PAGES = [
  { path: '/dashboard', name: 'Dashboard' },
  { path: '/dashboard/customers', name: 'Kunder' },
  { path: '/dashboard/pipeline', name: 'Säljtratt' },
  { path: '/dashboard/quotes', name: 'Offerter' },
  { path: '/dashboard/invoices', name: 'Fakturor' },
  { path: '/dashboard/projects', name: 'Projekt' },
  { path: '/dashboard/agent', name: 'Mitt team' },
  { path: '/dashboard/approvals', name: 'Godkännanden' },
  { path: '/dashboard/settings', name: 'Inställningar' },
  { path: '/dashboard/time', name: 'Tidrapportering' },
  { path: '/dashboard/planning/inventory', name: 'Lager' },
  { path: '/dashboard/planning/schedule', name: 'Schema' },
]

for (const pg of PAGES) {
  test(`${pg.name} (${pg.path}) laddar utan fel`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto(pg.path, { waitUntil: 'networkidle' })

    // Ska inte ha redirectat till login
    expect(page.url()).not.toContain('/login')

    // Sidan ska inte visa kritiska fel
    const body = await page.textContent('body')
    expect(body).not.toContain('Application error')
    expect(body).not.toContain('Internal Server Error')

    // Inga okontrollerade JS-fel (tillåt mindre konsolfel)
    const criticalErrors = errors.filter(e =>
      !e.includes('ResizeObserver') &&
      !e.includes('hydration') &&
      !e.includes('ChunkLoadError')
    )
    expect(criticalErrors).toHaveLength(0)
  })
}
