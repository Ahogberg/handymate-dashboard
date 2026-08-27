/**
 * Browserlöst facit för kundkortets projektgrupperade kommunikationshistorik.
 *
 * Kör: npx playwright test tests/customer-project-timeline.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  emptyTimelineProjectContext,
  resolveTimelineProject,
} from '../lib/customers/timeline-project-context'
import { groupTimelineItemsByProject } from '../components/CustomerTimeline'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

function context() {
  const value = emptyTimelineProjectContext()
  value.projects.proj_1 = {
    project_id: 'proj_1',
    name: 'Badrum Andersson',
    project_number: 'P-101',
    status: 'active',
  }
  value.bookingToProject.book_1 = 'proj_1'
  value.invoiceToProject.inv_1 = 'proj_1'
  value.dealToProject.deal_1 = 'proj_1'
  value.quoteToProject.quote_1 = 'proj_1'
  value.leadToProject.lead_1 = 'proj_1'
  return value
}

test.describe('projektresolvern är fail-closed', () => {
  for (const [field, id] of [
    ['project_id', 'proj_1'],
    ['booking_id', 'book_1'],
    ['invoice_id', 'inv_1'],
    ['deal_id', 'deal_1'],
    ['quote_id', 'quote_1'],
    ['lead_id', 'lead_1'],
  ] as const) {
    test(`${field} kopplar via en verifierad relation`, () => {
      expect(resolveTimelineProject({ [field]: id }, context())?.project_id).toBe('proj_1')
    })
  }

  test('fritext, okänt id och kundens enda projekt används aldrig som gissning', () => {
    const ctx = context()
    expect(resolveTimelineProject({ title: 'Badrum Andersson' }, ctx)).toBeNull()
    expect(resolveTimelineProject({ project_id: 'proj_annan_tenant' }, ctx)).toBeNull()
    expect(resolveTimelineProject({}, ctx)).toBeNull()
  })
})

test('projektkontextens samtliga uppslag är tenant- och kundfiltrerade', () => {
  const source = read('app/api/customers/[id]/timeline/route.ts')
  const start = source.indexOf('const [projectContextRows')
  const end = source.indexOf('// ── 1. customer_activity', start)
  const block = source.slice(start, end)
  expect(start).toBeGreaterThan(-1)
  expect((block.match(/\.eq\('business_id', businessId\)/g) || []).length).toBe(5)
  expect((block.match(/\.eq\('customer_id', customerId\)/g) || []).length).toBe(5)
  expect(source.slice(0, start)).toContain(".eq('business_id', businessId)")
})

test('SMS-revisionsraden vinner med explicit relation utan att dubblera konversationen', () => {
  const source = read('app/api/customers/[id]/timeline/route.ts')
  const smsStart = source.indexOf("from('sms_log')")
  const smsBlock = source.slice(smsStart, smsStart + 1100)
  expect(smsBlock).toContain('related_id')
  expect(smsBlock).toContain('smsRelationMetadata')
  expect(smsBlock).not.toContain(".lt('sent_at'")
  expect(source).toContain("event.metadata.role !== 'assistant'")
  expect(source).toContain("event.metadata.source === 'sms_log'")
})

test('kundkortet startar per projekt och har en ärlig restgrupp', () => {
  const source = read('components/CustomerTimeline.tsx')
  expect(source).toContain("useState<TimelineView>('projects')")
  expect(source).toContain('Per projekt')
  expect(source).toContain('Kronologiskt')
  expect(source).toContain('Övrig kunddialog')
  expect(source).toContain('Saknar en säker koppling till ett specifikt projekt')
  expect(source).toContain('groupTimelineItemsByProject')
  expect(source).toContain('/dashboard/projects/${project.project_id}')
})

test('projektgrupper sorteras på senaste aktivitet och övrig dialog ligger sist', () => {
  const p1 = context().projects.proj_1
  const p2 = { ...p1, project_id: 'proj_2', name: 'Kök Bergström' }
  const event = (id: string, date: string, project: typeof p1 | null, type = 'sms_sent') => ({
    id,
    type: 'event' as const,
    date: new Date(date),
    data: { id, type, title: id, description: null, timestamp: date, metadata: {}, project },
  })

  const groups = groupTimelineItemsByProject([
    event('old', '2026-08-01T10:00:00Z', p1),
    event('new', '2026-08-03T10:00:00Z', p2, 'email_sent'),
    { id: 'gmail', type: 'email_thread' as const, date: new Date('2026-08-04T10:00:00Z'), data: {} },
  ])

  expect(groups.map(group => group.key)).toEqual(['project:proj_2', 'project:proj_1', 'other'])
  expect(groups[0].channels).toEqual(['E-post'])
  expect(groups[1].channels).toEqual(['SMS'])
})

