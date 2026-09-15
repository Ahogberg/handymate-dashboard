import { test, expect } from '@playwright/test'
import { c5Modules } from './helpers/c5-module'
import { invoiceReminderOutcome } from '../lib/autonomy/invoice-reminder-outcome'
const originalEnv = { ...process.env }
test.afterEach(() => {
  process.env = { ...originalEnv }
})
test('invoice reminder receipt reflects skipped, accepted and failed delivery', () => {
  expect(
    invoiceReminderOutcome({ skipped: true, smsSent: false, emailSent: false }),
  ).toBe('skipped')
  expect(
    invoiceReminderOutcome({ skipped: false, smsSent: true, emailSent: false }),
  ).toBe('success')
  expect(
    invoiceReminderOutcome({ skipped: false, smsSent: false, emailSent: true }),
  ).toBe('success')
  expect(
    invoiceReminderOutcome({
      skipped: false,
      smsSent: false,
      emailSent: false,
    }),
  ).toBe('failed')
})
test('H1 digest notice keeps both inbox row and existing activity receipt without push', async () => {
  process.env.HANDOFF_INBOX_ENABLED = 'true'
  delete process.env.CHANNEL_PREFLIGHT_ENABLED
  const writes: Array<{ table: string; row: any }> = []
  const pushes: any[] = []
  const db = {
    from(table: string) {
      let row: any
      const query: any = {
        insert(value: any) {
          row = value
          writes.push({ table, row: value })
          return query
        },
        select() {
          return query
        },
        async single() {
          return {
            data: {
              id: table === 'pending_approvals' ? 'notice-1' : 'activity-1',
            },
            error: null,
          }
        },
      }
      return query
    },
  }
  const { skapaKort } = c5Modules({
    '@/lib/supabase': { getServerSupabase: () => db },
    '@/lib/notifications/approval-push': {
      sendApprovalPush: async (value: any) => pushes.push(value),
    },
  })('lib/approvals/skapa-kort.ts')
  expect(
    await skapaKort(db, {
      business_id: 'a',
      approval_type: 'dispatch_suggestion',
      title: 'Planera om',
      description: 'Planera om dagens uppdrag.',
    }),
  ).toEqual({ id: 'notice-1', kanal: 'digest' })
  expect(writes.map((write) => write.table)).toEqual([
    'pending_approvals',
    'automation_activity',
  ])
  expect(pushes).toEqual([])
})
function enable() {
  process.env.SUPERVISED_AUTONOMY_ENABLED = 'true'
  process.env.CHANNEL_PREFLIGHT_ENABLED = 'true'
  process.env.HANDOFF_INBOX_ENABLED = 'true'
}
for (const failure of ['grant', 'channel', 'audit', 'revoked', 'flags', 'none'])
  test(`real supervised boundary: ${failure}`, async () => {
    enable()
    if (failure === 'flags') delete process.env.CHANNEL_PREFLIGHT_ENABLED
    const calls: string[] = []
    let checks = 0
    const db = {
      rpc: async (name: string, args: any) => {
        calls.push(name)
        return {
          data: name === 'record_autonomy_attempt' ? 'attempt' : true,
          error: failure === 'audit' ? { message: 'unavailable' } : null,
        }
      },
    }
    const load = c5Modules({
      './earned-autonomy': {
        isAutonomous: async () => {
          checks++
          return failure !== 'grant' && !(failure === 'revoked' && checks === 2)
        },
        AUTONOMY_META: { booking_reminder: { label: 'Bokningspåminnelse' } },
      },
      '@/lib/channels/preflight': {
        gateChannel: async () => {
          calls.push('preflight')
          return { ok: failure !== 'channel' }
        },
      },
    })
    const { supervisedSend } = load('lib/autonomy/supervised-send.ts')
    const result = await supervisedSend(
      db,
      'a',
      'booking_reminder',
      'sms',
      async () => {
        calls.push('provider')
        return 'sent'
      },
      () => 'success',
      'blocked',
    )
    expect(result).toBe(failure === 'none' ? 'sent' : 'blocked')
    expect(calls.includes('provider')).toBe(failure === 'none')
    if (failure === 'none')
      expect(calls).toEqual([
        'preflight',
        'record_autonomy_attempt',
        'provider',
        'finish_autonomy_attempt',
      ])
    if (failure === 'revoked')
      expect(calls).toEqual([
        'preflight',
        'record_autonomy_attempt',
        'finish_autonomy_attempt',
      ])
  })
test('provider rejection preserves the pre-written unknown receipt and never retries', async () => {
  enable()
  const calls: string[] = []
  const { supervisedSend } = c5Modules({
    './earned-autonomy': {
      isAutonomous: async () => true,
      AUTONOMY_META: { booking_reminder: { label: 'Bokning' } },
    },
    '@/lib/channels/preflight': { gateChannel: async () => ({ ok: true }) },
  })('lib/autonomy/supervised-send.ts')
  await expect(
    supervisedSend(
      {
        rpc: async (n: string) => {
          calls.push(n)
          return { data: 'attempt' }
        },
      },
      'a',
      'booking_reminder',
      'sms',
      async () => {
        calls.push('provider')
        throw Error('timeout')
      },
      () => 'success',
      'blocked',
    ),
  ).rejects.toThrow('timeout')
  expect(calls).toEqual(['record_autonomy_attempt', 'provider'])
})
function routes(role = 'owner', rpcError = false) {
  const writes: any[] = []
  const db = {
    rpc: async (name: string, args: any) => {
      writes.push({ name, args })
      return { data: true, error: rpcError ? { message: 'offline' } : null }
    },
    from: () => ({
      upsert: (data: any) => {
        writes.push(data)
        return {
          select: () => ({ single: async () => ({ data, error: null }) }),
        }
      },
    }),
  }
  const load = c5Modules({
    '@/lib/auth': {
      getAuthenticatedBusiness: async () => ({ business_id: 'a' }),
    },
    '@/lib/permissions': {
      getCurrentUser: async () => ({ id: 'real-actor', role }),
      isOwnerOrAdmin: (u: any) => ['owner', 'admin'].includes(u.role),
    },
    '@/lib/supabase': { getServerSupabase: () => db },
  })
  return { load, writes }
}
function req(body: any) {
  return new Request('http://local/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
test('consent route validates role, tenant, explicit boolean and uses server actor', async () => {
  enable()
  const member = routes('member')
  expect(
    (
      await member
        .load('app/api/autonomy/consent/route.ts')
        .POST(req({ answer: true, expected_business_id: 'a' }))
    ).status,
  ).toBe(403)
  expect(member.writes).toEqual([])
  const r = routes()
  const api = r.load('app/api/autonomy/consent/route.ts')
  expect(
    (await api.POST(req({ answer: true, expected_business_id: 'b' }))).status,
  ).toBe(409)
  expect(
    (await api.POST(req({ answer: 'yes', expected_business_id: 'a' }))).status,
  ).toBe(400)
  expect(r.writes).toEqual([])
  expect(
    (
      await api.POST(
        req({ answer: false, expected_business_id: 'a', actor_id: 'forged' }),
      )
    ).status,
  ).toBe(200)
  expect(r.writes).toEqual([
    {
      name: 'answer_autonomy_consent',
      args: { p_business_id: 'a', p_actor_id: 'real-actor', p_answer: false },
    },
  ])
  const broken = routes('owner', true)
  expect(
    (
      await broken
        .load('app/api/autonomy/consent/route.ts')
        .POST(req({ answer: true, expected_business_id: 'a' }))
    ).status,
  ).toBe(503)
})
test('settings endpoint cannot grant autonomy; member cannot alter settings', async () => {
  const member = routes('member')
  expect(
    (
      await member.load('app/api/automation/settings/route.ts').PUT(
        req({
          earned_autonomy: { booking_reminder: { status: 'autonomous' } },
        }),
      )
    ).status,
  ).toBe(403)
  expect(member.writes).toEqual([])
  const owner = routes()
  expect(
    (
      await owner.load('app/api/automation/settings/route.ts').PUT(
        req({
          business_id: 'b',
          earned_autonomy: { booking_reminder: { status: 'autonomous' } },
          work_start: '08:00',
        }),
      )
    ).status,
  ).toBe(200)
  expect(owner.writes[0]).toMatchObject({
    business_id: 'a',
    work_start: '08:00',
  })
  expect(owner.writes[0]).not.toHaveProperty('earned_autonomy')
})
test('off only exposes POST; signed target cannot be replaced by request fields; persistence failure is not success', async () => {
  process.env.AUTONOMY_OFF_SECRET = 'test-secret'
  const r = routes()
  const api = r.load('app/api/autonomy/off/route.ts')
  expect(api.GET).toBeUndefined()
  const token = r
    .load('lib/autonomy/off-token.ts')
    .autonomyOffToken('b', 'invoice_reminder')
  expect(
    (await api.POST(req({ token, business_id: 'a', key: 'booking_reminder' })))
      .status,
  ).toBe(200)
  expect(r.writes[0].args).toMatchObject({
    p_business_id: 'b',
    p_key: 'invoice_reminder',
  })
  const broken = routes('owner', true)
  expect(
    (
      await broken
        .load('app/api/autonomy/off/route.ts')
        .POST(req({ key: 'booking_reminder', expected_business_id: 'a' }))
    ).status,
  ).toBe(503)
})
test('morning persists claim before push, targets owner, classifies unknown and obeys quiet time', async () => {
  enable()
  const calls: any[] = []
  let quiet = true,
    claimed = false
  const db = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async () => ({
            data: [{ business_id: 'a', user_id: 'owner' }],
          }),
        }),
      }),
    }),
    rpc: async (n: string, args: any) => {
      calls.push(n)
      if (n === 'claim_handoff_digest') {
        if (claimed) return { data: null }
        claimed = true
        return {
          data: {
            day: '2026-09-15',
            attempt_token: 't',
            decisions: [{ title: 'Ett beslut' }],
            remaining: 3,
            items: [{ kind: 'expired', title: 'Ett gammalt förslag' }],
          },
        }
      }
      expect(args.p_status).toBe('unknown')
      return { data: true }
    },
  }
  const { sendHandoffMorning } = c5Modules({
    './tyst-tid': { arTystTid: () => quiet },
    './push-internal': {
      sendInternalPush: async (args: any) => {
        calls.push('push')
        expect(args.target_user_id).toBe('owner')
        expect(args.body).toContain('Ett beslut')
        expect(args.body).toContain('Ett gammalt förslag')
        return { delivered: false, reason: 'network' }
      },
    },
  })('lib/notifications/handoff-morning.ts')
  expect(await sendHandoffMorning(db)).toBe(0)
  expect(calls).toEqual([])
  quiet = false
  await sendHandoffMorning(db)
  await sendHandoffMorning(db)
  expect(calls).toEqual([
    'claim_handoff_digest',
    'push',
    'finish_handoff_digest',
    'claim_handoff_digest',
  ])
})
