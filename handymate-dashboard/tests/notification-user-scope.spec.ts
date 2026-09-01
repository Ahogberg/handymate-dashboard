import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('P1-5 — riktade notifikationer är privata inom tenanten', () => {
  test('API GET och PUT kräver aktuell användare och applicerar personscope', () => {
    const source = read('app/api/notifications/route.ts')
    expect(source.match(/getCurrentUser\(request, business\.business_id\)/g)).toHaveLength(2)
    expect(source.match(/\.or\(visibleToUserFilter\(currentUser\.user_id\)\)/g)?.length).toBeGreaterThanOrEqual(4)
    expect(source).toContain('user_id.is.null,user_id.eq.${userId}')
  })

  test('Sidebar scopear alla fyra direkta läs- och skrivvägar', () => {
    const source = read('components/Sidebar.tsx')
    const notificationSection = source.slice(
      source.indexOf('// ── Notifications'),
      source.indexOf('// ── Prevent body scroll')
    )
    expect(notificationSection.match(/user_id\.is\.null,user_id\.eq\.\$\{currentUser\.user_id\}/g)).toHaveLength(4)
    expect(notificationSection).toContain(".eq('business_id', businessId)")
    expect(notificationSection).toContain('if (!businessId || !currentUser?.user_id) return')
  })

  test('RLS behåller broadcast men nekar andra användares riktade rader', () => {
    const sql = read('sql/v188_notification_user_scope.sql')
    expect(sql).toContain('public.is_business_member(business_id)')
    expect(sql.match(/user_id IS NULL OR user_id = auth\.uid\(\)::text/g)?.length).toBeGreaterThanOrEqual(4)
    expect(sql).toContain('TO authenticated')
    expect(sql).toContain('TO service_role')
    expect(sql).toContain('REVOKE ALL ON TABLE public.notification FROM PUBLIC, anon, authenticated')
  })
})
