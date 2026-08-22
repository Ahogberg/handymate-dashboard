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

  test('recensionslänken är neutral och villkoras aldrig av positiv nöjdhet', () => {
    const route = fs.readFileSync(
      path.join(__dirname, '..', 'app/api/admin/support-tickets/[id]/satisfaction/route.ts'),
      'utf8',
    )
    expect(route).toMatch(/review_url:\s*HANDYMATE_GOOGLE_REVIEW_URL\s*\|\|\s*null/)
    expect(route).not.toMatch(/review_url:\s*satisfaction\s*===\s*['"]positive['"]/)
  })

  test('använder getAuthenticatedBusiness, inte administratörsvägen — kravet är hantverkarens egen session', () => {
    const route = fs.readFileSync(
      path.join(__dirname, '..', 'app/api/admin/support-tickets/[id]/satisfaction/route.ts'),
      'utf8',
    )
    expect(route).toContain('getAuthenticatedBusiness')
    expect(route).not.toContain('isAdmin')
  })
})
