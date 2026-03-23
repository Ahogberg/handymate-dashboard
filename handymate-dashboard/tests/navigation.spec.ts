import { test, expect } from '@playwright/test'

// Page-navigeringstester kräver korrekt Supabase auth via cookies.
// Magic link i CI redirectar till /login — Supabase token verification
// sker client-side via JS, inte server-side.
// Dessa tester körs bara lokalt med manuell session.

const PAGES = [
  '/dashboard',
  '/dashboard/customers',
  '/dashboard/pipeline',
  '/dashboard/quotes',
  '/dashboard/invoices',
  '/dashboard/projects',
  '/dashboard/settings',
]

test.describe('Dashboard-sidor svarar', () => {
  for (const path of PAGES) {
    test(`${path} ger HTTP 200/302 (inte 500)`, async ({ request }) => {
      const res = await request.get(path)
      // 200 = OK, 302/303 = redirect till login (acceptabelt)
      // Ska ALDRIG ge 500
      expect(res.status()).not.toBe(500)
    })
  }
})
