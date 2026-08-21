import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

test.describe('Nöjdhetsfråga + recension vid löst supportärende', () => {
  test('en satisfaction-rutt finns som accepterar positive/negative', () => {
    const route = fs.readFileSync(
      path.join(__dirname, '..', 'app/api/admin/support-tickets/[id]/satisfaction/route.ts'),
      'utf8',
    )
    expect(route).toMatch(/positive/)
    expect(route).toMatch(/negative/)
  })

  test('positiv nöjdhet returnerar HANDYMATE_GOOGLE_REVIEW_URL, negativ gör det inte', () => {
    const route = fs.readFileSync(
      path.join(__dirname, '..', 'app/api/admin/support-tickets/[id]/satisfaction/route.ts'),
      'utf8',
    )
    expect(route).toContain('HANDYMATE_GOOGLE_REVIEW_URL')
  })

  test('anvander getAuthenticatedBusiness, inte isAdmin — kraven ar hantverkarens egen session', () => {
    const route = fs.readFileSync(
      path.join(__dirname, '..', 'app/api/admin/support-tickets/[id]/satisfaction/route.ts'),
      'utf8',
    )
    expect(route).toContain('getAuthenticatedBusiness')
    expect(route).not.toContain('isAdmin')
  })
})
