import { test, expect } from '@playwright/test'
import fs from 'fs'
import ts from 'typescript'
import * as report from '../lib/matte/work-report'
import { confirmWorkReport, pendingWorkReport } from '../lib/matte/work-report-confirmation'
import { verifyPendingExternalAction } from '../lib/agent/external-confirm'
import { resolveTimeEntryHourlyRate } from '../lib/time-entry/rate'
import { svDateStr } from '../lib/dates'
import { hittaNyligDubblett } from '../lib/agent/recent-duplicate'
import type { BusinessUser } from '../lib/permissions'
import { toolDefinitions } from '../app/api/agent/trigger/tool-definitions'
import { getAgentTools } from '../lib/agents/personalities'
import { isToolAllowedForActor } from '../lib/agent/external-actor'

const employee = { id: 'user_a', business_id: 'biz_a', is_active: true, role: 'employee', name: 'Anders', can_see_all_projects: false } as BusinessUser
function database(overrides: Record<string, any[]> = {}, fail?: string, throws = false) {
  const tables: Record<string, any[]> = {
    project: [{ project_id: 'proj_a', business_id: 'biz_a', customer_id: null, name: 'Köket' }],
    business_users: [{ ...employee, hourly_rate: null }],
    project_assignment: [{ id: 'assign_a', business_id: 'biz_a', project_id: 'proj_a', business_user_id: employee.id }],
    business_config: [{ business_id: 'biz_a', default_hourly_rate: null, pricing_settings: null, time_require_description: false, require_project: true }],
    time_entry: [], time_checkins: [], project_log: [], ...overrides,
  }
  const queries: any[][] = [], writes: string[] = []
  const db: any = { from(table: string) {
    const ops: any[] = [['from', table]]; queries.push(ops)
    const q: any = { then(resolve: any, reject: any) { return (async () => {
      if (fail === table) { if (throws) throw new Error('offline'); return { data: null, error: { message: 'offline' } } }
      const insert = ops.find(x => x[0] === 'insert')
      if (insert) {
        const key = table === 'time_entry' ? 'time_entry_id' : 'id'
        const row = insert[1]
        if (tables[table].some(r => r[key] === row[key])) return { data: null, error: { code: '23505', message: 'duplicate' } }
        tables[table].push({ ...row, created_at: new Date().toISOString() }); writes.push(table)
        return { data: null, error: null }
      }
      let rows = [...(tables[table] || [])]
      for (const [method, key, value, arg] of ops) {
        if (method === 'eq' || method === 'is') rows = rows.filter(r => (r[key] ?? null) === value)
        if (method === 'not' && value === 'is' && arg === null) rows = rows.filter(r => r[key] != null)
        if (method === 'gte') rows = rows.filter(r => r[key] >= value)
      }
      const limit = ops.find(x => x[0] === 'limit')?.[1]
      if (limit) rows = rows.slice(0, limit)
      const selection = ops.find(x => x[0] === 'select')?.[1]
      if (selection && selection !== '*') rows = rows.map(row => Object.fromEntries(selection.split(',').map((key: string) => [key, row[key]])))
      return { data: ops.some(x => x[0] === 'maybeSingle') ? rows[0] || null : rows, error: null }
    })().then(resolve, reject) } }
    for (const name of ['select', 'eq', 'is', 'not', 'gte', 'limit', 'maybeSingle', 'order', 'insert']) q[name] = (...args: any[]) => { ops.push([name, ...args]); return q }
    return q
  } }
  return { db, tables, queries, writes }
}
const load = (h = database(), user: BusinessUser | null = employee) => report.loadWorkReportContext(h.db, 'biz_a', user, 'proj_a', '2026-08-31')
const timeInput = { project_id: 'proj_a', duration_minutes: 240, description: 'Monterat skåp', work_date: '2026-08-31' }
const noteInput = { project_id: 'proj_a', work_performed: 'Monterat skåp. Avvikelse dokumenterad.', log_date: '2026-08-31' }

// Exercise the ACTUAL shared router with isolated dependencies, not a substitute writer.
function router() {
  const code = ts.transpileModule(fs.readFileSync('app/api/agent/trigger/tool-router.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const imports: Record<string, any> = {
    '@/lib/matte/work-report': report,
    '@/lib/agent/external-actor': { isToolAllowedForActor: () => true },
    '@/lib/time-entry/rate': { resolveTimeEntryHourlyRate },
    '@/lib/agent/recent-duplicate': { hittaNyligDubblett },
    '@/lib/dates': { svDateStr },
    '@/lib/project-ai-engine': { handleProjectEvent: async () => {} },
    // Byggdagboken (2026-09-02): addWorkNote skriver via den RIKTIGA helpern —
    // det är dess plain .insert() mot mock-DB:n som facitet nedan mäter.
    '@/lib/diary/write': require('../lib/diary/write'),
  }
  const exports: any = {}
  new Function('require', 'exports', code)((id: string) => imports[id] || new Proxy({}, { get: (_t, name) => () => { throw new Error(`Unexpected dependency: ${id}.${String(name)}`) } }), exports)
  return exports.executeTool
}

test('assigned employee gets only own project time, never finance or customer history', async () => {
  const h = database({ time_entry: [
    { time_entry_id: 'own', business_id: 'biz_a', project_id: 'proj_a', business_user_id: employee.id, work_date: '2026-08-31', duration_minutes: 60, description: 'Egen tid', hourly_rate: 99999 },
    { time_entry_id: 'other', business_id: 'biz_a', project_id: 'proj_a', business_user_id: 'other', work_date: '2026-08-31', description: 'HEMLIGT' },
    { time_entry_id: 'foreign', business_id: 'biz_b', project_id: 'proj_a', business_user_id: employee.id, work_date: '2026-08-31', description: 'HEMLIGT' },
  ] })
  const c = await load(h)
  expect(c.entries.map(r => r.time_entry_id)).toEqual(['own'])
  expect(JSON.stringify(c)).not.toMatch(/HEMLIGT|99999|hourly_rate/)
  for (const query of h.queries) expect(query).toContainEqual(['eq', 'business_id', 'biz_a'])
  expect(h.writes).toEqual([])
})
for (const user of [null, { ...employee, is_active: false }, { ...employee, business_id: 'biz_b' }]) test(`invalid user denied: ${JSON.stringify(user)}`, async () => {
  const h = database(); await expect(load(h, user)).rejects.toMatchObject({ status: 403 }); expect(h.queries).toEqual([])
})
test('assignment is required and owner can report without one', async () => {
  await expect(load(database({ project_assignment: [] }))).rejects.toMatchObject({ status: 403 })
  await expect(load(database({ project_assignment: [] }), { ...employee, role: 'owner' })).resolves.toMatchObject({ userId: employee.id })
})
test('foreign or deleted project never yields a report', async () => {
  await expect(load(database({ project: [{ project_id: 'proj_a', business_id: 'biz_b' }] }))).rejects.toMatchObject({ status: 404 })
})
for (const table of ['project_assignment', 'project', 'time_entry', 'time_checkins']) for (const thrown of [true, false]) test(`read failure is not empty: ${table} ${thrown}`, async () => {
  await expect(load(database({}, table, thrown))).rejects.toMatchObject({ status: 503 })
})
for (const date of ['2026-02-30', '2026-13-01', 'idag', 42]) test(`reject invalid date ${date}`, () => {
  expect(() => report.reportDate(date)).toThrow()
})
for (const tool of ['send_sms', 'create_invoice', 'update_project', 'create_ata_draft', 'log_material', 'handoff_to_agent']) test(`report mode rejects ${tool}`, async () => {
  expect(() => report.prepareWorkReportAction(tool, {}, awaitContext)).toThrow()
})
const awaitContext: report.WorkReportContext = { projectId: 'proj_a', userId: employee.id, userName: 'Anders', projectName: 'Köket', customerId: null, date: '2026-08-31', activeTimer: false, entries: [] }
test('only authorized fields survive normalization; other person denied, rates/booking stripped', () => {
  const a = report.prepareWorkReportAction('log_time', { ...timeInput, customer_id: 'foreign', hourly_rate: 1, is_billable: false, booking_id: 'other' }, awaitContext)
  expect(a.toolInput).toEqual(timeInput)
  expect(() => report.prepareWorkReportAction('log_time', { ...timeInput, business_user_id: 'other' }, awaitContext)).toThrow(/egen/)
  expect(() => report.prepareWorkReportAction('log_time', { ...timeInput, project_id: 'other' }, awaitContext)).toThrow()
  expect(() => report.prepareWorkReportAction('log_time', { ...timeInput, work_date: '2026-08-30' }, awaitContext)).toThrow()
})
for (const minutes of [0, -1, 1441, NaN, Infinity, 2.5, true, '240', null]) test(`invalid duration ${minutes}`, () => {
  expect(() => report.prepareWorkReportAction('log_time', { ...timeInput, duration_minutes: minutes }, awaitContext)).toThrow()
})
test('card shows exact minutes, person, project, date and additive warning', () => {
  const c = { ...awaitContext, entries: [{ time_entry_id: 'earlier', duration_minutes: 60, description: null }] }
  const text = report.workReportSummary(report.prepareWorkReportAction('log_time', { ...timeInput, duration_minutes: 61 }, c), c)
  for (const value of ['1 h 1 min', 'Anders', 'Köket', '2026-08-31', '60 min', 'ersätter inte']) expect(text).toContain(value)
  const long = 'Arbete '.repeat(70)
  expect(report.workReportSummary(report.prepareWorkReportAction('add_work_note', { ...noteInput, work_performed: long }, c), c)).toContain(long.trim())
})
for (const [table, active] of [
  ['time_entry', { time_entry_id: 'active', check_in_time: '2026-08-31T07:00:00Z', check_out_time: null }],
  ['time_checkins', { id: 'active', checked_out_at: null }],
] as const) test(`active ${table} stops time, not the note`, async () => {
  const c = await load(database({ [table]: [{ ...active, business_id: 'biz_a', business_user_id: employee.id }] }))
  expect(c.activeTimer).toBe(true)
  expect(() => report.prepareWorkReportAction('log_time', timeInput, c)).toThrow(/timer/)
  expect(report.prepareWorkReportAction('add_work_note', noteInput, c).toolName).toBe('add_work_note')
})

test.describe('confirmed execution through shared router', () => {
  const originalSecret = process.env.CRON_SECRET
  test.beforeEach(() => { process.env.CRON_SECRET = 'local-work-report-test-only' })
  test.afterEach(() => { if (originalSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = originalSecret })
  async function proposal(h: ReturnType<typeof database>) {
    const c = await load(h)
    const a = report.prepareWorkReportAction('log_time', timeInput, c)
    const b = report.prepareWorkReportAction('add_work_note', noteInput, c)
    return verifyPendingExternalAction(pendingWorkReport(a, c, 'biz_a', null, [b]).token, 'biz_a')!
  }
  test('two actions need two confirmations; retry/concurrency never duplicates the signed action', async () => {
    const h = database(), execute = router(), p = await proposal(h)
    expect(h.writes).toEqual([])
    const [first, retry] = await Promise.all([confirmWorkReport(p, h.db, 'biz_a', employee, execute), confirmWorkReport(p, h.db, 'biz_a', employee, execute)])
    expect(first.confirmed).toBe(true); expect(retry.confirmed).toBe(true)
    expect(h.writes).toEqual(['time_entry'])
    expect(h.tables.time_entry[0]).toMatchObject({ business_user_id: employee.id, project_id: 'proj_a', duration_minutes: 240, hourly_rate: null })
    const next = verifyPendingExternalAction(first.pending_confirmation!.token, 'biz_a')!
    const done = await confirmWorkReport(next, h.db, 'biz_a', employee, execute)
    expect(done.confirmed).toBe(true); expect(done.pending_confirmation).toBeNull()
    expect(h.writes).toEqual(['time_entry', 'project_log'])
    await confirmWorkReport(verifyPendingExternalAction(retry.pending_confirmation!.token, 'biz_a')!, h.db, 'biz_a', employee, execute)
    expect(h.tables.project_log).toHaveLength(1)
  })
  test('same-company colleague cannot reuse the card', async () => {
    const h = database(); await expect(confirmWorkReport(await proposal(h), h.db, 'biz_a', { ...employee, id: 'other' }, router())).rejects.toMatchObject({ status: 403 }); expect(h.writes).toEqual([])
  })
  test('explicit additional pass gets its own stable ID even with same duration; other employees note is not reused', async () => {
    const h = database({ project_log: [{ id: 'other_note', business_id: 'biz_a', order_id: 'proj_a', business_user_id: 'other', date: noteInput.log_date, work_performed: noteInput.work_performed, created_at: new Date().toISOString() }] }), execute = router()
    const first = await confirmWorkReport(await proposal(h), h.db, 'biz_a', employee, execute)
    const secondProposal = await proposal(h)
    expect(report.workReportSummary({ toolName: 'log_time', toolInput: timeInput }, await load(h))).toContain('lägger till ett nytt pass')
    await confirmWorkReport(secondProposal, h.db, 'biz_a', employee, execute)
    expect(h.tables.time_entry).toHaveLength(2)
    await confirmWorkReport(verifyPendingExternalAction(first.pending_confirmation!.token, 'biz_a')!, h.db, 'biz_a', employee, execute)
    expect(h.tables.project_log).toHaveLength(2)
    expect(h.tables.project_log[1].business_user_id).toBe(employee.id)
  })
  test('timer started after proposal blocks first execution, but replay of saved action stays idempotent', async () => {
    const h = database(), p = await proposal(h), execute = router()
    await confirmWorkReport(p, h.db, 'biz_a', employee, execute)
    h.tables.time_checkins.push({ id: 'clock', business_id: 'biz_a', business_user_id: employee.id, checked_out_at: null })
    expect((await confirmWorkReport(p, h.db, 'biz_a', employee, execute)).confirmed).toBe(true)
    expect(h.writes).toEqual(['time_entry'])
    const h2 = database(), p2 = await proposal(h2)
    h2.tables.time_checkins = h.tables.time_checkins
    expect((await confirmWorkReport(p2, h2.db, 'biz_a', employee, execute)).confirmed).toBe(false)
    expect(h2.writes).toEqual([])
  })
  test('revoked assignment is checked again on confirmation', async () => {
    const h = database(), p = await proposal(h); h.tables.project_assignment = []
    await expect(confirmWorkReport(p, h.db, 'biz_a', employee, router())).rejects.toMatchObject({ status: 403 }); expect(h.writes).toEqual([])
  })
  test('first write failure never advances to second action', async () => {
    const h = database(), p = await proposal(h)
    const r = await confirmWorkReport(p, h.db, 'biz_a', employee, async () => ({ success: false, error: 'offline' }))
    expect(r.confirmed).toBe(false); expect(r.pending_confirmation).toBeNull(); expect(r.reply).toContain('Ingen senare del')
  })
  test('second write failure preserves first success and does not claim all done', async () => {
    const h = database(), p = await proposal(h), execute = router()
    const first = await confirmWorkReport(p, h.db, 'biz_a', employee, execute)
    const r = await confirmWorkReport(verifyPendingExternalAction(first.pending_confirmation!.token, 'biz_a')!, h.db, 'biz_a', employee, async () => ({ success: false, error: 'offline' }))
    expect(h.writes).toEqual(['time_entry']); expect(r.confirmed).toBe(false); expect(r.reply).toContain('Arbetsanteckningen kunde inte sparas')
  })
})

// Extract the actual production turn and allowlist/filter functions via AST.
// Only the paid model/IO is substituted; a tool executed here is a test failure.
function agentTurn(modelResponse: any) {
  function extract(path: string, names: string[]) {
    const source = ts.createSourceFile(path, fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
    return source.statements.filter(node =>
      (ts.isFunctionDeclaration(node) && names.includes(node.name?.text || '')) ||
      (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ts.isIdentifier(d.name) && names.includes(d.name.text)))
    ).map(node => node.getText(source)).join('\n')
  }
  const source = extract('app/api/matte/chat/route.ts', ['runAgentTurn', 'isToolAllowedForAgent', 'UNIVERSAL_COORDINATION_TOOLS', 'APPROVAL_COORDINATION_TOOLS']) + '\n' + extract('lib/agent/agents/shared.ts', ['filterTools'])
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const calls: any[] = []
  const deps = { ...report, getAgentTools, toolDefinitions, isToolAllowedForActor,
    callClaude: async (args: any) => { calls.push(args); return modelResponse },
    executeSharedTool: () => { throw new Error('A report must never execute before confirmation') },
  }
  const run = new Function(...Object.keys(deps), 'exports', `${code}\nreturn runAgentTurn`)(...Object.values(deps), {})
  return { calls, run: () => run({ workReport: awaitContext, apiKey: 'test', agent: 'lars', systemArray: [], initialMessages: [], businessId: 'biz_a', supabase: database().db, toolContext: {}, requireConfirmExternal: false, missionToolsAllowed: false }) }
}
test('real turn exposes both actual report tools and returns two proposals, never model success or direct writes', async () => {
  const h = agentTurn({ stop_reason: 'tool_use', usage: { input_tokens: 123, output_tokens: 20 }, content: [
    { type: 'text', text: 'Klart, allt sparat!' },
    { type: 'tool_use', id: 'a', name: 'log_time', input: timeInput },
    { type: 'tool_use', id: 'b', name: 'add_work_note', input: noteInput },
  ] })
  const r = await h.run()
  expect(h.calls[0].tools.map((t: any) => t.name).sort()).toEqual(['add_work_note', 'log_time'])
  expect(r.text).toBe(''); expect(r.toolOutcomes).toEqual([])
  expect(r.pendingExternal).toMatchObject({ toolName: 'log_time', remaining: [{ toolName: 'add_work_note' }] })
  expect(r.usage.input_tokens).toBe(123)
})
for (const name of ['send_sms', 'create_invoice', 'handoff_to_agent', 'log_material']) test(`hallucinated ${name} rejected before execution and model usage retained`, async () => {
  const h = agentTurn({ stop_reason: 'tool_use', usage: { input_tokens: 17 }, content: [{ type: 'tool_use', name, input: {} }] })
  const r = await h.run()
  expect(r.pendingExternal).toBeNull(); expect(r.toolOutcomes[0].ok).toBe(false); expect(r.usage.input_tokens).toBe(17)
})
test('invalid second proposal cannot cause partial unconfirmed write; usage retained', async () => {
  const h = agentTurn({ stop_reason: 'tool_use', usage: { input_tokens: 19 }, content: [
    { type: 'tool_use', name: 'log_time', input: timeInput },
    { type: 'tool_use', name: 'add_work_note', input: { ...noteInput, project_id: 'foreign' } },
  ] })
  const r = await h.run(); expect(r.pendingExternal).toBeNull(); expect(r.toolOutcomes[0].ok).toBe(false); expect(r.usage.input_tokens).toBe(19)
})
test('no-tool follow-up has an explicit server-owned not-saved status', async () => {
  const r = await agentTurn({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hur länge jobbade du?' }] }).run()
  expect(r.text).toMatch(/^Inget nytt har sparats i den här turen/); expect(r.pendingExternal).toBeNull()
})

test('route reuses model/metering/confirmation; report cannot read broad context or bypass gate', () => {
  const src = fs.readFileSync('app/api/matte/chat/route.ts', 'utf8')
  for (const text of ['workReport ? null : await fetchBusinessContext', 'thread && !workReport', 'workReport ? [] : await getRelevantMemories', 'isWorkReportTool(t.name)', 'confirmWorkReport(pending, supabase, businessId, user, executeSharedTool)', 'pendingWorkReport(action, workReport', 'error instanceof WorkReportError']) expect(src).toContain(text)
  expect(src.indexOf('if (opts.workReport)')).toBeLessThan(src.indexOf('if (opts.requireConfirmExternal)'))
  expect(src).toContain("workReport ? 'lars'")
  expect(src).toContain('if (!workReport) extractAndSaveMemory')
})

test('internal report IDs are excluded explicitly from customer portal, not hidden by a broken legacy query', () => {
  const router = fs.readFileSync('app/api/agent/trigger/tool-router.ts', 'utf8')
  const portal = fs.readFileSync('app/api/portal/[token]/projects/route.ts', 'utf8')
  expect(router).toContain('`log_report_${context.confirmationId}`')
  const query = portal.slice(portal.indexOf(".from('project_log')"), portal.indexOf(".from('schedule_entry')"))
  expect(query).toContain(".not('id', 'like', 'log_report_%')")
  expect(query).toContain(".eq('business_id', customer.business_id)")
})
