/**
 * Browserlöst facit för kundkortets projektgrupperade kommunikationshistorik.
 *
 * Kör: npx playwright test tests/customer-project-timeline.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'
import {
  emptyTimelineProjectContext,
  resolveTimelineProject,
} from '../lib/customers/timeline-project-context'
import { groupTimelineItemsByProject } from '../components/CustomerTimeline'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

function timelineGet(options: { smsError?: boolean; contextError?: boolean }) {
  const booking = { booking_id: 'book-ok', business_id: 'tenant-a', customer_id: 'cust', project_id: null, status: 'confirmed', job_status: 'scheduled', notes: 'Besök', scheduled_start: '2026-09-12T10:00:00Z', completed_at: null, created_at: '2026-09-10T10:00:00Z' }
  function query(table: string) {
    let rows: any[] = table === 'customer' ? [{ customer_id: 'cust', business_id: 'tenant-a', phone_number: '+46700000000', email: null }] : table === 'booking' ? [booking] : []
    let error: any = table === 'sms_conversation' && options.smsError ? { message: 'sms failed' } : table === 'project' && options.contextError ? { message: 'context failed' } : null
    const q: any = {
      select() { return q }, eq(key: string, value: unknown) { rows = rows.filter(row => row[key] === value); return q },
      in(key: string, values: unknown[]) { rows = rows.filter(row => values.includes(row[key])); return q },
      is(key: string, value: unknown) { rows = rows.filter(row => row[key] == value); return q }, not() { return q }, like() { return q }, or() { return q }, gte() { return q },
      order() { return q }, limit(value: number) { rows = rows.slice(0, value); return q }, maybeSingle() { return Promise.resolve({ data: rows[0] || null, error }) }, single() { return Promise.resolve({ data: rows[0] || null, error }) },
      then(resolve: (value: any) => void) { resolve({ data: rows, error }) },
    }
    return q
  }
  const code = ts.transpileModule(read('app/api/customers/[id]/timeline/route.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const deps: Record<string, any> = {
    'next/server': { NextResponse }, '@/lib/auth': { getAuthenticatedBusiness: async () => ({ business_id: 'tenant-a' }) }, '@/lib/supabase': { getServerSupabase: () => ({ from: query }) },
    '@/lib/voice/find-customer-by-phone': { phoneCandidates: (phone: string) => [phone] },
    '@/lib/customers/timeline-project-context': { emptyTimelineProjectContext: () => ({ projects: {}, dealToProject: {}, leadToProject: {}, quoteToProject: {}, invoiceToProject: {}, bookingToProject: {} }), resolveTimelineProject: () => null },
  }
  const module = { exports: {} as any }; new Function('require', 'module', 'exports', code)((name: string) => deps[name], module, module.exports)
  return module.exports.GET as (request: NextRequest, context: { params: { id: string } }) => Promise<Response>
}

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

test('actual timeline GET retains a booking and reports a failed SMS source', async () => {
  const response = await timelineGet({ smsError: true })(new NextRequest('https://test/api/customers/cust/timeline?filter=all'), { params: { id: 'cust' } })
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.events.some((event: any) => event.id === 'book_book-ok')).toBe(true)
  expect(body.incomplete_sources).toContain('SMS-konversationer')
})

test('actual timeline GET fails closed when project context cannot be read', async () => {
  const response = await timelineGet({ contextError: true })(new NextRequest('https://test/api/customers/cust/timeline?filter=all'), { params: { id: 'cust' } })
  expect(response.status).toBe(503)
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
