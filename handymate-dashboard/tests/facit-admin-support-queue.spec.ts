import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

test.describe('Admin supportkö', () => {
  test('SupportQueueTab-komponenten finns', () => {
    const p = path.join(__dirname, '..', 'app/admin/components/SupportQueueTab.tsx')
    expect(fs.existsSync(p)).toBe(true)
  })

  test('GET /api/admin/support-tickets kräver isAdmin', () => {
    const route = fs.readFileSync(
      path.join(__dirname, '..', 'app/api/admin/support-tickets/route.ts'),
      'utf8',
    )
    expect(route).toContain('isAdmin')
  })

  test('admin-sidan har en support-flik', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'app/admin/page.tsx'), 'utf8')
    expect(page).toMatch(/'support'/)
    expect(page).toContain('SupportQueueTab')
  })

  test('kategori-etiketten för refund är på svenska, inte engelska', () => {
    const component = fs.readFileSync(
      path.join(__dirname, '..', 'app/admin/components/SupportQueueTab.tsx'),
      'utf8',
    )
    expect(component).not.toMatch(/refund:\s*'Refund'/)
    expect(component).toMatch(/refund:\s*'Återbetalning'/)
  })
})
