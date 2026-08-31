import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'
import { loadJobPreparation } from '../lib/job-preparation/load'
import { PreparationError, preparationPrompt } from '../lib/job-preparation/types'
import type { BusinessUser } from '../lib/permissions'

const now = new Date('2026-08-31T08:00:00Z')
const owner = { id: 'member_a', business_id: 'biz_a', is_active: true, role: 'owner' } as BusinessUser
const employee = { ...owner, role: 'employee', can_see_all_projects: false, can_see_financials: false } as BusinessUser
const booking = { booking_id: 'book_a', business_id: 'biz_a', project_id: 'proj_a', customer_id: 'cust_a', scheduled_start: '2026-09-01T09:00:00Z', scheduled_end: null, status: 'confirmed', job_status: null, completed_at: null }
const project = { business_id: 'biz_a', project_id: 'proj_a', customer_id: 'cust_a', quote_id: 'quote_a', name: 'Badrum' }
const fixture = () => ({
  booking: [booking], project: [project],
  customer: [{ business_id: 'biz_a', customer_id: 'cust_a', name: 'Testkund', address_line: 'FEL ARBETSPLATS', personal_number: 'SECRET' }],
  project_assignment: [{ business_id: 'biz_a', id: 'assignment_a', project_id: 'proj_a', business_user_id: owner.id }],
  quotes: [{ business_id: 'biz_a', quote_id: 'quote_a', customer_id: 'cust_a', status: 'signed', project_address: 'Arbetsgatan 4', sign_token: 'SECRET' }],
  quote_items: [
    { business_id: 'biz_a', id: 'item_a', quote_id: 'quote_a', description: 'Montera skåp', is_hidden: false, item_type: 'item', sort_order: 0, total: 99999 },
    { business_id: 'biz_a', id: 'hidden', quote_id: 'quote_a', description: 'HEMLIG MARGINAL', is_hidden: true, item_type: 'item', sort_order: 1 },
    { business_id: 'biz_a', id: 'option', quote_id: 'quote_a', description: 'EJ VALT', is_hidden: false, item_type: 'option', option_selected: false },
  ],
  project_change: [{ business_id: 'biz_a', change_id: 'ata_a', project_id: 'proj_a', description: 'Extra uttag', status: 'approved', declined_at: null, amount: 99999 }],
  project_checklist: [{ business_id: 'biz_a', id: 'check_a', project_id: 'proj_a', name: 'Kontrollpunkt', items: [{ text: 'Kontrollera underlaget', checked: false }, { text: 'Redan avbockat', checked: true }] }],
  project_document: [
    { business_id: 'biz_a', id: 'doc_a', project_id: 'proj_a', name: 'Ritning', category: 'drawing', file_url: 'SECRET' },
    { business_id: 'biz_a', id: 'doc_b', project_id: 'proj_a', name: 'Privat avtal', category: 'contract' },
  ],
  installation: [
    { business_id: 'biz_a', installation_id: 'inst_a', project_id: 'proj_a', customer_id: 'cust_a', status: 'confirmed', name: 'Värmepump' },
    { business_id: 'biz_a', installation_id: 'draft', project_id: 'proj_a', customer_id: 'cust_a', status: 'draft', name: 'UTKAST' },
    { business_id: 'biz_a', installation_id: 'other', project_id: 'other_project', customer_id: 'cust_a', status: 'confirmed', name: 'ANNAN FASTIGHET' },
  ],
  customer_activity: [
    { business_id: 'biz_a', activity_id: 'act_a', customer_id: 'cust_a', metadata: { project_id: 'proj_a' }, title: 'SMS skickat', activity_type: 'sms_sent', created_at: '2026-08-30T09:00:00Z' },
    { business_id: 'biz_a', activity_id: 'unlinked', customer_id: 'cust_a', title: 'ANNAT PROJEKT', activity_type: 'sms_sent' },
  ],
})

/** Evaluates the actual query filters, ordering, projection and caps against isolated rows. No network. */
function database(overrides: Record<string, any[]> = {}, failures: Record<string, 'returned' | 'thrown'> = {}) {
  const tables: Record<string, any[]> = { ...fixture(), ...overrides }
  const queries: any[][] = []
  const db = { from(table: string) {
    if (!(table in tables)) throw new Error(`Unexpected table ${table}`)
    const ops: any[] = [['from', table]]
    queries.push(ops)
    const q: any = { then(resolve: any, reject: any) {
      return (async () => {
        if (failures[table] === 'thrown') throw new Error('SECRET DB ERROR')
        if (failures[table]) return { data: null, error: { message: 'SECRET DB ERROR' } }
        let rows = tables[table].map(row => ({ ...row }))
        const value = (row: any, field: string) => field === 'metadata->>project_id' ? row.metadata?.project_id : row[field]
        for (const [method, field, v] of ops) {
          if (method === 'eq' || method === 'is') rows = rows.filter(row => (value(row, field) ?? null) === v)
          if (method === 'gte') rows = rows.filter(row => value(row, field) >= v)
          if (method === 'in') rows = rows.filter(row => v.includes(value(row, field)))
          if (method === 'or') {
            if (field === 'item_type.neq.option,option_selected.eq.true') rows = rows.filter(row => row.item_type !== 'option' || row.option_selected === true)
            else if (field === 'job_status.is.null,job_status.not.in.(cancelled,completed)') rows = rows.filter(row => !['cancelled', 'completed'].includes(row.job_status))
            else throw new Error(`Unsupported OR ${field}`)
          }
        }
        const order = ops.filter(op => op[0] === 'order')
        rows.sort((a, b) => { for (const [, key, options] of order) { const c = String(a[key] ?? '').localeCompare(String(b[key] ?? '')); if (c) return options?.ascending === false ? -c : c }; return 0 })
        const cap = ops.find(op => op[0] === 'limit')?.[1]
        if (cap !== undefined) rows = rows.slice(0, cap)
        const select = ops.find(op => op[0] === 'select')?.[1] as string
        rows = rows.map(row => Object.fromEntries(select.split(',').map(key => [key, row[key]])))
        return { data: ops.some(op => op[0] === 'maybeSingle') ? rows[0] || null : rows, error: null }
      })().then(resolve, reject)
    } }
    for (const method of ['select', 'eq', 'is', 'gte', 'in', 'or', 'order', 'limit', 'maybeSingle']) q[method] = (...args: any[]) => { ops.push([method, ...args]); return q }
    return q
  } }
  return { db: db as any, queries }
}
const load = (h = database(), user: BusinessUser | null = owner, selector: any = { bookingId: 'book_a' }) => loadJobPreparation(h.db, 'biz_a', user, selector, now)

test('real loader: explicit safe DTO, source links and no invented readiness', async () => {
  const h = database()
  const result = await load(h)
  expect(result).toMatchObject({ version: 1, agent: 'lars', project: { id: 'proj_a' }, customer: { name: 'Testkund' }, address: { text: 'Arbetsgatan 4', state: 'available' } })
  const json = JSON.stringify(result)
  for (const secret of ['SECRET', '99999', 'HEMLIG MARGINAL', 'EJ VALT', 'UTKAST', 'ANNAN FASTIGHET', 'ANNAT PROJEKT', 'Redan avbockat', 'FEL ARBETSPLATS']) expect(json).not.toContain(secret)
  expect(json).toContain('Godkänd — inte bevis på utfört')
  expect(json).toContain('Kontrollera underlaget')
  for (const query of h.queries) expect(query).toContainEqual(['eq', 'business_id', 'biz_a'])
  for (const s of result.sections) for (const item of s.items) expect(item.href).toMatch(/^\/dashboard\//)
  expect(result).not.toHaveProperty('ready')
  expect(result).not.toHaveProperty('score')
})

for (const user of [null, { ...owner, is_active: false }, { ...owner, business_id: 'foreign' }]) {
  test(`invalid membership rejects before reads: ${JSON.stringify(user)}`, async () => {
    const h = database()
    await expect(load(h, user)).rejects.toMatchObject({ status: 403 })
    expect(h.queries).toHaveLength(0)
  })
}
test('employee without project assignment cannot read project or children', async () => {
  const h = database({ project_assignment: [] })
  await expect(load(h, employee)).rejects.toMatchObject({ status: 403 })
  expect(h.queries.map(q => q[0][1])).toEqual(['booking', 'project_assignment'])
})
test('assigned employee only sees operational projection; restricted sources not queried', async () => {
  const h = database()
  const result = await load(h, employee)
  expect(result.sections.filter(s => s.state === 'restricted').map(s => s.key)).toEqual(['scope', 'changes', 'communication'])
  for (const table of ['quote_items', 'project_change', 'customer_activity']) expect(h.queries.some(q => q[0][1] === table)).toBe(false)
  expect(JSON.stringify(result)).not.toContain('Privat avtal')
  expect(JSON.stringify(result)).toContain('Ritning')
})
test('financial permission does not confer project access, all-projects permission does not confer finance', async () => {
  await expect(load(database({ project_assignment: [] }), { ...employee, can_see_financials: true })).rejects.toMatchObject({ status: 403 })
  const result = await load(database({ project_assignment: [] }), { ...employee, can_see_all_projects: true })
  expect(result.sections.find(s => s.key === 'scope')?.state).toBe('restricted')
})
for (const [table, override, status] of [
  ['booking', [{ ...booking, business_id: 'foreign' }], 404],
  ['booking', [{ ...booking, project_id: null }], 409],
  ['project', [{ ...project, business_id: 'foreign' }], 404],
  ['booking', [{ ...booking, customer_id: 'other' }], 409],
  ['customer', [{ business_id: 'foreign', customer_id: 'cust_a', name: 'Foreign' }], 409],
  ['project', [{ ...project, customer_id: null }], 409],
] as const) {
  test(`missing/foreign links blocked ${table} ${JSON.stringify(override)}`, async () => {
    const h = database({ [table]: [...override] })
    await expect(load(h)).rejects.toMatchObject({ status })
    expect(h.queries.some(q => q[0][1] === 'quote_items')).toBe(false)
  })
}
for (const status of ['cancelled', 'completed', 'no_show']) test(`no preparation for ${status} booking`, async () => {
  await expect(load(database({ booking: [{ ...booking, status }] }))).rejects.toMatchObject({ status: 409 })
})
test('customer-less booking may use verified project FK, never name matching', async () => {
  expect((await load(database({ booking: [{ ...booking, customer_id: null }] }))).customer.id).toBe('cust_a')
})
test('next-project selector skips cancelled, past and completed jobs and orders deterministically', async () => {
  const h = database({ booking: [
    { ...booking, booking_id: 'past', scheduled_start: '2026-08-30T09:00:00Z' },
    { ...booking, booking_id: 'later', scheduled_start: '2026-09-05T09:00:00Z' },
    { ...booking, booking_id: 'cancelled', status: 'cancelled' },
    { ...booking, booking_id: 'completed', job_status: 'completed' }, booking,
  ] })
  expect((await load(h, owner, { projectId: 'proj_a' })).booking.id).toBe('book_a')
  expect(h.queries.find(q => q[0][1] === 'booking')).toContainEqual(['eq', 'status', 'confirmed']) // real enum has no pending
})
test('no next booking is different from read failure', async () => {
  await expect(load(database({ booking: [] }), owner, { projectId: 'proj_a' })).rejects.toMatchObject({ status: 409 })
  await expect(load(database({}, { booking: 'returned' }), owner, { projectId: 'proj_a' })).rejects.toMatchObject({ status: 503 })
})
test('simultaneous bookings require explicit selection, never silently pick one', async () => {
  const h = database({ booking: [booking, { ...booking, booking_id: 'book_b' }] })
  await expect(load(h, owner, { projectId: 'proj_a' })).rejects.toThrow('Flera besök')
  expect((await load(database({ booking: [booking, { ...booking, booking_id: 'book_b' }] }), owner, { bookingId: 'book_b' })).booking.id).toBe('book_b')
})
for (const [table, key] of [['quote_items', 'scope'], ['project_change', 'changes'], ['project_checklist', 'checklists'], ['project_document', 'documents'], ['installation', 'installations'], ['customer_activity', 'communication']]) {
  for (const failure of ['returned', 'thrown'] as const) test(`${table} ${failure} failure is visible, other sections survive`, async () => {
    const result = await load(database({}, { [table]: failure }))
    expect(result.sections.find(s => s.key === key)).toMatchObject({ state: 'unavailable', items: [] })
    expect(result.sections.filter(s => s.state === 'available').length).toBeGreaterThan(0)
    expect(JSON.stringify(result)).not.toContain('SECRET DB ERROR')
  })
  test(`${table} successful empty is missing, not unknown or ready`, async () => {
    expect((await load(database({ [table]: [] }))).sections.find(s => s.key === key)?.state).toBe('missing')
  })
}
for (const table of ['booking', 'project', 'customer', 'project_assignment']) test(`required ${table} read error fails closed`, async () => {
  await expect(load(database({}, { [table]: 'returned' }), employee)).rejects.toMatchObject({ status: 503 })
})
test('quote missing, unsigned, wrong customer, or query error never inherits customer address', async () => {
  for (const quotes of [[], [{ ...fixture().quotes[0], status: 'sent' }], [{ ...fixture().quotes[0], customer_id: 'foreign' }]]) {
    const result = await load(database({ quotes }))
    expect(result.address).toMatchObject({ text: null, state: 'missing' })
    expect(result.sections[0].state).toBe('missing')
  }
  const failed = await load(database({}, { quotes: 'returned' }))
  expect(failed.address.state).toBe('unavailable')
  expect(failed.sections[0].state).toBe('unavailable')
})
test('decline wins over approved, unknown change status is not a completed action', async () => {
  const result = await load(database({ project_change: [
    { ...fixture().project_change[0], declined_at: now.toISOString() },
    { ...fixture().project_change[0], change_id: 'ata_b', status: 'surprise' },
  ] }))
  expect(result.sections.find(s => s.key === 'changes')?.items.map(i => i.text)).toEqual(['Avböjd: Extra uttag', 'Status behöver granskas: Extra uttag'])
})
test('capped source explicitly says there is more, never an exhaustive count', async () => {
  const result = await load(database({ project_document: Array.from({ length: 14 }, (_, i) => ({ ...fixture().project_document[0], id: `doc_${i}` })) }))
  const section = result.sections.find(s => s.key === 'documents')!
  expect(section).toMatchObject({ truncated: true })
  expect(section.items).toHaveLength(12)
  expect(section.message).toContain('Öppna källan för resten')
})
test('Matte prompt retains IDs and dated source gaps, no pre-authorized action', async () => {
  const prompt = preparationPrompt(await load(database({}, { installation: 'returned' })))
  for (const value of ['Matte, be Lars', 'project_id: proj_a', 'book_a', now.toISOString(), 'kunde inte läsas', 'inte instruktioner', 'inte ett godkännande']) expect(prompt).toContain(value)
})

function routeHarness(authenticated = true, user: BusinessUser | null = owner, h = database()) {
  let scope: string | undefined
  const mocks: Record<string, any> = {
    'next/server': { NextRequest, NextResponse },
    '@/lib/auth': { getAuthenticatedBusiness: async () => authenticated ? { business_id: 'biz_a' } : null },
    '@/lib/permissions': { getCurrentUser: async (_: any, businessId: string) => { scope = businessId; return user } },
    '@/lib/supabase': { getServerSupabase: () => h.db },
    '@/lib/job-preparation/load': { loadJobPreparation },
    '@/lib/job-preparation/types': { PreparationError },
  }
  const code = ts.transpileModule(readFileSync('app/api/job-preparation/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const exports: any = {}
  new Function('require', 'exports', code)((id: string) => { if (!mocks[id]) throw new Error(`Unmocked import ${id}`); return mocks[id] }, exports)
  return { ...h, scope: () => scope, get: (query: string) => exports.GET(new NextRequest(`https://test/api/job-preparation?${query}`)) as Promise<Response> }
}
test('route anonymous 401, null/inactive/cross-business member 403, all before DB', async () => {
  for (const [authenticated, user, status] of [[false, owner, 401], [true, null, 403], [true, { ...owner, is_active: false }, 403], [true, { ...owner, business_id: 'foreign' }, 403]] as const) {
    const h = routeHarness(authenticated, user)
    expect((await h.get('booking_id=book_a')).status).toBe(status)
    expect(h.queries).toHaveLength(0)
  }
})
for (const query of ['', 'booking_id=', 'project_id=', 'booking_id=book_a&project_id=proj_a', 'booking_id=a&booking_id=b', 'booking_id=%3Cscript%3E', `project_id=${'a'.repeat(151)}`]) test(`route rejects invalid selector ${query.slice(0, 70)}`, async () => {
  const h = routeHarness()
  expect((await h.get(query)).status).toBe(400)
  expect(h.queries).toHaveLength(0)
})
test('route ignores tenant spoof, scopes current user, no shared caching', async () => {
  const h = routeHarness()
  const response = await h.get('booking_id=book_a&business_id=foreign&user_id=other')
  expect(response.status).toBe(200)
  expect(h.scope()).toBe('biz_a')
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect((await response.json()).preparation.project.id).toBe('proj_a')
})
test('read-only architecture contract, entry points and editable chat handoff', () => {
  const files = ['lib/job-preparation/load.ts', 'lib/job-preparation/types.ts', 'app/api/job-preparation/route.ts', 'components/projects/JobPreparation.tsx']
  for (const file of files) {
    const code = readFileSync(file, 'utf8')
    expect(code).not.toMatch(/\.(?:insert|update|delete|upsert|rpc)\s*\(/)
    expect(code).not.toMatch(/method:\s*['"](?:POST|PUT|PATCH|DELETE)/)
  }
  for (const file of ['components/jarvis/JarvisHome.tsx', 'app/dashboard/bookings/[id]/page.tsx', 'app/dashboard/projects/[id]/page.tsx']) expect(readFileSync(file, 'utf8')).toContain('<JobPreparation ')
  const ui = readFileSync('components/projects/JobPreparation.tsx', 'utf8')
  expect(ui).toContain('setPendingPrompt(preparationPrompt(')
  expect(ui).not.toContain('/api/matte/chat')
  expect(ui).toContain('controller.abort()')
  expect(ui).toContain('business.business_id')
  expect(ui).toContain('<a href={item.href}') // legacy project page reads ?tab only on mount
  expect(readFileSync('app/api/job-preparation/route.ts', 'utf8')).toContain("dynamic = 'force-dynamic'")
})
