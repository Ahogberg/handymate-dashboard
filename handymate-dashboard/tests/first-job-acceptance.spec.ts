import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'
import { standardDatabase } from './helpers/job-standard-db'
import { OPEN_QUOTE_STATUSES, WON_QUOTE_STATUSES } from '../lib/quotes/statuses'

// Actual route + isolated PostgreSQL; external effects are recorded, never sent.
// Minimal quote projection, not a live schema/RLS or full customer-journey proof.
async function harness(options: { race?: boolean; changedStatus?: string; failRead?: boolean; role?: string } = {}) {
  const database = await standardDatabase()
  await database.pg.exec(`CREATE TABLE quotes (quote_id text PRIMARY KEY, business_id text, status text,
    customer_id text, title text, total numeric, accepted_at timestamptz, accepted_manually boolean);
    CREATE TABLE customer (customer_id text PRIMARY KEY, business_id text, name text, phone_number text);
    CREATE TABLE customer_activity (activity_id text, business_id text, customer_id text, activity_type text,
      title text, description text, created_by text);
    ALTER TABLE deal ADD COLUMN quote_id text;
    INSERT INTO quotes VALUES ('q', 'a', 'sent', 'c', 'Servicebesök', 1250, NULL, false);
    INSERT INTO customer VALUES ('c', 'a', 'Testkund', NULL);`)
  const effects: string[] = []
  let reads = 0, release: () => void = () => {}, changed = false
  const barrier = new Promise<void>(resolve => { release = resolve })
  const db = { from(table: string) {
    const query: any = database.db.from(table)
    const originalThen = query.then.bind(query), originalUpdate = query.update.bind(query)
    let updating = false
    query.update = (value: unknown) => { updating = true; return originalUpdate(value) }
    query.then = (resolve: any, reject: any) => (async () => {
      if (table === 'quotes' && !updating && options.failRead) return { data: null, error: { code: 'XX000', message: 'read failed' } }
      if (table === 'quotes' && updating && options.changedStatus && !changed) {
        changed = true
        await database.pg.query('UPDATE quotes SET status=$1 WHERE quote_id=$2', [options.changedStatus, 'q'])
      }
      const result: any = await new Promise((res, rej) => originalThen(res, rej))
      if (table === 'quotes' && !updating && options.race && reads < 2) {
        reads++
        if (reads === 2) release()
        await barrier
      }
      return result
    })().then(resolve, reject)
    return query
  } }
  const effect = (name: string) => async () => { effects.push(name); return { success: true } }
  const mocks: Record<string, any> = {
    'next/server': { NextResponse },
    '@/lib/supabase': { getServerSupabase: () => db },
    '@/lib/auth': { getAuthenticatedBusiness: async () => options.role === 'anonymous' ? null : { business_id: 'a' } },
    '@/lib/permissions': { getCurrentUser: async () => ({ role: options.role || 'owner' }), hasPermission: () => options.role !== 'employee' },
    '@/lib/quotes/statuses': { OPEN_QUOTE_STATUSES, WON_QUOTE_STATUSES },
    '@/lib/quotes/margin-snapshot': { captureExpectedMarginSnapshot: effect('margin') },
    '@/lib/smart-communication': { triggerEventCommunication: effect('communication') },
    '@/lib/notifications': { notifyQuoteSigned: effect('notification') },
    '@/lib/project-ai-engine': { handleProjectEvent: effect('project-event') },
    '@/lib/automation-engine': { fireEvent: effect('automation') },
    '@/lib/projects/create-from-quote': { createProjectFromQuote: effect('project') },
    '@/lib/autopilot/trigger': { triggerAutopilot: effect('autopilot') },
    '@/lib/sms-send': { sendSmsViaElks: effect('sms') },
  }
  const code = ts.transpileModule(readFileSync('app/api/quotes/accept/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const api: any = {}
  new Function('require', 'exports', code)((id: string) => {
    if (!(id in mocks)) throw Error(`Unexpected dependency: ${id}`)
    return mocks[id]
  }, api)
  return { ...database, effects, accept: (quoteId: unknown = 'q') => api.POST(new NextRequest('https://test/api/quotes/accept', {
    method: 'POST', body: JSON.stringify({ quoteId }),
  })) }
}

test('two manual accepts run downstream work only once', async () => {
  const h = await harness({ race: true })
  try {
    const responses = await Promise.all([h.accept(), h.accept()])
    expect(responses.map(r => r.status).sort()).toEqual([200, 409])
    for (const name of ['margin', 'communication', 'notification', 'project-event', 'automation', 'project', 'autopilot']) {
      expect(h.effects.filter(e => e === name), name).toHaveLength(1)
    }
  } finally { await h.close() }
})

test('retry of an accepted quote returns receipt without replaying effects', async () => {
  const h = await harness()
  try {
    expect((await h.accept()).status).toBe(200)
    const count = h.effects.length
    const retry = await h.accept()
    expect(retry.status).toBe(200)
    expect(await retry.json()).toMatchObject({ success: true, deduplicated: true })
    expect(h.effects).toHaveLength(count)
  } finally { await h.close() }
})

for (const status of ['declined', 'expired', 'signed']) test(`stale manual accept cannot overwrite ${status}`, async () => {
  const h = await harness({ changedStatus: status })
  try {
    expect((await h.accept()).status).toBe(409)
    expect((await h.pg.query('SELECT status FROM quotes')).rows).toEqual([{ status }])
    expect(h.effects).toEqual([])
  } finally { await h.close() }
})

test('read failure is unavailable, not quote missing', async () => {
  const h = await harness({ failRead: true })
  try { expect((await h.accept()).status).toBe(503); expect(h.effects).toEqual([]) } finally { await h.close() }
})

for (const role of ['anonymous', 'employee']) test(`${role} cannot accept`, async () => {
  const h = await harness({ role })
  try { expect((await h.accept()).status).toBe(role === 'anonymous' ? 401 : 403); expect(h.calls).toEqual([]) } finally { await h.close() }
})

test('foreign quote is inaccessible and foreign customer data is not consumed', async () => {
  const h = await harness()
  try {
    await h.pg.exec("INSERT INTO quotes (quote_id,business_id,status) VALUES ('foreign','b','sent'); UPDATE customer SET business_id='b';")
    expect((await h.accept('foreign')).status).toBe(404)
    expect((await h.accept()).status).toBe(200)
    const lookup = h.calls.find(c => c.table === 'customer')
    expect(lookup?.filters).toContainEqual({ column: 'business_id', op: '=', value: 'a' })
    expect(h.effects).not.toContain('sms')
  } finally { await h.close() }
})

test('legacy column fallback retains the same concurrency guard', async () => {
  const h = await harness({ race: true })
  try {
    await h.pg.exec('ALTER TABLE quotes DROP COLUMN accepted_manually;')
    const responses = await Promise.all([h.accept(), h.accept()])
    expect(responses.map(r => r.status).sort()).toEqual([200, 409])
    expect(h.effects.filter(e => e === 'automation')).toHaveLength(1)
  } finally { await h.close() }
})

test('write error cannot trigger fallback success or downstream effects', async () => {
  const h = await harness()
  try {
    await h.pg.exec("ALTER TABLE quotes ADD CONSTRAINT prevent_accept CHECK (status <> 'accepted');")
    expect((await h.accept()).status).toBe(500)
    expect(h.effects).toEqual([])
    expect((await h.pg.query('SELECT status FROM quotes')).rows).toEqual([{ status: 'sent' }])
  } finally { await h.close() }
})
