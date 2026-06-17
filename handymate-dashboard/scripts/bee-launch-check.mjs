// Read-only pre-launch-checkar för Bee Service (sektion A i bee-launch-checklist).
// Kör: node scripts/bee-launch-check.mjs  (kräver .env.local med prod-creds)
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const BID = 'biz_21wswuhrbhy'

const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o ? o[k] : undefined]))

// A1/A4/A5 — business_config (select * för att undvika kolumn-fel, plocka fält)
const bc = await supabase.from('business_config').select('*').eq('business_id', BID).maybeSingle()
console.log('\n=== business_config (A1/A4/A5) ===')
if (bc.error) console.log('FEL:', bc.error.message)
else if (!bc.data) console.log('INGEN RAD för', BID)
else console.log(JSON.stringify(pick(bc.data, [
  'business_id', 'business_name', 'branch',
  'auto_invoice_on_complete', 'auto_invoice_send', 'auto_approve_enabled',
  'agents_globally_paused', 'agent_cost_cap_usd_daily',
  'fortnox_connected_at', 'fortnox_company_name',
]), null, 2))

// A2 — v3_automation_settings
const va = await supabase.from('v3_automation_settings').select('*').eq('business_id', BID).maybeSingle()
console.log('\n=== v3_automation_settings (A2) ===')
if (va.error) console.log('FEL:', va.error.message)
else if (!va.data) console.log('INGEN RAD — telefoni-config saknas')
else console.log(JSON.stringify(pick(va.data, ['business_id', 'call_handling_mode', 'work_start', 'work_end']), null, 2))

// A3 — lead_sources
const ls = await supabase.from('lead_sources').select('id, name, source_type').eq('business_id', BID)
console.log('\n=== lead_sources (A3) ===')
if (ls.error) console.log('FEL:', ls.error.message)
else console.log(`${ls.data.length} källor:`, JSON.stringify(ls.data.map(r => r.name)))

// Bonus — approve_rate sample_size (Förtroendetrappan, D3)
const bp = await supabase.from('business_patterns').select('sample_size, confidence, value').eq('business_id', BID).eq('pattern_key', 'approve_rate').maybeSingle()
console.log('\n=== approve_rate (D3 Förtroendetrappan) ===')
if (bp.error) console.log('FEL:', bp.error.message)
else if (!bp.data) console.log('Ingen approve_rate-rad än (cronen har inte kört / 0 resolved approvals)')
else console.log(`sample_size=${bp.data.sample_size}, confidence=${bp.data.confidence}, per_agent=${JSON.stringify(bp.data.value?.per_agent || {})}`)

process.exit(0)
