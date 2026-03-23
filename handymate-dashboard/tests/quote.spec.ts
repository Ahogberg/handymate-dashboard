import { test, expect } from '@playwright/test'

test.describe('Offert-flöde', () => {
  test('Ny offert-sida ger inte 500', async ({ request }) => {
    const res = await request.get('/dashboard/quotes/new')
    expect(res.status()).not.toBe(500)
  })

  test('Offertlistan ger inte 500', async ({ request }) => {
    const res = await request.get('/dashboard/quotes')
    expect(res.status()).not.toBe(500)
  })
})
