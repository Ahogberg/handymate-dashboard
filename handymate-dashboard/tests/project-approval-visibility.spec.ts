import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'
import vm from 'node:vm'
import { createProjectApprovalReadGuard, loadProjectApprovalPage } from '../lib/projects/load-project-approvals'

type Row = { id: string; business_id: string; status: string; created_at: string; approval_type: string; payload: Record<string, unknown> }

function route(rows: Row[], permitted: (row: Row) => boolean = () => true) {
  let selected: Row[] = rows
  let from = 0
  let to = 99
  const operations: string[] = []
  const query: any = {
    select() { operations.push('select'); return query },
    eq(key: string, value: unknown) { operations.push(`eq:${key}`); selected = selected.filter(row => (row as any)[key] === value); return query },
    in() { return query },
    or() { return query },
    contains(key: string, value: Record<string, unknown>) { operations.push(`contains:${key}`); selected = selected.filter(row => Object.entries(value).every(([field, expected]) => (row as any)[key]?.[field] === expected)); return query },
    order() { return query },
    range(start: number, end: number) { operations.push('range'); from = start; to = end; return query },
    then(resolve: (result: unknown) => void) { resolve({ data: selected.slice(from, to + 1), error: null }) },
  }
  const code = ts.transpileModule(readFileSync('app/api/approvals/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const dependencies: Record<string, unknown> = {
    'next/server': { NextResponse },
    '@/lib/supabase': { getServerSupabase: () => ({ from: () => query }) },
    '@/lib/auth': { getAuthenticatedBusiness: async () => ({ business_id: 'tenant-a' }) },
    '@/lib/permissions': { getCurrentUser: async () => ({ id: 'actor' }) },
    '@/lib/approvals/routing': { canActOnApproval: async (_db: unknown, _user: unknown, row: Row) => permitted(row) },
    '@/lib/testdata': { arTestdataApproval: () => false },
    '@/lib/notifications/push-internal': { internalPushHeaders: () => ({}) },
    '@/lib/jarvis/approval-view': { approvalDisplay: () => ({}) },
  }
  const module = { exports: {} as any }
  new Function('require', 'module', 'exports', code)((name: string) => dependencies[name], module, module.exports)
  return { get: module.exports.GET as (request: NextRequest) => Promise<Response>, operations }
}

const row = (id: string, projectId: string): Row => ({ id, business_id: 'tenant-a', status: 'pending', created_at: id, approval_type: 'send_sms', payload: { project_id: projectId } })

test('project filter is applied in the database before pagination, so unrelated newer decisions cannot hide the project', async () => {
  const harness = route([...Array.from({ length: 60 }, (_, i) => row(`z-${i}`, 'other')), row('project-2', 'project-a'), row('project-1', 'project-a')])
  const response = await harness.get(new NextRequest('https://test/api/approvals?status=pending&limit=50&project_id=project-a'))
  const body = await response.json()
  expect(body.approvals.map((approval: Row) => approval.id)).toEqual(['project-2', 'project-1'])
  expect(body.next_offset).toBeNull()
  expect(harness.operations).toContain('contains:payload')
})

test('routing still isolates project rows and an empty visible page retains its continuation', async () => {
  const harness = route(Array.from({ length: 51 }, (_, i) => row(`p-${i}`, 'project-a')), () => false)
  const response = await harness.get(new NextRequest('https://test/api/approvals?status=pending&limit=50&project_id=project-a'))
  expect(await response.json()).toEqual({ approvals: [], next_offset: 50 })
})

test('page loader scopes its URL and rejects HTTP and malformed successful responses', async () => {
  const controller = new AbortController()
  let requested = ''
  const valid = await loadProjectApprovalPage<Row>('project / å', 'token', 50, controller.signal, async (input, init) => {
    requested = String(input)
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer token')
    return new Response(JSON.stringify({ approvals: [], next_offset: 100 }))
  })
  expect(requested).toContain('project_id=project+%2F+%C3%A5')
  expect(requested).toContain('offset=50')
  expect(valid).toEqual({ approvals: [], nextOffset: 100 })

  await expect(loadProjectApprovalPage('p', undefined, 0, controller.signal, async () => new Response('{}', { status: 503 }))).rejects.toThrow('approval-read-failed')
  await expect(loadProjectApprovalPage('p', undefined, 0, controller.signal, async () => new Response(JSON.stringify({ approvals: null, next_offset: null })))).rejects.toThrow('approval-read-malformed')
  await expect(loadProjectApprovalPage('p', undefined, 50, controller.signal, async () => new Response(JSON.stringify({ approvals: [], next_offset: 50 })))).rejects.toThrow('approval-read-malformed')
})

test('read guard rejects a late response after the project scope changes', async () => {
  const guard = createProjectApprovalReadGuard()
  const applied: string[] = []
  let releaseOld!: () => void
  const old = new Promise<void>(resolve => { releaseOld = resolve })
  const run = async (name: string, wait: Promise<void>) => {
    const sequence = guard.begin()
    await wait
    if (guard.isCurrent(sequence)) applied.push(name)
  }
  const oldRead = run('old-project', old)
  await run('new-project', Promise.resolve())
  releaseOld()
  await oldRead
  expect(applied).toEqual(['new-project'])
})

function actualComponentReader(load: (...args: any[]) => Promise<any>) {
  const source = readFileSync('components/projects/ProjectApprovalsBlock.tsx', 'utf8')
  const start = source.indexOf('async (offset = 0) => {', source.indexOf('const fetchApprovals'))
  const end = source.indexOf('\n  }, [business?.business_id, projectId, scope])', start)
  const errors: Array<string | null> = []
  const states: any[] = []
  const scopes: Array<string | null> = []
  const guard = createProjectApprovalReadGuard()
  const context: Record<string, any> = {
    business: { business_id: 'tenant-a' }, projectId: 'project-a', scope: 'tenant-a:project-a',
    readGuard: { current: guard }, approvalsRef: { current: [] },
    supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
    loadProjectApprovalPage: load, AbortController, DOMException, Map, Array,
    setApprovals: () => {}, setNextOffset: () => {}, setBusyId: () => {}, setEditingId: () => {}, setReadingMore: () => {},
    setError: (value: string | null) => errors.push(value),
    setReadState: (value: any) => states.push(typeof value === 'function' ? value(states.at(-1) || { status: 'loading', count: 0 }) : value),
    setLoadedScope: (value: string | null) => scopes.push(value),
  }
  const reader = vm.runInNewContext(ts.transpileModule(`(${source.slice(start, end)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return { reader: reader as (offset?: number) => Promise<void>, errors, states, scopes, guard }
}

test('actual component reader exposes a failed first read instead of leaving the card on its loading boundary', async () => {
  const harness = actualComponentReader(async () => { throw new Error('database unavailable') })
  await harness.reader()
  expect(harness.errors.at(-1)).toBe('Kunde inte läsa besluten — försök igen')
  expect(harness.states.at(-1)).toEqual({ status: 'error', count: 0 })
  expect(harness.scopes.at(-1)).toBe('tenant-a:project-a')
})

test('actual component reader ignores a late page after its scope is invalidated', async () => {
  let release!: (page: unknown) => void
  const harness = actualComponentReader(() => new Promise(resolve => { release = resolve }))
  const pending = harness.reader()
  for (let turn = 0; turn < 5 && !release; turn++) await Promise.resolve()
  expect(release).toBeDefined()
  harness.guard.invalidate()
  release({ approvals: [row('late', 'project-a')], nextOffset: null })
  await pending
  expect(harness.states).toEqual([{ status: 'loading', count: 0 }])
  expect(harness.scopes).toEqual([null])
})

test('a resolved decision reloads page zero instead of continuing with an offset from the shrinking pending set', () => {
  const source = readFileSync('components/projects/ProjectApprovalsBlock.tsx', 'utf8')
  const action = source.slice(source.indexOf('async function act('), source.indexOf('\n  if (readState.status', source.indexOf('async function act(')))
  expect(action).toContain('await fetchApprovals(0)')
  expect(action).not.toContain('prev.filter')
})
