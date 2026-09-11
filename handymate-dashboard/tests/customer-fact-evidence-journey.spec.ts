import { expect, test } from '@playwright/test'
import { buildCustomerFactCard, normalizeDueDateIso } from '../lib/customer-facts/build-card'
import { prepareApprovalReview } from '../lib/approvals/prepare-review'
import { approvalEvidenceRows } from '../lib/approvals/review-client'

// Synthetic inputs stay in this process; no database, model or delivery calls.
function fixture(dueDate: string, email = false) {
  return { id: 'internal-evidence-test', ...buildCustomerFactCard({
    title: 'TEST – internt datumprov', description: 'TEST – kontrollera underlaget',
    source_text: 'TEST: kontrollera underlaget den 18 september.',
    confidence: 1, fact_type: 'commitment', due_date_iso: dueDate,
  }, {
    customerId: 'test-customer', evidensKalla: email ? 'mejlet' : 'mötet',
    ...(email ? { emailConversationId: 'test-email', verb: 'läste' as const } : { recordingId: 'test-recording' }),
    decisionRecord: { model: 'test-only', prompt: 'callAnalysis', promptVersion: 1,
      inputHash: 'test-hash', decidedAt: '2026-09-11T10:00:00Z' },
  }) } as { id: string; approval_type: string; payload: Record<string, unknown> }
}

function readOnlyDb() {
  const filters: unknown[][] = []
  const query = {
    select: () => query,
    eq: (...args: unknown[]) => { filters.push(args); return query },
    is: () => query,
    maybeSingle: async () => ({ data: { customer_id: 'test-customer', name: 'TEST-kund' }, error: null }),
    order: async () => ({ data: [], error: null }),
  }
  return { filters, db: { from: (table: string) => {
    expect(['customer', 'customer_fact']).toContain(table)
    return query
  } } as any }
}

for (const email of [false, true]) {
  test(`ordinary card producer preserves ${email ? 'email' : 'meeting'} evidence through review`, async () => {
    const { db, filters } = readOnlyDb()
    const prepared = await prepareApprovalReview(db, 'test-business', fixture('2026-09-18', email), { action: 'approve' })
    expect(prepared?.review.blockedReason).toBeUndefined()
    expect(prepared?.review.confirmLabel).toBe('Spara kunduppgiften')
    expect(prepared?.review.messages).toEqual([])
    expect(filters).toContainEqual(['business_id', 'test-business'])
    expect(filters).toContainEqual(['customer_id', 'test-customer'])
    const rows = approvalEvidenceRows(prepared!.review)
    expect(rows).toContainEqual({ heading: 'Sparat källutdrag', text: 'TEST: kontrollera underlaget den 18 september.' })
    expect(rows).toContainEqual({ heading: 'Sparad källreferens', text: email ? 'E-postkonversation' : 'Samtal eller möte' })
    expect(rows).toContainEqual({ heading: 'Föreslaget datum', text: '18 sep. 2026' })
    expect(JSON.stringify(rows)).not.toContain('test-hash')
  })
}

test('impossible dates cannot reach promise monitoring through the producer or an edited review', async () => {
  const approval = fixture('2026-02-30')
  expect(approval.payload.due_date_iso).toBeNull()
  const { db } = readOnlyDb()
  const prepared = await prepareApprovalReview(db, 'test-business', approval, { action: 'approve' })
  expect(prepared?.review.effect).not.toContain('Aktiverar bevakning')
  const edited = await prepareApprovalReview(db, 'test-business', fixture('2026-09-18'), {
    action: 'edit', edited_payload: { due_date_iso: '2026-02-30' },
  })
  expect(edited?.review.confirmLabel).toBeNull()
  expect(edited?.review.blockedReason).toBe('Löftet måste ha ett giltigt datum.')
})

test('accepts real leap days and explicit offsets; rejects rollover, local time and trailing text', () => {
  for (const date of ['2028-02-29', '2026-09-18T10:15:30.123Z', '2026-09-18T10:15+02:00']) {
    expect(normalizeDueDateIso(date)).toBe(date)
  }
  for (const date of ['2026-02-29', '2026-04-31', '2026-09-18T24:00Z', '2026-09-18T10:15', '2026-09-18 extra']) {
    expect(normalizeDueDateIso(date)).toBeNull()
  }
})
