import { test, expect } from '@playwright/test'
import { requireApprovalReview } from '../lib/approvals/review-guard'
import { ACTION_CONTRACT } from '../lib/approvals/action-contract'
import { buildApprovalReview, REVIEWABLE_MESSAGE_TYPES, INTERNAL_REVIEW } from '../lib/approvals/review-contract'
import { queueSeasonalCampaign } from '../lib/approvals/queue-seasonal-campaign'

const secret = 'test-only-not-a-real-secret'
const approval = { id: 'a1', approval_type: 'seasonal_campaign', title: 'Höstkampanj', payload: { sms_text: 'Hela texten '.repeat(80), customers: [{ customer_id: 'c1', phone_number: '+46701234567' }, { customer_id: 'c2', phone_number: '+46707654321' }] } }
const input = (body: any = { action: 'approve' }) => ({ approval: structuredClone(approval), businessId: 'b1', actorId: 'u1', body })
const gate = (i: ReturnType<typeof input>, now = 1000) => requireApprovalReview(i, secret, now)

test('first click reveals all text and recipients without authorizing execution', () => {
  const r = gate(input())!
  expect(r.status).toBe(428)
  expect(r.data.review?.messages[0].text).toBe(approval.payload.sms_text)
  expect(r.data.review?.messages[0].recipients).toEqual(['+46701234567', '+46707654321'])
  expect(r.data.review?.confirmLabel).toContain('köa')
})
test('only the explicit confirmation of the unchanged reviewed action passes', () => {
  const token = gate(input())!.data.review_token
  expect(gate(input({ action: 'approve', review_token: token }))).toBeNull()
  for (const mutate of [
    (i: any) => { i.actorId = 'u2' }, (i: any) => { i.businessId = 'b2' },
    (i: any) => { i.approval.id = 'a2' }, (i: any) => { i.approval.payload.sms_text = 'Unseen' },
    (i: any) => { i.approval.payload.customers[0].phone_number = '+46701111111' },
    (i: any) => { i.body.action = 'retry' }, (i: any) => { i.body.action_overrides = { send: 'approved' } },
    (i: any) => { i.body.action = 'edit'; i.body.edited_payload = { sms_text: 'Unseen' } },
  ]) { const i = input({ action: 'approve', review_token: token }); mutate(i); expect(gate(i)?.status).toBe(428) }
  expect(gate(input({ action: 'approve', review_token: token }), 601001)?.status).toBe(428)
})
test('editing previews and binds the exact edited text, never the original', () => {
  const i = input({ action: 'edit', edited_payload: { sms_text: 'Min ändring' } })
  const r = gate(i)!
  expect(r.data.review?.messages[0].text).toBe('Min ändring')
  expect(gate({ ...i, body: { ...i.body, review_token: r.data.review_token } })).toBeNull()
})
test('malformed signatures and missing content fail closed', () => {
  for (const token of ['true', '1.a', '601000.' + '0'.repeat(64)]) expect(gate(input({ action: 'approve', review_token: token }))?.status).toBe(428)
  for (const customers of [[], [{}], [{ phone_number: '' }], [{ phone_number: '+46701234567' }, { phone_number: '+46701234567' }]]) {
    const i = input(); i.approval.payload.customers = customers as any
    expect(gate(i)?.status).toBe(422)
  }
  const i = input(); i.approval.payload.sms_text = ' '
  expect(gate(i)?.status).toBe(422)
})
test('signed review choices allow only the displayed sub-actions', () => {
  const i = input()
  const prepared: any = {
    review: { title: 'Avslut', effect: 'Valda följder', confirmLabel: 'Avsluta', messages: [], choices: [
      { id: 'invoice', label: 'Faktura', description: 'Skapa utkast', defaultSelected: true },
      { id: 'review', label: 'Recension', description: 'Skapa förslag', defaultSelected: true },
    ] },
    snapshot: { project: 'p1' },
  }
  const first = requireApprovalReview({ ...i, prepared }, secret, 1000)!
  expect(first.status).toBe(428)
  expect(requireApprovalReview({ ...i, body: { action: 'approve', review_token: first.data.review_token,
    action_overrides: { invoice: 'approved', review: 'rejected' } }, prepared }, secret, 1000)).toBeNull()
  const invalid = requireApprovalReview({ ...i, body: { action: 'approve', review_token: first.data.review_token,
    action_overrides: { unreviewed_send: 'approved' } }, prepared }, secret, 1000)!
  expect(invalid.status).toBe(422)
  expect(invalid.data.code).toBe('approval_review_choice_invalid')
})
test('every registered type is covered: information is a receipt, mutations need review or remain pending', () => {
  for (const [type, klass] of Object.entries(ACTION_CONTRACT)) {
    const i = input(); i.approval.approval_type = type
    const r = gate(i)
    if (klass === 'INFORMATIONAL' || klass === 'ACKNOWLEDGEMENT') expect(r, type).toBeNull()
    else expect([422, 428], type).toContain(r?.status)
  }
  const i = input(); i.approval.approval_type = 'future_unknown_send'
  expect(gate(i)?.status).toBe(422)
  expect(gate(input({ action: 'snooze' }))).toBeNull()
  expect(gate(input({ action: 'reject' }))?.status).toBe(428)
})
test('all supported outgoing types expose the same fields consumed by their executors', () => {
  for (const type of REVIEWABLE_MESSAGE_TYPES) {
    const p = { to: '+46701234567', message: 'Message', sms_text: 'Campaign', suggested_sms: 'Suggested',
      customer_phone: '+46707654321', customer_reply_pending: 'Reply', entity: { phone: '+46702222222' },
      customers: [{ phone_number: '+46703333333' }], body: '<b>Literal body</b>', subject: 'Ämne' }
    if (type === 'send_email') p.to = 'kund@example.test'
    const r = buildApprovalReview({ approval_type: type, payload: p })
    expect(r.confirmLabel, type).toBeTruthy()
    expect(r.messages[0].text, type).toBe(type === 'seasonal_campaign' ? p.sms_text : type === 'send_email' ? p.body : type === 'send_matte_customer_reply' ? p.customer_reply_pending : ['proactive_care', 'warranty_followup', 'customer_reactivation'].includes(type) ? p.suggested_sms : p.message)
  }
})

function fakeCampaignDb(fail: string | null = null, existing = false) {
  const calls: any[] = []
  const db = { from(table: string) {
    let op = 'read', values: any
    const chain: any = new Proxy({}, { get(_, key) {
      if (key === 'then') return (resolve: any) => {
        calls.push({ table, op, values })
        resolve({ error: fail === `${table}:${op}` ? { message: 'Injected' } : null,
          data: op === 'read' ? (existing ? { campaign_id: 'existing', status: 'scheduled' } : null) : [{ campaign_id: 'test' }] })
      }
      return (v: any) => { if (key === 'insert' || key === 'update') { op = String(key); values = v }; return chain }
    } }); return chain
  } }
  return { db, calls }
}
test('campaign is staged with exact text/recipients before scheduling and reports queued', async () => {
  const { db, calls } = fakeCampaignDb()
  const result = await queueSeasonalCampaign(db as any, 'b1', 'a1', approval.payload)
  expect(result.queued).toBe(true)
  expect(calls[1].values.status).toBe('draft')
  expect(calls[1].values.message).toBe(approval.payload.sms_text)
  expect(calls[2].values.map((c: any) => c.phone_number)).toEqual(approval.payload.customers.map(c => c.phone_number))
  expect(calls[3].values.status).toBe('scheduled')
})
test('database errors never schedule incomplete campaigns; retry never creates a duplicate', async () => {
  for (const fail of ['sms_campaign:read', 'sms_campaign:insert', 'sms_campaign_recipient:insert']) {
    const { db, calls } = fakeCampaignDb(fail)
    expect((await queueSeasonalCampaign(db as any, 'b1', 'a1', approval.payload)).ok).toBe(false)
    expect(calls.some(c => c.values?.status === 'scheduled')).toBe(false)
  }
  const { db, calls } = fakeCampaignDb(null, true)
  expect((await queueSeasonalCampaign(db as any, 'b1', 'a1', approval.payload)).ok).toBe(false)
  expect(calls).toHaveLength(1)
})
