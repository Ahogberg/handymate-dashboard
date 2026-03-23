import { test, expect } from '@playwright/test'

test.describe('SMS-funktionalitet', () => {
  test('Debug SMS endpoint svarar', async ({ request }) => {
    const res = await request.post('/api/debug/sms', { data: {} })
    expect([200, 401]).toContain(res.status())
    if (res.status() === 200) {
      const data = await res.json()
      expect(data.diagnostics).toBeDefined()
      expect(data.diagnostics.ELKS_API_USER).toContain('Set')
      expect(data.diagnostics.ELKS_API_PASSWORD).toContain('Set')
    }
  })

  test('SMS-logg endpoint fungerar', async ({ request }) => {
    const res = await request.get('/api/sms/log?limit=5')
    expect([200, 401]).toContain(res.status())
  })
})
