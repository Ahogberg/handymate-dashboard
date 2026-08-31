/**
 * Read-only PostgREST schema/filter smoke, NOT a positive customer-flow proof.
 * Uses configured .env.test credentials, no customer rows, no DDL or writes.
 * node scripts/job-preparation-read-probe.cjs
 */
require('dotenv').config({ path: '.env.test', quiet: true })
const { createClient } = require('@supabase/supabase-js')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Configured Supabase URL/service role required; credentials are never printed.')
const business = '__job_preparation_schema_probe__'
const id = '00000000-0000-0000-0000-000000000000'
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => {
    const target = new URL(String(input))
    if ((init?.method || 'GET') !== 'GET' || !target.pathname.startsWith('/rest/v1/') || target.searchParams.get('business_id') !== `eq.${business}`) {
      throw new Error('Read-probe boundary: only scoped GETs to the non-customer probe ID are allowed.')
    }
    return fetch(input, { ...init, signal: AbortSignal.timeout(15000) })
  } },
})
const queries = [
  ['booking', () => db.from('booking').select('booking_id,project_id,customer_id,scheduled_start,scheduled_end,status,job_status,completed_at').eq('business_id', business).eq('project_id', id)
    .gte('scheduled_start', new Date().toISOString()).eq('status', 'confirmed').is('completed_at', null).or('job_status.is.null,job_status.not.in.(cancelled,completed)').order('scheduled_start').order('booking_id').limit(2)],
  ['project_assignment', () => db.from('project_assignment').select('id').eq('business_id', business).eq('project_id', id).eq('business_user_id', id).limit(1)],
  ['project', () => db.from('project').select('project_id,customer_id,quote_id,name').eq('business_id', business).eq('project_id', id).limit(1)],
  ['customer', () => db.from('customer').select('customer_id,name').eq('business_id', business).eq('customer_id', id).limit(1)],
  ['quotes', () => db.from('quotes').select('quote_id,status,project_address').eq('business_id', business).eq('quote_id', id).eq('customer_id', id).limit(1)],
  ['quote_items', () => db.from('quote_items').select('id,description').eq('business_id', business).eq('quote_id', id).eq('is_hidden', false).in('item_type', ['item', 'option'])
    .or('item_type.neq.option,option_selected.eq.true').order('sort_order').order('id').limit(13)],
  ['project_change', () => db.from('project_change').select('change_id,description,status,declined_at').eq('business_id', business).eq('project_id', id).order('created_at', { ascending: false }).order('change_id').limit(13)],
  ['project_checklist', () => db.from('project_checklist').select('id,name,status,items').eq('business_id', business).eq('project_id', id).order('created_at', { ascending: false }).order('id').limit(13)],
  ['project_document', () => db.from('project_document').select('id,name,category').eq('business_id', business).eq('project_id', id).in('category', ['drawing', 'photo']).order('created_at', { ascending: false }).order('id').limit(13)],
  ['installation', () => db.from('installation').select('installation_id,name,model,placement').eq('business_id', business).eq('project_id', id).eq('customer_id', id).eq('status', 'confirmed').order('created_at', { ascending: false }).order('installation_id').limit(13)],
  ['customer_activity', () => db.from('customer_activity').select('activity_id,title,created_at,activity_type').eq('business_id', business).eq('customer_id', id).eq('metadata->>project_id', id)
    .in('activity_type', ['sms_sent', 'sms_received', 'email_sent', 'email_received']).order('created_at', { ascending: false }).order('activity_id').limit(13)],
]
;(async () => {
  let passed = 0
  for (const [name, query] of queries) {
    const { data, error } = await query()
    if (error || !Array.isArray(data) || data.length !== 0) {
      console.error(`FAIL ${name}: ${error?.code || 'unexpected response; no row contents printed'}`)
      process.exitCode = 1
    } else { passed++; console.log(`PASS ${name}: schema/filter/order accepted; zero customer rows`) }
  }
  console.log(`${passed}/${queries.length} read probes passed. No writes. Does not prove authenticated UI or real-data completeness.`)
})().catch(() => { console.error('Read probe failed; no secrets or row contents printed.'); process.exitCode = 1 })
