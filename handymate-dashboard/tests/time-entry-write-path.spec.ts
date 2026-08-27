/**
 * Facit — manuellt registrerad tid går genom samma tenant-säkra skrivväg
 * som automationerna, och ett saknat timpris blir aldrig krasch eller en
 * påhittad intäkt.
 *
 * Kör: npx playwright test tests/time-entry-write-path.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { resolveTimeEntryHourlyRate } from '../lib/time-entry/rate'

const ROOT = path.resolve(__dirname, '..')
const source = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), 'utf8')

test.describe('Timprisets sanningskontrakt', () => {
  test('explicit pris är slutpriset och multipliceras inte igen', () => {
    expect(resolveTimeEntryHourlyRate({
      explicitRate: 950,
      userRate: 700,
      pricingSettings: { hourly_rate: 800 },
      legacyDefaultRate: 750,
      workTypeMultiplier: 1.5,
    })).toBe(950)
  })

  test('tomt pris använder person, sedan owner-satt företagspris, sedan legacy', () => {
    expect(resolveTimeEntryHourlyRate({
      explicitRate: null,
      userRate: 900,
      pricingSettings: { hourly_rate: 800 },
      legacyDefaultRate: 700,
      workTypeMultiplier: 1.5,
    })).toBe(1350)

    expect(resolveTimeEntryHourlyRate({
      explicitRate: '',
      userRate: null,
      pricingSettings: { hourly_rate: 800 },
      legacyDefaultRate: 700,
    })).toBe(800)

    expect(resolveTimeEntryHourlyRate({
      explicitRate: null,
      userRate: null,
      pricingSettings: null,
      legacyDefaultRate: 700,
    })).toBe(700)
  })

  test('saknade verkliga källor förblir null — inget magiskt standardpris', () => {
    expect(resolveTimeEntryHourlyRate({
      explicitRate: null,
      userRate: null,
      pricingSettings: null,
      legacyDefaultRate: null,
      workTypeMultiplier: 2,
    })).toBeNull()
  })
})

test.describe('En kanonisk manuell skrivväg', () => {
  test('båda manuella vyerna använder /api/time-entry för create/update/delete', () => {
    const projectPage = source('app/dashboard/projects/[id]/page.tsx')
    const todayView = source('app/dashboard/time/components/TodayView.tsx')

    const projectSave = projectPage.slice(
      projectPage.indexOf('async function handleTimeSave()'),
      projectPage.indexOf('function handleTimeBookingChange'),
    )
    expect(projectSave).toContain("fetch('/api/time-entry'")
    expect(projectSave).not.toContain("from('time_entry').insert")

    const todaySave = todayView.slice(
      todayView.indexOf('const handleSave = async ()'),
      todayView.indexOf('const handleBookingChange'),
    )
    expect(todaySave).toContain("fetch('/api/time-entry'")
    expect(todaySave).toContain("method: editingEntry ? 'PUT' : 'POST'")
    expect(todaySave).toContain("method: 'DELETE'")
    expect(todaySave).not.toMatch(/from\('time_entry'\)\.(insert|update|delete)/)
  })

  test('service-role-rutten tenantvaliderar relationer före insert', () => {
    const route = source('app/api/time-entry/route.ts')
    const post = route.slice(route.indexOf('export async function POST'), route.indexOf('export async function PUT'))
    const validation = post.indexOf('resolveTimeEntryReferences')
    const insert = post.indexOf(".from('time_entry')\n      .insert")

    expect(validation).toBeGreaterThan(-1)
    expect(insert).toBeGreaterThan(validation)
    expect(route).toContain(".eq('business_id', businessId)")
    expect(route).toContain('Du får bara registrera tid för dig själv')
    expect(post).not.toMatch(/\?\?\s*500|\|\|\s*500/)
    expect(post).toContain('break_minutes:')
    expect(post).toContain('work_category:')
  })

  test('projektvyn accepterar nullable hourly_rate och visar sanningen', () => {
    const projectPage = source('app/dashboard/projects/[id]/page.tsx')
    expect(projectPage).toContain('hourly_rate: number | null')
    expect(projectPage).toContain("entry.hourly_rate === null ? 'Timpris saknas'")
    expect(projectPage).toContain("typeof amount === 'number' && Number.isFinite(amount)")
  })
})
