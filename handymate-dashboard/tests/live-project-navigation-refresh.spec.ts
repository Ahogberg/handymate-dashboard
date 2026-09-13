import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { deriveTimeEntryGapEvidence } from '../lib/egenkontroll/suggest-time-entry'

const source = fs.readFileSync('app/dashboard/projects/[id]/page.tsx', 'utf8')

test('every project tab opens the group which renders its content', () => {
  const groups = vm.runInNewContext('(' + source.match(/const NEW_GROUPS[^=]*= ([\s\S]*?\n\])/ )![1] + ')')
  const mapping = vm.runInNewContext('(' + source.match(/const GROUP_OF_TAB[^=]*= ([\s\S]*?\n\})/ )![1] + ')')
  for (const group of groups) for (const tab of group.tabs) expect(mapping[tab], tab).toBe(group.key)
})

test('an older project read cannot overwrite a refresh after saved work', async () => {
  const start = source.indexOf('    const version = ++projectReadVersion.current')
  const end = source.indexOf('\n  }, [projectId])', start)
  const pending: Array<(response: unknown) => void> = []
  const projects: unknown[] = []
  const setters = ['setQuote', 'setMilestones', 'setChanges', 'setAtaPricesRedacted', 'setTimeEntries', 'setSummary', 'setMaterials', 'setMaterialSummary', 'setLoading']
  const context: Record<string, unknown> = Object.fromEntries(setters.map(name => [name, () => {}]))
  Object.assign(context, { projectId: 'test', projectReadVersion: { current: 0 }, setProject: (value: unknown) => projects.push(value), fetch: () => new Promise(resolve => pending.push(resolve)) })
  const read = vm.runInNewContext(ts.transpileModule('(async (preserveOnError = false) => {' + source.slice(start, end) + '\n})', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  const oldRead = read(), refresh = read(true)
  pending[1]({ ok: true, json: async () => ({ project: { id: 'new', hours: 1 }, materials: [] }) })
  await refresh
  pending[0]({ ok: true, json: async () => ({ project: { id: 'old', hours: 0 }, materials: [] }) })
  await oldRead
  expect(projects).toEqual([{ id: 'new', hours: 1 }])
  const failedRefresh = read(true)
  pending[2]({ ok: false })
  const failure = await failedRefresh.then(() => 'unexpected success', (error: Error) => error.message)
  expect(failure).toBe('Projektet kunde inte läsas om.')
  expect(projects).toEqual([{ id: 'new', hours: 1 }])
})

test('time-gap callback keeps read failures unknown and rejects an older scope result', async () => {
  const start = source.indexOf('    const version = ++timeGapReadVersion.current')
  const end = source.indexOf('\n  }, [business?.business_id, projectId])', start)
  type Pending = { table: string; resolve: (result: unknown) => void }
  const pending: Pending[] = []
  const gaps: unknown[] = []
  const approvals: boolean[] = []
  const supabase = {
    from(table: string) {
      const query: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'gte', 'lt', 'contains']) query[method] = () => query
      query.then = (resolve: (result: unknown) => void) => pending.push({ table, resolve })
      return query
    },
  }
  const context = {
    timeGapReadVersion: { current: 0 },
    setYesterdayTimeGap: (value: unknown) => gaps.push(value),
    setHasPendingTimeApproval: (value: boolean) => approvals.push(value),
    business: { business_id: 'business-1' }, projectId: 'project-1', supabase,
    svDateStrPlusDays: () => '2026-09-09', svDateStr: () => '2026-09-10',
    svStartOfDay: (date: Date) => date,
    deriveTimeEntryGapEvidence,
    pickUnambiguousAssignee: () => null,
  }
  const read = vm.runInNewContext(
    ts.transpileModule('(async () => {' + source.slice(start, end) + '\n})', {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  )
  const resolveRead = (offset: number, bookings: unknown, entries: unknown) => {
    pending[offset].resolve(bookings)
    pending[offset + 1].resolve(entries)
    pending[offset + 2].resolve({ data: null, error: null, count: 0 })
  }

  const failed = read()
  await Promise.resolve()
  resolveRead(0, { data: null, error: { message: 'read failed' } }, { data: [], error: null })
  await failed
  expect(gaps.at(-1)).toBeNull()

  const empty = read()
  await Promise.resolve()
  resolveRead(3, { data: [], error: null }, { data: [], error: null })
  await empty
  expect(gaps.at(-1)).toEqual({ applicable: false, missing: false, personName: null })

  const malformed = read()
  await Promise.resolve()
  resolveRead(6, { data: null, error: null }, { data: [], error: null })
  await malformed
  expect(gaps.at(-1)).toBeNull()

  const oldRead = read()
  const newRead = read()
  await Promise.resolve()
  const completedBooking = [{ booking_id: 'b', project_id: 'project-1', job_status: 'completed', scheduled_start: '2026-09-09T07:00:00Z', scheduled_end: '2026-09-09T08:00:00Z' }]
  resolveRead(12, { data: completedBooking, error: null }, { data: [{ project_id: 'project-1' }], error: null })
  await newRead
  const resolvedAfterNew = gaps.filter(value => value !== null)
  resolveRead(9, { data: [], error: null }, { data: [], error: null })
  await oldRead
  expect(gaps.filter(value => value !== null)).toEqual(resolvedAfterNew)
  expect(gaps.at(-1)).toEqual({ applicable: true, missing: false, personName: null })
  expect(approvals.at(-1)).toBe(false)
})

test('inline customer save stops missing phone and does not expose server errors', async () => {
  const customerSource = fs.readFileSync('app/dashboard/quotes/new/components/QuoteNewCustomerSection.tsx', 'utf8')
  const start = customerSource.indexOf('  async function saveCustomer() {')
  const end = customerSource.indexOf('\n  return (', start)
  let requests = 0
  const errors: string[] = []
  const context = {
    customerSaving: false, customerName: 'Test', customerPhone: '   ', customerEmail: '',
    setCustomerSaving: () => {}, setCustomerError: (value: string) => errors.push(value),
    fetch: async () => { requests++; return { ok: false, status: 500, json: async () => ({ error: 'private database detail' }) } },
  }
  const save = vm.runInNewContext(ts.transpileModule('(' + customerSource.slice(start, end).trim() + ')', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  await save()
  expect(requests).toBe(0)
  context.customerPhone = '0700000000'
  await save()
  expect(requests).toBe(1)
  expect(errors.at(-1)).toBe('Kunden kunde inte sparas. Försök igen om en stund.')
})
