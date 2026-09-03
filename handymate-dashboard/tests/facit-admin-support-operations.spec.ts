import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (file: string) => fs
  .readFileSync(path.join(ROOT, file), 'utf8')
  .replace(/\r\n/g, '\n')

test.describe('Admin Support & drift — en befintlig operativ yta', () => {
  test('driftläsningen är superadmin-grindad och dynamisk', () => {
    const route = read('app/api/admin/support-operations/route.ts')
    expect(route).toContain("from '@/lib/admin-auth'")
    expect(route).toContain('await isAdmin(request)')
    expect(route).toContain("status: 403")
    expect(route).toContain("export const dynamic = 'force-dynamic'")
  })

  test('samma fyra felkällor som driftlarmet läses inom 25 timmar', () => {
    const route = read('app/api/admin/support-operations/route.ts')
    for (const table of ['sms_log', 'communication_log', 'billing_event', 'automation_activity']) {
      expect(route, `${table} saknas`).toContain(`source: '${table}'`)
    }
    expect(route).toContain('25 * 60 * 60 * 1000')
    expect(route).toContain(".eq('status', 'failed')")
    expect(route).toContain(".eq('event_type', 'payment_failed')")
    expect(route).toContain(".eq('direction', 'outbound')")
  })

  test('demodata utesluts och företagsnamn är bara ett läsbart tillägg', () => {
    const route = read('app/api/admin/support-operations/route.ts')
    expect(route).toContain('process.env.DEMO_BUSINESS_ID')
    expect(route).toContain(".neq('business_id', demoBusinessId)")
    expect(route).toContain(".from('business_config')")
    expect(route).toContain(".select('business_id, business_name')")
  })

  test('en trasig kontroll blir unavailable och kan aldrig se grön ut', () => {
    const route = read('app/api/admin/support-operations/route.ts')
    expect(route).toContain("status: 'unavailable'")
    expect(route).toContain("status: 'ok'")

    const component = read('app/admin/components/SupportQueueTab.tsx')
    expect(component).toContain("source.status === 'unavailable'")
    expect(component).toContain('Kunde inte kontrolleras')
    expect(component).toContain('Inte samma sak som att allt är grönt')
  })

  test('supportfliken behåller ärendekön och visar drift separat', () => {
    const component = read('app/admin/components/SupportQueueTab.tsx')
    expect(component).toContain("fetchJson('/api/admin/support-tickets')")
    expect(component).toContain("fetchJson('/api/admin/support-operations')")
    expect(component).toContain('Supportärenden')
    expect(component).toContain('Drift senaste 25 timmarna')
    expect(component).toContain('/admin/support/${ticket.id}')

    const page = read('app/admin/page.tsx')
    expect(page).toContain("'Support & drift'")
  })

  test('driftvyn är läsande och återanvänder källornas sanning', () => {
    const route = read('app/api/admin/support-operations/route.ts')
    expect(route).not.toMatch(/\.insert\s*\(/)
    expect(route).not.toMatch(/\.update\s*\(/)
    expect(route).not.toMatch(/\.delete\s*\(/)
    expect(route).not.toMatch(/\.upsert\s*\(/)
    expect(route).toContain('lasKreditlage(supabase)')
  })
})
