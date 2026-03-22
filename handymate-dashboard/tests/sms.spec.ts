import { test, expect } from '@playwright/test'

test.describe('SMS-funktionalitet', () => {
  test('Debug SMS endpoint returnerar diagnostik', async ({ request }) => {
    const res = await request.post('/api/debug/sms', {
      data: {},
    })
    const data = await res.json()
    expect(data.diagnostics).toBeDefined()
    expect(data.diagnostics.ELKS_API_USER).toContain('Set')
    expect(data.diagnostics.ELKS_API_PASSWORD).toContain('Set')
  })

  test('SMS-logg endpoint fungerar', async ({ request }) => {
    const res = await request.get('/api/sms/log?limit=5')
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.logs)).toBe(true)
  })

  test('On-my-way SMS endpoint finns', async ({ request }) => {
    // Ska ge 400 (saknar booking_id) men inte 404/500
    const res = await request.post('/api/sms/on-my-way', {
      data: {},
    })
    // 400 = endpoint finns men saknar data
    // 401 = auth-problem
    expect([400, 401]).toContain(res.status())
  })
})
