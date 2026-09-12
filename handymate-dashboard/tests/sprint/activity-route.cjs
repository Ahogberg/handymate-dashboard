const assert = require('node:assert/strict')
const { load } = require('./onboarding-completion.cjs')

const selected = new Map()
const rows = {
  automation_activity: [], pipeline_activity: [], v3_automation_logs: [],
  communication_log: [{ id: 'comm-1', channel: 'sms', message: 'Levererat meddelande', status: 'delivered', created_at: '2026-09-10T09:00:00Z' }],
}
const db = { from(table) {
  const q = {
    select(fields) { selected.set(table, fields); return q }, eq() { return q }, in() { return q }, gte() { return q }, order() { return q }, limit() { return q },
    then(resolve, reject) { return Promise.resolve({ data: rows[table] || [], error: null }).then(resolve, reject) },
  }
  return q
} }

async function main() {
  const api = await load('app/api/automations/activity/route.ts', {
    'next/server': { NextRequest: Request, NextResponse: { json: (body, init = {}) => Response.json(body, init) } },
    '@/lib/auth': { getAuthenticatedBusiness: async () => ({ business_id: 'biz-a' }) },
    '@/lib/supabase': { getServerSupabase: () => db },
    '@/lib/testdata': { arTestNamn: () => false },
  })
  const response = await api.GET(new Request('https://unit.invalid/api/automations/activity?limit=10'))
  assert.equal(response.status, 200)
  assert.equal(selected.get('communication_log'), 'id, channel, message, status, created_at')
  assert(!selected.get('communication_log').includes('ai_reason'))
  const body = await response.json()
  assert.equal(body.completeness.communication, 'complete')
  assert.deepEqual(body.data[0], {
    id: 'comm-1', type: 'sms', action: 'sms', description: 'Levererat meddelande', status: 'success',
    created_at: '2026-09-10T09:00:00Z', source: 'communication', auto: true, verified: true,
  })
  console.log('PASS activity route uses deployed communication_log schema and maps delivered message')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
