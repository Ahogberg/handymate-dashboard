import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  gateCustomerSms,
  type SmsGateDecision,
  type SmsPurpose,
} from '../lib/outbound/sms-gate'

const ROOT = path.resolve(__dirname, '..')

type TableResult = { data: any; error: any }

function fakeSupabase(results: Record<string, TableResult | TableResult[]>) {
  const calls: Array<{ table: string; filters: Record<string, unknown> }> = []

  function next(table: string): TableResult {
    const configured = results[table]
    if (Array.isArray(configured)) return configured.shift() ?? { data: null, error: null }
    return configured ?? { data: null, error: null }
  }

  return {
    calls,
    client: {
      from(table: string) {
        const filters: Record<string, unknown> = {}
        const query: any = {
          select() { return query },
          eq(column: string, value: unknown) { filters[column] = value; return query },
          in(column: string, value: unknown) { filters[column] = value; return query },
          gte(column: string, value: unknown) { filters[column] = value; return query },
          limit() { return query },
          maybeSingle() {
            calls.push({ table, filters: { ...filters } })
            return Promise.resolve(next(table))
          },
          then(resolve: (value: TableResult) => unknown, reject: (error: unknown) => unknown) {
            calls.push({ table, filters: { ...filters } })
            return Promise.resolve(next(table)).then(resolve, reject)
          },
        }
        return query
      },
    } as any,
  }
}

const CUSTOMER = {
  customer_id: 'cust_a',
  phone_number: '0701234567',
  sms_opt_out: false,
}

async function decide(overrides: {
  results?: Record<string, TableResult | TableResult[]>
  purpose?: SmsPurpose
  recipient?: 'customer' | 'internal'
  customerId?: string | null
  approvalId?: string | null
  messageType?: string
} = {}): Promise<{ decision: SmsGateDecision; calls: ReturnType<typeof fakeSupabase>['calls'] }> {
  const fake = fakeSupabase(overrides.results ?? {
    customer: { data: CUSTOMER, error: null },
    sms_log: { data: null, error: null },
  })
  const decision = await gateCustomerSms({
    supabase: fake.client,
    businessId: 'biz_a',
    phoneE164: '+46701234567',
    customerId: overrides.customerId === undefined ? 'cust_a' : overrides.customerId,
    recipient: overrides.recipient ?? 'customer',
    purpose: overrides.purpose ?? 'transactional',
    messageType: overrides.messageType ?? 'booking_confirmation',
    approvalId: overrides.approvalId,
    now: new Date('2026-08-15T12:00:00.000Z'),
  })
  return { decision, calls: fake.calls }
}

test.describe('central SMS-grind', () => {
  test('interna notiser passerar utan att läsa kunddata', async () => {
    const { decision, calls } = await decide({ recipient: 'internal', purpose: 'internal' })
    expect(decision).toMatchObject({ allowed: true, customerId: null })
    expect(calls).toEqual([])
  })

  test('recipient och purpose får inte motsäga varandra', async () => {
    const { decision } = await decide({ recipient: 'customer', purpose: 'internal' })
    expect(decision).toMatchObject({ allowed: false, code: 'invalid_contract' })
  })

  test('databasfel i tenant-/opt-out-uppslaget blockerar utskicket', async () => {
    const { decision } = await decide({
      results: { customer: { data: null, error: { message: 'db down' } } },
    })
    expect(decision).toMatchObject({ allowed: false, code: 'guard_unavailable' })
  })

  test('främmande eller saknad kund blockeras', async () => {
    const { decision } = await decide({ results: { customer: { data: null, error: null } } })
    expect(decision).toMatchObject({ allowed: false, code: 'customer_not_found' })
  })

  test('telefonen måste tillhöra samma tenantverifierade kund', async () => {
    const { decision } = await decide({
      results: { customer: { data: { ...CUSTOMER, phone_number: '0709999999' }, error: null } },
    })
    expect(decision).toMatchObject({ allowed: false, code: 'recipient_mismatch' })
  })

  test('telefonuppslag utan customer_id kräver exakt en tenantmatch', async () => {
    const { decision, calls } = await decide({
      customerId: null,
      results: { customer: { data: [CUSTOMER], error: null } },
    })
    expect(decision).toMatchObject({ allowed: true, customerId: 'cust_a' })
    expect(calls[0]).toMatchObject({
      table: 'customer',
      filters: { business_id: 'biz_a', phone_number: ['+46701234567', '0701234567'] },
    })
  })

  test('telefonuppslag utan customer_id blockerar tvetydiga matcher', async () => {
    const { decision } = await decide({
      customerId: null,
      results: {
        customer: {
          data: [CUSTOMER, { ...CUSTOMER, customer_id: 'cust_b' }],
          error: null,
        },
      },
    })
    expect(decision).toMatchObject({ allowed: false, code: 'recipient_mismatch' })
  })

  test('STOPP blockerar alla vanliga kundklasser', async () => {
    const { decision } = await decide({
      results: { customer: { data: { ...CUSTOMER, sms_opt_out: true }, error: null } },
    })
    expect(decision).toMatchObject({ allowed: false, code: 'customer_opted_out' })
  })

  test('den explicita STOPP-kvittensen får skickas efter att flaggan sparats', async () => {
    const { decision } = await decide({
      purpose: 'consent_confirmation',
      messageType: 'opt_out_confirm',
      results: { customer: { data: { ...CUSTOMER, sms_opt_out: true }, error: null } },
    })
    expect(decision).toMatchObject({ allowed: true, customerId: 'cust_a' })
  })

  test('proaktiv kontakt spärras av ett faktiskt nyligt kund-SMS', async () => {
    const { decision } = await decide({
      purpose: 'proactive',
      messageType: 'review_request',
      results: {
        customer: { data: CUSTOMER, error: null },
        sms_log: { data: { sms_id: 'sms_recent' }, error: null },
      },
    })
    expect(decision).toMatchObject({ allowed: false, code: 'recent_customer_contact' })
  })

  test('transaktionella SMS frekvensblockeras inte', async () => {
    const { decision, calls } = await decide({ purpose: 'transactional' })
    expect(decision.allowed).toBe(true)
    expect(calls.filter(call => call.table === 'sms_log')).toHaveLength(0)
  })

  test('samma approval returnerar tidigare leverans i stället för att skicka igen', async () => {
    const { decision } = await decide({
      approvalId: 'appr_1',
      results: {
        customer: { data: CUSTOMER, error: null },
        sms_log: { data: { sms_id: 'sms_old', elks_id: 's123' }, error: null },
      },
    })
    expect(decision).toMatchObject({
      allowed: false,
      code: 'already_sent',
      previous: { smsId: 'sms_old', elksId: 's123' },
    })
  })

  test('leveranskvitterade SMS räknas fortfarande i dubblett- och frekvensskyddet', async () => {
    const { decision, calls } = await decide({
      approvalId: 'appr_1',
      results: {
        customer: { data: CUSTOMER, error: null },
        sms_log: { data: { sms_id: 'sms_delivered', elks_id: 's456' }, error: null },
      },
    })
    expect(decision).toMatchObject({ allowed: false, code: 'already_sent' })
    expect(calls.find(call => call.table === 'sms_log')?.filters.status)
      .toEqual(['sent', 'delivered'])
  })

  test('fel i approval-idempotenskollen blockerar hellre än dubbelskickar', async () => {
    const { decision } = await decide({
      approvalId: 'appr_1',
      results: {
        customer: { data: CUSTOMER, error: null },
        sms_log: { data: null, error: { message: 'lookup failed' } },
      },
    })
    expect(decision).toMatchObject({ allowed: false, code: 'guard_unavailable' })
  })
})

function source(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function sendBlocks(contents: string): string[] {
  const blocks: string[] = []
  const marker = 'sendSmsViaElks({'
  let cursor = 0
  while (true) {
    const start = contents.indexOf(marker, cursor)
    if (start < 0) return blocks
    let depth = 1
    let index = start + marker.length
    while (index < contents.length && depth > 0) {
      if (contents[index] === '{') depth++
      if (contents[index] === '}') depth--
      index++
    }
    blocks.push(contents.slice(start, index))
    cursor = index
  }
}

test.describe('alla sändvägar uttrycker säkerhetskontraktet', () => {
  test('varje direkt callsite anger recipient och purpose', () => {
    const roots = ['app', 'lib']
    const missing: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const relative = `${dir}/${entry.name}`
        if (entry.isDirectory()) walk(relative)
        else if (/\.tsx?$/.test(entry.name)) {
          sendBlocks(source(relative)).forEach((block, index) => {
            if (!block.includes('recipient:') || !block.includes('purpose:')) {
              missing.push(`${relative}#${index + 1}`)
            }
          })
        }
      }
    }
    roots.forEach(walk)
    expect(missing, `Sändvägar utan explicit kontrakt: ${missing.join(', ')}`).toEqual([])
  })

  test('STOPP sparas och kontrolleras före kvittensen', () => {
    const incoming = source('app/api/sms/incoming/route.ts')
    const update = incoming.indexOf('.update({', incoming.indexOf('const { data: updatedCustomer'))
    const optOutAssignment = incoming.indexOf('sms_opt_out: isStopCommand', update)
    const errorRead = incoming.indexOf('if (optOutUpdateError', update)
    const confirmation = incoming.indexOf('sendSmsViaElks({', update)
    expect(update).toBeGreaterThan(-1)
    expect(optOutAssignment).toBeGreaterThan(update)
    expect(errorRead).toBeGreaterThan(optOutAssignment)
    expect(confirmation).toBeGreaterThan(errorRead)
    expect(incoming).toContain("purpose: 'consent_confirmation'")
    expect(incoming).toContain("recipient: 'customer'")
  })

  test('en idempotent approval-retry räknas inte som ett nytt kvot-SMS', () => {
    const approvalRoute = source('app/api/approvals/[id]/route.ts')
    expect(approvalRoute).toContain('if (result.success && !result.idempotent)')
  })
})
