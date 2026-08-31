/** Read-only schema/filter probe. NEVER a positive employee/tenant-isolation proof. */
require('dotenv').config({ path: '.env.test', quiet: true })
const { createClient } = require('@supabase/supabase-js')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Configured Supabase URL/service role required; never printed.')
const business = '__work_report_schema_probe__', id = '00000000-0000-0000-0000-000000000000'
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => {
    const target = new URL(String(input))
    if ((init?.method || 'GET') !== 'GET' || target.origin !== new URL(url).origin || !target.pathname.startsWith('/rest/v1/') || target.searchParams.get('business_id') !== `eq.${business}`) {
      throw new Error('Only scoped GETs for the non-customer probe ID are permitted.')
    }
    return fetch(input, { ...init, signal: AbortSignal.timeout(15000) })
  } },
})
const queries = [
  ['user', () => db.from('business_users').select('*').eq('business_id', business).eq('id', id).eq('is_active', true).maybeSingle()],
  ['assignment', () => db.from('project_assignment').select('id').eq('business_id', business).eq('project_id', id).eq('business_user_id', id).limit(1)],
  ['project', () => db.from('project').select('project_id,name,customer_id').eq('business_id', business).eq('project_id', id).maybeSingle()],
  ['own-time', () => db.from('time_entry').select('time_entry_id,duration_minutes,description').eq('business_id', business).eq('business_user_id', id).eq('project_id', id).eq('work_date', '2026-08-31').order('created_at').limit(101)],
  ['active-time', () => db.from('time_entry').select('time_entry_id').eq('business_id', business).eq('business_user_id', id).not('check_in_time', 'is', null).is('check_out_time', null).limit(1)],
  ['active-checkin', () => db.from('time_checkins').select('id').eq('business_id', business).eq('business_user_id', id).is('checked_out_at', null).limit(1)],
  ['time-replay', () => db.from('time_entry').select('time_entry_id').eq('business_id', business).eq('business_user_id', id).eq('time_entry_id', 'time_report_probe').maybeSingle()],
  ['note-replay', () => db.from('project_log').select('id').eq('business_id', business).eq('business_user_id', id).eq('id', 'log_report_probe').maybeSingle()],
  ['internal-note-filter', () => db.from('project_log').select('id').eq('business_id', business).not('id', 'like', 'log_report_%').limit(1)],
]
;(async () => {
  let passed = 0
  for (const [name, query] of queries) {
    const { data, error } = await query()
    if (error || !(data === null || (Array.isArray(data) && data.length === 0))) {
      console.error(`FAIL ${name}: ${error?.code || 'unexpected response'}`); process.exitCode = 1
    } else { passed++; console.log(`PASS ${name}: zero rows, schema/filter accepted`) }
  }
  console.log(`${passed}/${queries.length} read probes passed. No customer rows or writes.`)
})().catch(() => { console.error('Probe failed; no credentials or row contents printed.'); process.exitCode = 1 })
