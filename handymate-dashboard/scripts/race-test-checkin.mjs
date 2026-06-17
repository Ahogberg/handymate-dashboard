// Race-test för B3 dubbelklick-guard (checkin-approve, commit 976a9c3f).
// Engångs. Read+write mot prod via service-role. Städar efter sig.
//
// Körning (PowerShell):
//   $env:SUPABASE_URL="https://pktaqedooyzgvzwipslu.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<service-role från Vercel>"
//   $env:BEE_TOKEN="<Bee-ägarens supabase access_token>"   # valfritt — utan den körs bara DB-guard-lagret
//   $env:APP_URL="https://app.handymate.se"
//   node scripts/race-test-checkin.mjs
//
// Två lager:
//   Lager 1 (kräver bara service-role): N samtidiga atomiska flips direkt mot DB.
//            Bevisar att .neq('status','approved')-guarden släpper igenom EXAKT en.
//   Lager 2 (kräver BEE_TOKEN): N parallella POST mot /api/checkin/approve.
//            Bevisar att hela endpoint-vägen skapar EXAKT en time_entry.

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BEE_TOKEN = process.env.BEE_TOKEN
const APP_URL = process.env.APP_URL || 'https://app.handymate.se'
const BIZ = 'biz_21wswuhrbhy'
const PARALLEL = 6

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Sätt SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY i env.'); process.exit(1)
}
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const marker = 'RACE_TEST_' + Date.now()
const checkinId = randomUUID()
const nowIso = new Date().toISOString()

// En verklig Bee-user för user_id (annars fallback — hourly_rate faller till 0, OK för test)
const { data: bu } = await sb.from('business_users').select('user_id').eq('business_id', BIZ).limit(1).maybeSingle()
const userId = bu?.user_id || 'race_test_user'

// ── Seed: test-checkin i 'completed' (väntar attestering) ──────────────
const { error: seedErr } = await sb.from('time_checkins').insert({
  id: checkinId, business_id: BIZ, user_id: userId, user_name: 'RACE TEST',
  project_name: marker,                 // ← flödar in i time_entry.description
  checked_in_at: nowIso, checked_out_at: nowIso,
  duration_minutes: 60, status: 'completed',
})
if (seedErr) { console.error('Seed-fel:', seedErr.message); process.exit(1) }
console.log(`Seedade checkin ${checkinId} (marker=${marker}, status=completed)\n`)

let httpVerdict = 'ej kört (BEE_TOKEN saknas)'
let teCount = null

// ── Lager 2: N parallella POST mot endpointen ──────────────────────────
if (BEE_TOKEN) {
  async function approve() {
    try {
      const res = await fetch(`${APP_URL}/api/checkin/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BEE_TOKEN}` },
        body: JSON.stringify({ checkin_id: checkinId, action: 'approve' }),
      })
      return res.status
    } catch (e) { return 0 }
  }
  const codes = await Promise.all(Array.from({ length: PARALLEL }, () => approve()))
  console.log('Lager 2 — HTTP-koder:', JSON.stringify(codes))
  console.log(`   200 (success):           ${codes.filter(c => c === 200).length}`)
  console.log(`   409 (guard blockerade):  ${codes.filter(c => c === 409).length}`)

  const { data: tes } = await sb.from('time_entry')
    .select('time_entry_id').eq('business_id', BIZ).like('description', `%${marker}%`)
  teCount = (tes || []).length
  httpVerdict = teCount === 1 ? 'JA ✓ (1 time_entry)' : `NEJ ✗ — ${teCount} time_entries (DUBBEL-EXEKVERING)`
}

// ── Lager 1: DB-guard micro-test (bara service-role) ───────────────────
// Återställ checkin → completed för ren mätning, fira N samtidiga atomiska flips.
await sb.from('time_checkins').update({ status: 'completed', approved_at: null }).eq('id', checkinId)
const flips = await Promise.all(Array.from({ length: PARALLEL }, () =>
  sb.from('time_checkins')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', checkinId).eq('business_id', BIZ).neq('status', 'approved').select('id')
))
const winners = flips.filter(f => Array.isArray(f.data) && f.data.length === 1).length
const dbVerdict = winners === 1 ? 'JA ✓ (1 vinnare)' : `NEJ ✗ — ${winners} vinnare (guard läcker)`

// ── Resultat ───────────────────────────────────────────────────────────
console.log(`\n=== RESULTAT ===`)
console.log(`Lager 1 (DB-guard, ${PARALLEL} samtidiga flips):  ${dbVerdict}`)
console.log(`Lager 2 (HTTP-endpoint, exakt 1 time_entry):    ${httpVerdict}`)

// ── Städa ──────────────────────────────────────────────────────────────
await sb.from('time_entry').delete().eq('business_id', BIZ).like('description', `%${marker}%`)
await sb.from('time_checkins').delete().eq('id', checkinId)
console.log('\nStädat: test-checkin + ev. time_entry borttagna.')
