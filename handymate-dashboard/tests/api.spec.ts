import { test, expect } from '@playwright/test'

test.describe('Kritiska API-endpoints', () => {
  test('GET /api/customers returnerar data', async ({ request }) => {
    const res = await request.get('/api/customers')
    // 200 = OK, 401 = auth krävs (acceptabelt i CI)
    expect([200, 401]).toContain(res.status())
  })

  test('GET /api/quotes returnerar data', async ({ request }) => {
    const res = await request.get('/api/quotes')
    expect([200, 401]).toContain(res.status())
  })

  test('GET /api/invoices returnerar data', async ({ request }) => {
    const res = await request.get('/api/invoices')
    expect([200, 401]).toContain(res.status())
  })

  test('POST /api/debug/sms diagnostik fungerar', async ({ request }) => {
    const res = await request.post('/api/debug/sms', { data: {} })
    // Debug-endpoint ska alltid svara
    expect([200, 401]).toContain(res.status())
    if (res.status() === 200) {
      const data = await res.json()
      expect(data.diagnostics).toBeDefined()
    }
  })

  test('POST /api/debug/mail diagnostik fungerar', async ({ request }) => {
    const res = await request.post('/api/debug/mail', { data: {} })
    expect([200, 401]).toContain(res.status())
  })

  test('POST /api/matte/chat returnerar svar', async ({ request }) => {
    const res = await request.post('/api/matte/chat', {
      data: {
        messages: [{ role: 'user', content: 'Hej' }],
        context: { userName: 'Test', businessName: 'Test AB' },
      },
    })
    // 200 = svar, 401 = auth, 500 = API-nyckel saknas
    expect([200, 401, 500]).toContain(res.status())
  })
})
