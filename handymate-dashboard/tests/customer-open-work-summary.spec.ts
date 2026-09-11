import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'
import { loadCustomerNextBooking, loadCustomerRelationship, loadCustomerTasks, nextAdministrativeStep } from '../lib/customers/customer-open-work'
import * as taskVisibility from '../lib/tasks/visibility'

type Row = Record<string, any>
function customerDecisionRoute(seed: Record<string, Row[]>, options: { failPage?: number; denied?: string[] } = {}) {
  function query(table: string) {
    let rows = [...(seed[table] || [])]; let range: [number, number] | null = null
    const q: any = {
      select() { return q },
      eq(key: string, value: unknown) { rows = rows.filter(row => row[key] === value); return q },
      in(key: string, values: unknown[]) { rows = rows.filter(row => values.includes(row[key])); return q },
      or() { rows = rows.filter(row => !row.snoozed_until || Date.parse(row.snoozed_until) < Date.now()); return q },
      order(key: string, config?: { ascending?: boolean }) { rows.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (config?.ascending === true ? 1 : -1)); return q },
      range(from: number, to: number) { range = [from, to]; return q },
      maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }) },
      then(resolve: (result: any) => void) {
        if (table === 'pending_approvals' && range && options.failPage === range[0]) return resolve({ data: null, error: { message: 'page failed' } })
        resolve({ data: range ? rows.slice(range[0], range[1] + 1) : rows, error: null })
      },
    }; return q
  }
  const code = ts.transpileModule(readFileSync('app/api/customers/[id]/decisions/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const caseTypes = ['customer_fact', 'send_sms', 'send_email', 'quote_nudge', 'invoice_reminder', 'profitability_warning']
  const deps: Record<string, any> = {
    'next/server': { NextResponse }, '@/lib/auth': { getAuthenticatedBusiness: async () => ({ business_id: 'tenant-a' }) },
    '@/lib/permissions': { getCurrentUser: async () => ({ id: 'user', business_id: 'tenant-a', role: 'owner' }) }, '@/lib/supabase': { getServerSupabase: () => ({ from: query }) },
    '@/lib/approvals/routing': { canActOnApproval: async (_db: any, _user: any, row: Row) => !options.denied?.includes(row.id) },
    '@/lib/jarvis/approval-view': { approvalDisplay: () => ({ type_label: 'Beslut' }) }, '@/lib/testdata': { arTestdataApproval: (row: Row) => row.test_data === true },
    '@/lib/jarvis/customer-case': { CUSTOMER_CASE_APPROVAL_TYPES: caseTypes.slice(3), kundReferensForApproval: (row: Row) => row.approval_type === 'quote_nudge' ? { kind: 'quote', id: row.payload.quote_id } : row.approval_type === 'invoice_reminder' ? { kind: 'invoice', id: row.payload.invoice_id } : row.approval_type === 'profitability_warning' ? { kind: 'project', id: row.payload.project_id } : null },
  }
  const module = { exports: {} as any }; new Function('require', 'module', 'exports', code)((name: string) => deps[name], module, module.exports)
  return module.exports.GET as (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>
}
function bookingRoute(seed: Record<string, Row[]>, projectError = false, projectCountOffset = 0) {
  const operations: string[] = []
  function query(table: string) {
    let rows = [...(seed[table] || [])]
    let limit: number | null = null
    const q: any = {
      select() { return q },
      eq(key: string, value: unknown) { if (table === 'booking' && key === 'status' && !['confirmed', 'cancelled', 'completed', 'no_show'].includes(String(value))) throw new Error('invalid booking_status enum'); operations.push(`${table}:eq:${key}:${value}`); rows = rows.filter(row => row[key] === value); return q },
      in(key: string, values: unknown[]) { if (table === 'booking' && key === 'status' && values.some(value => !['confirmed', 'cancelled', 'completed', 'no_show'].includes(String(value)))) throw new Error('invalid booking_status enum'); operations.push(`${table}:in:${key}:${values.join('|')}`); rows = rows.filter(row => values.includes(row[key])); return q },
      gte(key: string, value: string) { operations.push(`${table}:gte:${key}:${value}`); rows = rows.filter(row => row[key] >= value); return q },
      lte(key: string, value: string) { rows = rows.filter(row => row[key] <= value); return q },
      is(key: string, value: unknown) { operations.push(`${table}:is:${key}:${value}`); rows = rows.filter(row => row[key] == null); return q },
      or(expression: string) {
        operations.push(`${table}:or:${expression}`)
        if (expression === 'job_status.is.null,job_status.not.in.(cancelled,completed)') rows = rows.filter(row => row.job_status == null || !['cancelled', 'completed'].includes(row.job_status))
        return q
      },
      order(key: string) { rows.sort((a, b) => String(a[key]).localeCompare(String(b[key]))); return q },
      limit(value: number) { limit = value; return q },
      then(resolve: (result: any) => void) { resolve({ data: limit == null ? rows : rows.slice(0, limit), count: rows.length + (table === 'project' ? projectCountOffset : 0), error: table === 'project' && projectError ? { message: 'project read failed' } : null }) },
    }
    return q
  }
  const code = ts.transpileModule(readFileSync('app/api/bookings/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const deps: Record<string, any> = {
    'next/server': { NextResponse }, '@/lib/auth': { getAuthenticatedBusiness: async () => ({ business_id: 'tenant-a' }) },
    '@/lib/supabase': { getServerSupabase: () => ({ from: query }) }, '@/lib/permissions': { getCurrentUser: async () => null },
    '@/lib/google-calendar-sync': {}, '@/lib/bookings/day-progress': { fetchProjectBookings: async () => new Map(), computeBookingDayProgress: () => ({ current_day: 0, total_days: 0, is_final_day: false }) },
    '@/lib/notifications/schedule-push': {}, '@/lib/bookings/apply-pipeline-effects': {},
  }
  const module = { exports: {} as any }
  new Function('require', 'module', 'exports', code)((name: string) => deps[name], module, module.exports)
  return { get: module.exports.GET as (request: NextRequest) => Promise<Response>, operations }
}

function taskRoute(rows: Row[], currentUser: Row | null, assignmentError = false) {
  function query(table: string) {
    let selected = [...(table === 'task' ? rows : [])]; let cap: number | null = null
    const q: any = {
      select() { return q },
      eq(key: string, value: unknown) { selected = selected.filter(row => row[key] === value); return q },
      in(key: string, values: unknown[]) { selected = selected.filter(row => values.includes(row[key])); return q },
      order(key: string, options?: { ascending?: boolean; nullsFirst?: boolean }) { selected.sort((a, b) => a[key] == null ? 1 : b[key] == null ? -1 : String(a[key]).localeCompare(String(b[key])) * (options?.ascending === false ? -1 : 1)); return q },
      or(expression: string) {
        if (expression.includes('visibility.neq.private')) selected = selected.filter(row => row.visibility !== 'private' || row.assigned_to === currentUser?.id || row.created_by === 'auth-user')
        return q
      },
      limit(value: number) { cap = value; return q },
      then(resolve: (result: any) => void) { resolve({ data: cap == null ? selected : selected.slice(0, cap), error: table === 'project_assignment' && assignmentError ? { message: 'scope failed' } : null }) },
    }; return q
  }
  const code = ts.transpileModule(readFileSync('app/api/tasks/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const deps: Record<string, any> = {
    'next/server': { NextResponse }, '@/lib/auth': { getAuthenticatedBusiness: async () => ({ business_id: 'tenant-a', user_id: 'auth-user' }) },
    '@/lib/supabase': { getServerSupabase: () => ({ from: query }) }, '@/lib/permissions': { getCurrentUser: async () => currentUser },
    '@/lib/auth/verify-ownership': {}, '@/lib/tasks/visibility': taskVisibility,
  }
  const module = { exports: {} as any }; new Function('require', 'module', 'exports', code)((name: string) => deps[name], module, module.exports)
  return module.exports.GET as (request: NextRequest) => Promise<Response>
}

const direct = { booking_id: 'direct', business_id: 'tenant-a', customer_id: 'cust', project_id: null, scheduled_start: '2026-09-12T10:00:00Z', status: 'confirmed' }
const projectBooking = { booking_id: 'project-booking', business_id: 'tenant-a', customer_id: null, project_id: 'project-safe', scheduled_start: '2026-09-11T10:00:00Z', status: 'confirmed', job_status: 'scheduled' }

test('actual bookings route includes tenant customer projects and filters inactive or conflicting candidates before its limit', async () => {
  const harness = bookingRoute({ project: [{ project_id: 'project-safe', business_id: 'tenant-a', customer_id: 'cust' }], booking: [direct, projectBooking,
    { ...projectBooking, booking_id: 'completed-job', scheduled_start: '2026-09-10T13:00:00Z', job_status: 'completed' },
    { ...projectBooking, booking_id: 'conflict', scheduled_start: '2026-09-10T14:00:00Z', customer_id: 'other' },
  ] })
  const response = await harness.get(new NextRequest('https://test/api/bookings?customerId=cust&from=2026-09-10T12:00:00.000Z&next_active=true'))
  expect(response.status).toBe(200)
  expect((await response.json()).bookings.map((row: Row) => row.booking_id)).toEqual(['project-booking', 'direct'])
  expect(harness.operations).toContain('project:eq:business_id:tenant-a')
  expect(harness.operations).toContain('booking:in:project_id:project-safe')
  expect(harness.operations).toContain('booking:eq:status:confirmed')
})

test('customer filter never enters raw PostgREST grammar and project lookup failures are explicit', async () => {
  const injected = 'cust,or(status.eq.cancelled)'
  const harness = bookingRoute({ project: [] })
  await harness.get(new NextRequest(`https://test/api/bookings?customerId=${encodeURIComponent(injected)}&next_active=true`))
  expect(harness.operations).toContain(`project:eq:customer_id:${injected}`)
  expect(readFileSync('app/api/bookings/route.ts', 'utf8')).not.toContain('.or(`customer_id')
  const failed = bookingRoute({ project: [] }, true)
  expect((await failed.get(new NextRequest('https://test/api/bookings?customerId=cust&next_active=true'))).status).toBe(500)
  const truncated = bookingRoute({ project: [{ project_id: 'p', business_id: 'tenant-a', customer_id: 'cust' }] }, false, 1)
  expect((await truncated.get(new NextRequest('https://test/api/bookings?customerId=cust&next_active=true'))).status).toBe(500)
})

test('task loader uses canonical scoped summary and never expands actor visibility client-side', async () => {
  const controller = new AbortController(); let url = ''
  const result = await loadCustomerTasks('cust / å', controller.signal, async input => {
    url = String(input)
    return new Response(JSON.stringify({ tasks: [
      { id: 'done', title: 'Klar', status: 'done', due_date: null, due_time: null },
      { id: 'open', title: 'Ring', status: 'pending', due_date: '2026-09-11', due_time: '09:00' },
    ], has_more: false, scope: 'own' }))
  })
  expect(url).toBe('/api/tasks?customer_id=cust%20%2F%20%C3%A5&open_summary=true')
  expect(result).toEqual({ tasks: [{ id: 'open', title: 'Ring', status: 'pending', due_date: '2026-09-11', due_time: '09:00' }], hasMore: false })
  const route = readFileSync('app/api/tasks/route.ts', 'utf8')
  expect(route).toContain('taskListOrFilter(scope)')
  expect(route).toContain('canSeeTask(t, scope)')
  await expect(loadCustomerTasks('x', controller.signal, async () => new Response('{}', { status: 500 }))).rejects.toThrow('task-read-failed')
})

test('actual bounded task GET applies private visibility before limit and fails closed on unknown scope', async () => {
  const hidden = Array.from({ length: 4 }, (_, i) => ({ id: `hidden-${i}`, business_id: 'tenant-a', visibility: 'private', assigned_to: 'other', created_by: 'other' }))
  const visible = { id: 'visible', business_id: 'tenant-a', title: 'Visible', status: 'pending', due_date: '2026-09-12', due_time: '09:00', customer_id: 'cust', visibility: 'team', assigned_to: null, created_by: 'other' }
  const get = taskRoute([...hidden.map((row, i) => ({ ...row, title: 'Hidden', status: 'pending', due_date: `2026-09-0${i + 1}`, due_time: '09:00', customer_id: 'cust' })), visible], { id: 'member', role: 'owner' })
  const response = await get(new NextRequest('https://test/api/tasks?customer_id=cust&open_summary=true'))
  expect(response.status).toBe(200)
  expect((await response.json()).tasks.map((row: Row) => row.id)).toEqual(['visible'])
  expect((await taskRoute([], null)(new NextRequest('https://test/api/tasks?customer_id=cust&open_summary=true'))).status).toBe(503)
  expect((await taskRoute([], { id: 'member', role: 'employee' }, true)(new NextRequest('https://test/api/tasks?customer_id=cust&open_summary=true'))).status).toBe(503)
})

test('late successful loader response is rejected after its scope aborts', async () => {
  const old = new AbortController(); let resolveOld!: (response: Response) => void
  const pending = loadCustomerTasks('old', old.signal, () => new Promise(resolve => { resolveOld = resolve }))
  for (let turn = 0; turn < 5 && !resolveOld; turn++) await Promise.resolve()
  old.abort(); resolveOld(new Response(JSON.stringify({ tasks: [], has_more: false })))
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
})

test('next booking selection is deterministic and excludes completed and cancelled rows', async () => {
  const controller = new AbortController(); const now = new Date('2026-09-10T12:00:00Z')
  const next = await loadCustomerNextBooking('cust', now, controller.signal, async () => new Response(JSON.stringify({ bookings: [
    { ...direct, booking_id: 'completed', scheduled_start: '2026-09-10T13:00:00Z', status: 'completed' },
    { ...direct, booking_id: 'job-completed', scheduled_start: '2026-09-10T13:30:00Z', status: 'confirmed', job_status: 'completed' },
    { ...direct, booking_id: 'later', scheduled_start: '2026-09-12T10:00:00Z' },
    { ...direct, booking_id: 'next', scheduled_start: '2026-09-11T10:00:00Z' },
  ] })))
  expect(next?.booking_id).toBe('next')
})

test('relationship loader uses canonical quote handoff and preserves role denial', async () => {
  const controller = new AbortController(); const urls: string[] = []
  const result = await loadCustomerRelationship('cust / å', controller.signal, async input => {
    const url = String(input); urls.push(url)
    if (url.includes('/decisions')) return new Response(JSON.stringify({ approvals: [{ id: 'a1', title: 'Välj tid', created_at: '2026-09-10' }], has_more: false }))
    if (url.startsWith('/api/quotes?')) return new Response(JSON.stringify({ quotes: [{ quote_id: 'old', title: 'Äldre', quote_number: null, status: 'sent', created_at: '2026-09-01' }, { quote_id: 'new', title: 'Senaste', quote_number: null, status: 'opened', created_at: '2026-09-09' }] }))
    return new Response('{}', { status: 403 })
  })
  expect(urls).toContain('/api/customers/cust%20%2F%20%C3%A5/decisions')
  expect(result.quote?.quote_id).toBe('new')
  expect(result.handoffUnavailable).toBe(true)
  expect(nextAdministrativeStep(result, [], null)).toBe('Öppna ärendet: Välj tid')
})

test('unknown relationship input prevents a definitive administrative next step', async () => {
  const controller = new AbortController()
  const partial = await loadCustomerRelationship('cust', controller.signal, async input => String(input).includes('/decisions')
    ? new Response('{}', { status: 503 })
    : new Response(JSON.stringify({ quotes: [] })))
  expect(partial.decisionsError).toBe(true)
  expect(nextAdministrativeStep(partial, [], null)).toContain('inte bekräftas')
  const source = readFileSync('components/customers/CustomerOpenWorkSummary.tsx', 'utf8')
  expect(source).toContain('Nästa steg kan inte bekräftas eftersom allt underlag inte kunde läsas.')
  expect(source).toContain('Öppna besluts­kön')
  expect(source).not.toContain('/dashboard/approvals?focus=')
})

for (const scenario of ['rejected', 'malformed'] as const) test(`handoff ${scenario} retains verified decisions and quote without claiming a next step`, async () => {
  const controller = new AbortController()
  const result = await loadCustomerRelationship('cust', controller.signal, async input => {
    const url = String(input)
    if (url.includes('/decisions')) return new Response(JSON.stringify({ approvals: [{ id: 'a1', title: 'Kundärende', created_at: '2026-09-10' }], has_more: false }))
    if (url.startsWith('/api/quotes?')) return new Response(JSON.stringify({ quotes: [{ quote_id: 'q1', title: 'Offert', status: 'sent', created_at: '2026-09-10' }] }))
    if (scenario === 'rejected') throw new Error('network')
    return new Response(JSON.stringify({ summary: {} }))
  })
  expect(result.decisions.map(item => item.id)).toEqual(['a1'])
  expect(result.quote?.quote_id).toBe('q1')
  expect(result.handoffError).toBe(true)
  expect(nextAdministrativeStep(result, [], null)).toContain('inte bekräftas')
})

test('customer summary is keyed by tenant and customer and exposes independent read states and exact links', () => {
  const page = readFileSync('app/dashboard/customers/[id]/page.tsx', 'utf8')
  expect(page).toContain("key={`open:${business?.business_id || ''}:${customerId}`}")
  const component = readFileSync('components/customers/CustomerOpenWorkSummary.tsx', 'utf8')
  expect(component).toContain('Uppgifterna kunde inte läsas.')
  expect(component).toContain('Bokningarna kunde inte läsas.')
  expect(component).toContain('/dashboard/bookings/${encodeURIComponent(booking.value.booking_id)}')
  expect(component).toContain('Visar upp till 3')
})

test('actual customer decision route scans row 1001 and preserves tenant, snooze, contradiction and routing gates', async () => {
  const filler = Array.from({ length: 1000 }, (_, i) => ({ id: `f${i}`, business_id: 'tenant-a', status: 'pending', approval_type: 'customer_fact', title: 'Other', created_at: `2026-09-${String(30 - (i % 20)).padStart(2, '0')}T12:00:00Z`, payload: { customer_id: 'other' } }))
  const rows = [...filler,
    { id: 'target', business_id: 'tenant-a', status: 'pending', approval_type: 'customer_fact', title: 'Target', created_at: '2020-01-01', payload: { customer_id: 'cust' } },
    { id: 'snoozed', business_id: 'tenant-a', status: 'pending', approval_type: 'customer_fact', title: 'Later', created_at: '2030-01-01', snoozed_until: '2099-01-01', payload: { customer_id: 'cust' } },
    { id: 'foreign', business_id: 'tenant-b', status: 'pending', approval_type: 'customer_fact', title: 'Foreign', created_at: '2030-01-02', payload: { customer_id: 'cust' } },
    { id: 'contradictory', business_id: 'tenant-a', status: 'pending', approval_type: 'send_sms', title: 'Wrong', created_at: '2030-01-03', payload: { project_id: 'p1', customer_id: 'other' } },
    { id: 'denied', business_id: 'tenant-a', status: 'pending', approval_type: 'customer_fact', title: 'Denied', created_at: '2030-01-04', payload: { customer_id: 'cust' } },
  ]
  const get = customerDecisionRoute({ customer: [{ customer_id: 'cust', business_id: 'tenant-a' }], pending_approvals: rows, project: [{ project_id: 'p1', customer_id: 'cust', business_id: 'tenant-a' }] }, { denied: ['denied'] })
  const response = await get(new NextRequest('https://test/api/customers/cust/decisions'), { params: Promise.resolve({ id: 'cust' }) })
  expect(response.status).toBe(200)
  expect((await response.json()).approvals.map((row: Row) => row.id)).toEqual(['target'])
  const failed = customerDecisionRoute({ customer: [{ customer_id: 'cust', business_id: 'tenant-a' }], pending_approvals: rows }, { failPage: 500 })
  expect((await failed(new NextRequest('https://test/api/customers/cust/decisions'), { params: Promise.resolve({ id: 'cust' }) })).status).toBe(503)
})

test('customer decision reader source retains complete scan contract', () => {
  const route = readFileSync('app/api/customers/[id]/decisions/route.ts', 'utf8')
  expect(route).toContain(".eq('business_id', business.business_id).eq('status', 'pending')")
  expect(route).toContain('snoozed_until.is.null,snoozed_until.lt.')
  expect(route).toContain('.range(offset, offset + 499)')
  expect(route).toContain('kundReferensForApproval')
  expect(route).toContain('canActOnApproval')
  expect(route).toContain('direct === customerId')
  expect(route).not.toContain('?focus=')
})

test('legacy customer and timeline reads do not present a failed read as verified empty state', () => {
  const page = readFileSync('app/dashboard/customers/[id]/page.tsx', 'utf8')
  expect(page).toContain("key={`${business?.business_id || ''}:${customerId}`}")
  expect(page).toContain(".eq('business_id', business.business_id)")
  expect(page).toContain('sequence !== fetchSequence.current')
  expect(page).toContain('Antal och tomma listor kan inte bekräftas.')
  const timelineRoute = readFileSync('app/api/customers/[id]/timeline/route.ts', 'utf8')
  expect(timelineRoute).toContain('incomplete_sources: Array.from(new Set(incompleteSources))')
  expect(timelineRoute).toContain("incompleteSources.push('Bokningar')")
  expect(timelineRoute).toContain("incompleteSources.push('SMS-konversationer')")
  const timeline = readFileSync('components/CustomerTimeline.tsx', 'utf8')
  expect(timeline).toContain('listan är inte komplett')
  expect(timeline).toContain('Historiken kunde inte läsas.')
})
