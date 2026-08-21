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
    // CATEGORY_LABELS konsoliderades till lib/constants/support-categories.ts
    // (delas med ärendevyn i app/admin/support/[id]/page.tsx) — kontrollera
    // källan till sanning där, och att komponenten faktiskt använder den.
    const shared = fs.readFileSync(
      path.join(__dirname, '..', 'lib/constants/support-categories.ts'),
      'utf8',
    )
    expect(shared).not.toMatch(/refund:\s*'Refund'/)
    expect(shared).toMatch(/refund:\s*'Återbetalning'/)

    const component = fs.readFileSync(
      path.join(__dirname, '..', 'app/admin/components/SupportQueueTab.tsx'),
      'utf8',
    )
    expect(component).toContain("from '@/lib/constants/support-categories'")
  })
})
