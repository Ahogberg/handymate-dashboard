// Disposable in-memory PostgreSQL (PGlite). NEVER connects to Supabase.
// npm install --prefix tmp/call-sql-test --no-save --package-lock=false @electric-sql/pglite
// node scripts/verify-call-processing-sql.mjs
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { PGlite } = require('../tmp/call-sql-test/node_modules/@electric-sql/pglite')
const db = new PGlite()
let checks = 0
const ok = (condition, message) => { assert.ok(condition, message); checks++; console.log(`OK ${checks}: ${message}`) }
const token = '00000000-0000-4000-a000-000000000001'
const rpc = async (op, data = {}, id = 'rec_a', biz = 'biz_a', t = token) => {
  const r = await db.query('select manage_call_processing($1,$2,$3,$4,$5::jsonb) as result', [biz,id,op,t,JSON.stringify(data)])
  return r.rows[0].result
}
const count = async sql => (await db.query(sql)).rows[0].n
const card = (id, type, rec = 'rec_a') => ({ id, approval_type: type, title: 'Syntetiskt test',
  risk_level: 'low', payload: { recording_id: rec, call_card_key: id } })

try {
  // Minimal fixture from live information_schema, not a fake query-response mock.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE project(project_id text PRIMARY KEY,business_id text,customer_id text);
    CREATE TABLE business_preferences(business_id text,key text,value text,UNIQUE(business_id,key));
    CREATE TABLE call_recording(recording_id text PRIMARY KEY,business_id text,customer_id text,source text DEFAULT 'phone',
      created_at timestamptz DEFAULT now(),transcribed_at timestamptz,analyzed_at timestamptz,
      transcript text,transcript_text text,transcript_segments jsonb,transcript_summary text,
      ai_analysis jsonb,recording_url text,auto_actions_taken jsonb);
    CREATE TABLE pending_approvals(id text PRIMARY KEY,business_id text,approval_type text,title text,
      description text,payload jsonb,status text,risk_level text,expires_at timestamptz,
      routed_agent text,routing_role text,routed_business_user_id text);
    CREATE TABLE ai_suggestion(id serial PRIMARY KEY,recording_id text,business_id text,
      source_text text,description text,suggested_data jsonb,title text,status text);
  `)
  await db.exec(readFileSync(new URL('../sql/v180_call_processing_and_retention.sql', import.meta.url), 'utf8'))
  ok(true, 'migration compiles in PostgreSQL; no production database involved')
  await db.exec("insert into call_recording(recording_id,business_id,transcript) values ('rec_a','biz_a','Syntetiskt'),('rec_b','biz_b','Syntetiskt')")
  await assert.rejects(rpc('claim', {}, 'rec_b', 'biz_a'), /recording_not_found/); ok(true,'tenant mismatch denied')
  ok((await rpc('claim')).status === 'claimed', 'first worker claims recording')
  ok((await rpc('claim')).status === 'busy', 'concurrent worker blocked')
  await assert.rejects(rpc('checkpoint', {}, 'rec_a', 'biz_a','wrong'), /stale_worker/); ok(true,'stale token rejected')
  await rpc('checkpoint', { result: { summary: 'Sammanfattning', suggestions: [] }, pipeline: { action: 'no_action' } })
  await assert.rejects(rpc('publish', { cards: [card('summary','meeting_summary'),card('bad','send_sms')] }), /invalid_card/)
  ok(await count('select count(*)::int n from pending_approvals') === 0,'late insert failure rolls entire batch back')
  ok((await db.query("select call_processing->'result' as r from call_recording where recording_id='rec_a'")).rows[0].r.summary === 'Sammanfattning','cached extraction survives failed publication')
  const cards = [card('summary','meeting_summary'),card('followup','meeting_followup')]
  ok((await rpc('publish',{ cards, pipeline_failed: true })).cards_created === 2, 'complete batch persisted atomically')
  await rpc('release')
  await db.exec("update pending_approvals set status='approved',payload=payload||'{\"execution_result\":{\"outcome\":\"success\",\"artifacts\":{\"task_id\":\"task_1\"}}}'::jsonb where id='followup'")
  ok((await rpc('claim')).status === 'claimed','partial run is retryable')
  ok((await rpc('publish',{ cards })).cards_created === 0,'retry creates no duplicates')
  ok((await db.query("select payload->'execution_result' as r from pending_approvals where id='followup'")).rows[0].r.outcome === 'success','retry preserves already executed card')
  ok((await rpc('notify')).claimed, 'first notification attempt claimed')
  ok(!(await rpc('notify')).claimed, 'second notification attempt suppressed')
  await rpc('release')
  ok((await rpc('claim')).status === 'complete','completed batch does not re-analyze')
  await db.exec("insert into pending_approvals(id,business_id,payload) values('old','biz_b','{\"recording_id\":\"rec_b\"}')")
  ok((await rpc('claim',{},'rec_b','biz_b')).status === 'legacy','legacy partial batch not falsely declared complete')
  await db.exec('SET ROLE authenticated')
  await assert.rejects(rpc('claim'), /permission denied/); ok(true,'authenticated cannot execute service RPC')
  await db.exec('RESET ROLE')
  await db.exec('GRANT SELECT,UPDATE ON call_recording TO authenticated')
  await db.exec('SET ROLE authenticated')
  await assert.rejects(db.exec("update call_recording set call_processing='{}' where recording_id='rec_a'"), /call_fields_server_owned/)
  ok(true,'authenticated cannot forge server-owned outcome state')
  await db.exec('RESET ROLE')
  await assert.rejects(db.exec("update call_recording set transcript='Changed' where recording_id='rec_a'"), /call_transcript_already_analyzed/)
  ok(true,'analyzed transcript cannot silently invalidate cached evidence')
  await db.exec("insert into project values('proj_foreign','biz_b','customer_b')")
  await assert.rejects(db.exec("update call_recording set project_id='proj_foreign' where recording_id='rec_a'"), /call_project_mismatch/)
  ok(true,'database also rejects cross-tenant project link')
  await assert.rejects(db.query("select purge_call_raw_data('biz_a','rec_a')"), /retention_not_approved/); ok(true,'no policy means no deletion')
  const policy = { enabled: true, transcript_days: 30, legal_review_ref: 'synthetic-policy', provider_deletion_ref: 'synthetic-supplier' }
  await db.query("insert into business_preferences values('biz_a','call_retention_policy',$1)",[JSON.stringify(policy)])
  ok((await db.query("select purge_call_raw_data('biz_a','rec_a') as r")).rows[0].r === false,'fresh transcript retained')
  await db.exec("update call_recording set created_at=now()-interval '31 days', transcript_text='Alias', ai_analysis='{\"sensitive\":true}' where recording_id='rec_a'")
  ok((await db.query("select purge_call_raw_data('biz_a','rec_a') as r")).rows[0].r === true,'expired raw transcript purged')
  const purged = (await db.query("select * from call_recording where recording_id='rec_a'")).rows[0]
  ok(purged.transcript === null && purged.transcript_text === null && purged.ai_analysis === null && !purged.call_processing.result,'all raw aliases and cached extraction removed')
  ok((await db.query("select status,payload from pending_approvals where id='followup'")).rows[0].status === 'approved','purge does not undo an executed action')
  ok((await rpc('claim')).status === 'expired','deleted source cannot be re-analyzed')
  await assert.rejects(db.exec("update call_recording set transcript='Resurrected' where recording_id='rec_a'"), /call_raw_data_expired/)
  ok(true,'old editor cannot repopulate a retained tombstone')
  ok((await db.query("select purge_call_raw_data('biz_a','rec_a') as r")).rows[0].r === false,'purge idempotent')
  ok(await count('select count(*)::int n from call_retention_audit') === 1,'one content-free audit entry')
  await db.exec("insert into call_recording(recording_id,business_id,source,created_at) values('rec_visit','biz_a','site_visit',now()-interval '40 days')")
  ok((await db.query("select purge_call_raw_data('biz_a','rec_visit') as r")).rows[0].r === false,'phone retention leaves site visits untouched')
  console.log(`PASS: ${checks} PostgreSQL checks`)
} finally { await db.close() }
