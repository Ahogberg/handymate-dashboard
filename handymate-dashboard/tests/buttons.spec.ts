import { test, expect } from '@playwright/test'

// Button-tester kräver autentiserad session.
// I CI testas endpoints via API istället för page-interaktion.

test.describe('Kritiska endpoints svarar', () => {
  test('Ny offert-sida ger inte 500', async ({ request }) => {
    const res = await request.get('/dashboard/quotes/new')
    expect(res.status()).not.toBe(500)
  })

  test('Kunder-sida ger inte 500', async ({ request }) => {
    const res = await request.get('/dashboard/customers')
    expect(res.status()).not.toBe(500)
  })

  test('Inställningar ger inte 500', async ({ request }) => {
    const res = await request.get('/dashboard/settings')
    expect(res.status()).not.toBe(500)
  })

  test('Pipeline ger inte 500', async ({ request }) => {
    const res = await request.get('/dashboard/pipeline')
    expect(res.status()).not.toBe(500)
  })

  test('Agent/team ger inte 500', async ({ request }) => {
    const res = await request.get('/dashboard/agent')
    expect(res.status()).not.toBe(500)
  })
})
