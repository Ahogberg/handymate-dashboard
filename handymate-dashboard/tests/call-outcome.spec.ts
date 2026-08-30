import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { deriveCallOutcome, type CallApproval } from '../lib/voice/call-outcome'
import { callCardId, callRecordingId, publishCallCards } from '../lib/voice/call-processing'
import { parseCallRetentionPolicy, recordingNoticeUrl, sweepCallRetention } from '../lib/voice/retention'
import { buildPushTemplate } from '../lib/notifications/approval-push'

const row = (overrides: Partial<CallApproval> = {}): CallApproval => ({ id: 'a', title: 'Klart! Allt är skickat!',
  status: 'pending', approval_type: 'create_quote_draft', payload: { recording_id: 'rec_1' }, ...overrides })
const read = (path: string) => readFileSync(path, 'utf8').replace(/\r/g, '')

test('model text and approved status never prove execution', () => {
  const o = deriveCallOutcome({ phase: 'complete' }, [row({ status: 'approved' })])
  expect(o.done).toEqual([]); expect(o.other[0].label).toContain('inte verifierat')
})
test('artifact result distinguishes draft from send', () => {
  const o = deriveCallOutcome({}, [row({ status: 'approved', payload: { execution_result: { outcome: 'success', artifacts: { quote_id: 'q1' } } } })])
  expect(o.done[0].label).toContain('inte skickat'); expect(o.done[0].href).toBe('/dashboard/quotes/q1')
})
test('failed tools override confident model title', () => {
  const o = deriveCallOutcome({}, [row({ status: 'approved', payload: { execution_result: { outcome: 'failed' } } })])
  expect(o.failed).toHaveLength(1); expect(o.done).toHaveLength(0)
})
test('summary acknowledgement is not a completed action', () => expect(deriveCallOutcome({}, [row({ approval_type: 'meeting_summary', status: 'approved' })]).done).toEqual([]))
test('expired proposal cannot masquerade as a waiting decision', () => {
  const o = deriveCallOutcome({}, [row({ expires_at: '2020-01-01' })])
  expect(o.pending).toEqual([]); expect(o.other).toHaveLength(1)
})
test('partial run explicitly offers repair', () => {
  const o = deriveCallOutcome({ phase: 'partial' }, [row()])
  expect(o.retryable).toBe(true); expect(o.processingIssue).toContain('inte slutföras'); expect(o.pending).toHaveLength(1)
})
test('lead without deal never claimed complete', () => {
  expect(deriveCallOutcome({ pipeline: { action: 'created_lead', leadId: 'l1', aiConfidence: 90 } }, []).done).toEqual([])
})
test('idempotency keys differ between tenants, not retries', () => {
  expect(callCardId('a','r','1')).toBe(callCardId('a','r','1'))
  expect(callCardId('a','r','1')).not.toBe(callCardId('b','r','1'))
  expect(callRecordingId('a','c')).not.toBe(callRecordingId('b','c'))
})
test('publication uses one atomic RPC; errors propagate', async () => {
  const calls: any[] = []
  const db = { rpc: async (...args: any[]) => { calls.push(args); return { error: { code: '23514' } } } }
  await expect(publishCallCards(db as any,'a','r','token',[{ approval_type: 'meeting_summary', payload: {} }],false)).rejects.toThrow('23514')
  expect(calls).toHaveLength(1); expect(calls[0][1].p_operation).toBe('publish')
})
test('disabled retention performs no database operations', async () => {
  const db = { from: () => { throw new Error('must not query') } }
  expect((await sweepCallRetention(db as any,false)).enabled).toBe(false)
})
test('retention requires a specific policy plus supplier/legal evidence', () => {
  for (const p of [null, '{}', 'broken', { enabled: true }, { enabled: true, transcript_days: 365, legal_review_ref:'a', provider_deletion_ref:'b' }]) expect(parseCallRetentionPolicy(p)).toBeNull()
  expect(parseCallRetentionPolicy(JSON.stringify({ enabled:true,transcript_days:30,legal_review_ref:'a',provider_deletion_ref:'b' }))).not.toBeNull()
})
test('recording notice requires verified policy and real HTTPS audio', () => {
  expect(recordingNoticeUrl({})).toBeNull()
  const env = { CALL_RECORDING_POLICY_APPROVED:'true',CALL_RECORDING_PROVIDER_RETENTION_VERIFIED:'true',CALL_RECORDING_NOTICE_URL:'https://example.com/notice.mp3' }
  expect(recordingNoticeUrl(env)).toBe(env.CALL_RECORDING_NOTICE_URL)
  expect(recordingNoticeUrl({ ...env, CALL_RECORDING_NOTICE_URL:'tts:sv-SE:test' })).toBeNull()
})
test('phone push contains no transcript or customer details', () => {
  const p = buildPushTemplate('meeting_summary', { source:'phone_call', recording_id:'rec_1', summary:'Secret customer text' })!
  expect(p.body).not.toContain('Secret'); expect(p.url).toBe('/dashboard/recordings/rec_1')
})
test('pipeline no longer selects latest deal or mutates its status', () => {
  const s = read('lib/pipeline-ai.ts')
  expect(s).not.toContain('moveDeal('); expect(s).not.toContain("order('created_at'")
  expect(s).toContain("'review_required'")
})
test('claim precedes pipeline; publication precedes push', () => {
  const s = read('app/api/voice/analyze/route.ts').split('export async function POST')[1]
  expect(s.indexOf('claimCallProcessing(')).toBeLessThan(s.indexOf('await processCallForPipeline('))
  expect(s.indexOf('await publishCallCards(')).toBeLessThan(s.indexOf('await sendApprovalPush('))
  expect(s).not.toContain(".update({\n              name: extractedInfo")
})
test('call API has owner gate, tenant filter and explicit DTO', () => {
  const s = read('app/api/voice/calls/route.ts')
  expect(s).toContain('isOwnerOrAdmin(user)'); expect(s).toContain("export const dynamic = 'force-dynamic'")
  expect(s).toContain("eq('business_id', auth.business.business_id)"); expect(s).toContain('deriveCallOutcome(')
  expect(s).not.toContain('...r,')
})
test('SQL locks tenant row, restricts execution and publishes transactionally', () => {
  const s = read('sql/v180_call_processing_and_retention.sql')
  expect(s).toContain('AND business_id = p_business_id FOR UPDATE')
  expect(s).toContain('ON CONFLICT (id) DO NOTHING')
  expect(s).toContain('FROM PUBLIC, anon, authenticated')
  expect(s).toContain('raw_deleted_at'); expect(s).not.toContain('EXCEPTION WHEN')
})
