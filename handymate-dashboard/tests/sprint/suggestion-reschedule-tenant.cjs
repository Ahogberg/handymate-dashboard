const assert = require('node:assert/strict')
const { load } = require('./onboarding-completion.cjs')

function database(state) {
  return { from(table) {
    let operation = 'read', fields = '', value
    const filters = {}
    const q = {
      select(s) { fields = s; return q },
      eq(k, v) { filters[k] = v; return q },
      update(v) { operation = 'write'; value = v; return q },
      single: async () => result(),
      maybeSingle: async () => result(),
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) },
    }
    function result() {
      if (table === 'ai_suggestion') {
        if (operation === 'write') { state.suggestionUpdates.push(value); return { data: null, error: null } }
        return { data: state.suggestion, error: null }
      }
      if (table === 'booking') {
        const sameTenant = filters.booking_id === state.booking.booking_id && filters.business_id === state.booking.business_id
        if (operation === 'write') {
          state.bookingUpdateAttempts.push({ filters: { ...filters }, value })
          if (state.updateError) return { data: null, error: { message: 'write failed' } }
          if (state.updateZero || !sameTenant) return { data: null, error: null }
          Object.assign(state.booking, value)
          return { data: { booking_id: state.booking.booking_id }, error: null }
        }
        state.bookingReads.push({ ...filters })
        if (state.readError) return { data: null, error: { message: 'read failed' } }
        return sameTenant
          ? { data: { scheduled_start: state.booking.scheduled_start, scheduled_end: state.booking.scheduled_end }, error: null }
          : { data: null, error: { message: 'not found' } }
      }
      if (table === 'business_config') return { data: { business_name: 'Test AB' }, error: null }
      throw new Error(`unexpected table ${table}, fields ${fields}`)
    }
    return q
  } }
}

async function route(options = {}) {
  const state = {
    booking: { booking_id: 'booking_1', business_id: 'biz_test', scheduled_start: '2026-09-10T09:00:00.000Z', scheduled_end: '2026-09-10T10:00:00.000Z' },
    suggestion: { suggestion_id: 'suggestion_1', business_id: 'biz_test', customer_id: 'customer_1', status: 'pending', suggestion_type: 'reschedule', call_recording: { phone_number: '+46700000000', customer: { customer_id: 'customer_1' } } },
    bookingReads: [], bookingUpdateAttempts: [], suggestionUpdates: [], sms: [], ...options,
  }
  const api = await load('app/api/suggestions/approve/route.ts', {
    'next/server': { NextRequest: Request, NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@supabase/supabase-js': {},
    '@/lib/supabase': { getServerSupabase: () => database(state) },
    '@/lib/auth': { getAuthenticatedBusiness: async () => ({ business_id: 'biz_test' }) },
    '@/lib/rate-limit-db': { checkSmsRateLimitDb: async () => ({ allowed: true }) },
    '@/lib/permissions': { getCurrentUser: async () => ({}), isOwnerOrAdmin: () => true },
    '@/lib/quotes/create-quote': { createQuote: async () => ({}) },
    '@/lib/sms-send': { sendSmsViaElks: async args => { state.sms.push(args); return { success: true } } },
  })
  const response = await api.POST(new Request('https://unit.invalid/api/suggestions/approve', {
    method: 'POST',
    body: JSON.stringify({ suggestion_id: 'suggestion_1', action_data: { booking_id: 'booking_1', requested_date: '2026-09-12' } }),
  }))
  return { state, response, body: await response.json() }
}

const tests = []; const test = (name, fn) => tests.push([name, fn])

test('foreign explicit booking is not mutated and sends no SMS', async () => {
  const h = await route({ booking: { booking_id: 'booking_1', business_id: 'biz_foreign', scheduled_start: '2026-09-10T09:00:00.000Z', scheduled_end: '2026-09-10T10:00:00.000Z' } })
  assert.equal(h.body.success, false); assert.equal(h.state.bookingUpdateAttempts.length, 0); assert.equal(h.state.sms.length, 0)
  assert.deepEqual(h.state.bookingReads[0], { booking_id: 'booking_1', business_id: 'biz_test' })
})

test('same-tenant explicit booking updates before sending SMS', async () => {
  const h = await route(); assert.equal(h.body.success, true); assert.equal(h.state.bookingUpdateAttempts.length, 1); assert.equal(h.state.sms.length, 1)
  assert.equal(h.state.bookingUpdateAttempts[0].filters.business_id, 'biz_test'); assert.equal(h.state.booking.scheduled_start, '2026-09-12T09:00:00.000Z')
})

for (const [name, options] of [['read error', { readError: true }], ['write error', { updateError: true }], ['zero-row update', { updateZero: true }]]) {
  test(`${name} cannot report reschedule success or send SMS`, async () => {
    const h = await route(options); assert.equal(h.body.success, false); assert.equal(h.state.sms.length, 0)
  })
}

if (require.main === module) (async () => {
  for (const [name, fn] of tests) { await fn(); console.log('PASS', name) }
  console.log(`PASS ${tests.length} suggestion reschedule tenant contracts; database/providers isolated`)
})().catch(error => { console.error(error); process.exitCode = 1 })
