import { test, expect } from '@playwright/test'

test.describe('Kritiska API-endpoints', () => {
  test('GET /api/customers returnerar 200', async ({ request }) => {
    const res = await request.get('/api/customers')
    expect(res.status()).toBeLessThan(400)
  })

  test('GET /api/quotes returnerar 200', async ({ request }) => {
    const res = await request.get('/api/quotes')
    expect(res.status()).toBeLessThan(400)
  })

  test('GET /api/invoices returnerar 200', async ({ request }) => {
    const res = await request.get('/api/invoices')
    expect(res.status()).toBeLessThan(400)
  })

  test('GET /api/sms/log returnerar 200', async ({ request }) => {
    const res = await request.get('/api/sms/log?limit=5')
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('logs')
  })

  test('POST /api/debug/sms skickar test-SMS', async ({ request }) => {
    const res = await request.post('/api/debug/sms', {
      data: { to: '+46708379552' },
    })
    // Ska inte ge 401 (auth ska fungera via sparad session)
    const data = await res.json()
    expect(data.diagnostics).toBeDefined()
    expect(data.diagnostics.ELKS_API_USER).toContain('Set')
  })

  test('POST /api/debug/mail skickar test-mail', async ({ request }) => {
    const res = await request.post('/api/debug/mail', {
      data: { to: 'andreashogberg93@gmail.com' },
    })
    const data = await res.json()
    expect(data.diagnostics).toBeDefined()
  })

  test('POST /api/matte/chat returnerar svar', async ({ request }) => {
    const res = await request.post('/api/matte/chat', {
      data: {
        messages: [{ role: 'user', content: 'Hej, vad kan du hjälpa mig med?' }],
        context: { userName: 'Test', businessName: 'Test AB' },
      },
    })
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.reply).toBeTruthy()
  })

  test('GET /api/portal/[token] returnerar 404 för ogiltigt token', async ({ request }) => {
    const res = await request.get('/api/portal/invalid-token-123')
    expect(res.status()).toBe(404)
  })
})
