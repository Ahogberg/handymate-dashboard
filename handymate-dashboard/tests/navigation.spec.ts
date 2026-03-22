import { test, expect } from '@playwright/test'

const PAGES = [
  { path: '/dashboard', title: 'Dashboard' },
  { path: '/dashboard/customers', title: 'Kunder' },
  { path: '/dashboard/pipeline', title: 'Säljtratt' },
  { path: '/dashboard/quotes', title: 'Offerter' },
  { path: '/dashboard/invoices', title: 'Fakturor' },
  { path: '/dashboard/projects', title: 'Projekt' },
  { path: '/dashboard/agent', title: 'Mitt team' },
  { path: '/dashboard/approvals', title: 'Godkännanden' },
  { path: '/dashboard/settings', title: 'Inställningar' },
  { path: '/dashboard/time', title: 'Tidrapportering' },
  { path: '/dashboard/planning/inventory', title: 'Lager' },
  { path: '/dashboard/planning/schedule', title: 'Schema' },
]

for (const page of PAGES) {
  test(`${page.title} (${page.path}) laddar utan fel`, async ({ page: p }) => {
    const errors: string[] = []
    p.on('pageerror', (err) => errors.push(err.message))

    const res = await p.goto(page.path)
    expect(res?.status()).toBeLessThan(400)

    // Vänta på att sidan renderas (inga laddningsspinners kvar)
    await p.waitForLoadState('networkidle')

    // Inga JavaScript-fel
    expect(errors).toHaveLength(0)

    // Sidan ska inte visa felmeddelande
    const body = await p.textContent('body')
    expect(body).not.toContain('Application error')
    expect(body).not.toContain('Internal Server Error')
  })
}
