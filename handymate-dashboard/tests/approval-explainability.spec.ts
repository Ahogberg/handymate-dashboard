import { expect, test } from '@playwright/test'
import { approvalEvidence, withApprovalEvidence } from '../lib/approvals/explainability'
import { prepareApprovalReview } from '../lib/approvals/prepare-review'
import { approvalEvidenceRows } from '../lib/approvals/review-client'

test('uses stored source excerpts, understandable references, and distinct date meanings', () => {
  const evidence = approvalEvidence({ approval_type: 'customer_fact', payload: {
    evidence_quote: 'Vi behöver vara klara före fredag.', recording_id: 'raw-source-id',
    fact_type: 'commitment', call_date: '2026-09-10T08:30:00Z', due_date_iso: '2026-09-18',
    _decision: { model: 'hidden-model', prompt: 'callAnalysis', inputHash: 'abc' },
  } })
  expect(evidence).toEqual({ heading: 'Varför säger Handymate detta?', items: [
    { label: 'Sparat källutdrag', text: 'Vi behöver vara klara före fredag.' },
    { label: 'Sparad källreferens', text: 'Samtal eller möte' },
    { label: 'Föreslaget datum', text: '18 sep. 2026' },
  ] })
  expect(JSON.stringify(evidence)).not.toContain('raw-source-id')
  expect(JSON.stringify(evidence)).not.toContain('hidden-model')
  expect(JSON.stringify(evidence)).not.toContain('inputHash')
})

test('maps approved source families and rejects malformed dates', () => {
  expect(approvalEvidence({ approval_type: 'project_log_note', payload: {
    source_text: 'Ring efter lunch', recording_id: 'rec-1', call_date: 'not-a-date',
  } })?.items).toEqual([
    { label: 'Sparad källreferens', text: 'Samtal eller möte' },
  ])
  expect(approvalEvidence({ approval_type: 'project_log_note', payload: {
    recording_id: 'rec-1', call_date: '2026-09-10T08:30:00Z',
  } })?.items).toEqual([
    { label: 'Sparad källreferens', text: 'Samtal eller möte' },
    { label: 'Källdatum', text: '10 sep. 2026 08:30 UTC' },
  ])
  expect(approvalEvidence({ approval_type: 'project_log_note', payload: {
    recording_id: 'rec-1', call_date: '2026-02-30T08:30:00Z',
  } })?.items).toEqual([{ label: 'Sparad källreferens', text: 'Samtal eller möte' }])
  expect(approvalEvidence({ approval_type: 'create_quote_draft', payload: { lead_id: 'lead-1' } })?.items)
    .toEqual([{ label: 'Sparad källreferens', text: 'Lead' }])
  expect(approvalEvidence({ approval_type: 'create_ata_draft', payload: { source_report_id: 'report-1' } })?.items)
    .toEqual([{ label: 'Sparad källreferens', text: 'Jobbrapport' }])
  expect(approvalEvidence({ approval_type: 'send_sms', payload: { source_text: 'ignored' } })).toBeNull()
})

test('shows neutral missing evidence for a supported old row', () => {
  expect(approvalEvidence({ approval_type: 'meeting_followup', payload: {
    _decision: { model: 'not evidence' }, description: 'model-written rationale',
  } })?.items).toEqual([{
    label: 'Underlag', text: 'Det sparade förslaget saknar källutdrag och begriplig källreferens.',
  }])
})

test('a proposed date never substitutes for missing source evidence', () => {
  expect(approvalEvidence({ approval_type: 'customer_fact', payload: {
    fact_type: 'commitment', due_date_iso: '2026-02-30',
  } })?.items).toEqual([{ label: 'Underlag', text: 'Det sparade förslaget saknar källutdrag och begriplig källreferens.' }])
  expect(approvalEvidence({ approval_type: 'customer_fact', payload: {
    fact_type: 'preference', due_date_iso: '2026-09-18',
  } })?.items).toEqual([{ label: 'Underlag', text: 'Det sparade förslaget saknar källutdrag och begriplig källreferens.' }])
})

test('prepare wrapper uses original payload and covers an early type review', async () => {
  const approval = { id: 'a1', approval_type: 'meeting_followup', title: 'Följ upp',
    payload: { title: 'Ring kunden', source_text: 'Originalkälla', recording_id: 'rec-1' } }
  const prepared = await prepareApprovalReview({} as any, 'business-1', approval, {
    action: 'edit', edited_payload: { source_text: 'Insmugglad källa', recording_id: 'fake' },
  })
  expect(prepared?.review.evidence?.items).toContainEqual({ label: 'Sparat källutdrag', text: 'Originalkälla' })
  expect(JSON.stringify(prepared?.review.evidence)).not.toContain('Insmugglad')
  expect(prepared?.review.confirmLabel).toBe('Skapa uppgiften')
})

test('shared renderer consumes evidence rows without adding an action', () => {
  const evidence = approvalEvidence({ approval_type: 'create_quote_draft', payload: { lead_id: 'lead-1' } })!
  expect(approvalEvidenceRows({ title: 'Granska', effect: '', confirmLabel: null, messages: [], evidence })).toEqual([
    { heading: 'Varför säger Handymate detta?', text: '' },
    { heading: 'Sparad källreferens', text: 'Lead' },
  ])
})

test('quote followup evidence distinguishes saved quote date and round from delivery', () => {
  for (const [round, channel] of [[1, 'sms'], [2, 'email'], [3, 'sms']] as const) {
    const evidence = approvalEvidence({ approval_type: `send_${channel}`, payload: {
      quote_followup_round: { quote_id: 'internal-quote-id', round, channel, sent_at: '2026-09-10T08:30:00Z' },
      quote_followup_source: 'internal-fingerprint', message: 'AI-written message is not source evidence',
    } })!
    expect(evidence.items).toContainEqual({ label: 'Sparad källreferens', text: 'Offert' })
    expect(evidence.items).toContainEqual({ label: 'Offertens sparade utskicksdatum', text: '10 sep. 2026 08:30 UTC' })
    expect(evidence.items).toContainEqual({ label: 'Sparad uppföljning', text: `Omgång ${round} av 3 · ${channel === 'sms' ? 'SMS' : 'E-post'}` })
    expect(evidence.items.find(item => item.label === 'Status')?.text).toContain('inte en kvittens')
    expect(JSON.stringify(evidence)).not.toMatch(/internal-|AI-written/)
  }
})

test('incomplete or contradictory followup context stays explicitly unverified', () => {
  const payload = { quote_followup_round: { quote_id: 'q1', round: 1, channel: 'sms', sent_at: '2026-09-10T08:30:00Z' }, quote_followup_source: 'hash' }
  for (const invalid of [
    { ...payload, quote_followup_source: '' },
    { ...payload, quote_followup_round: { ...payload.quote_followup_round, round: 2 } },
    { ...payload, quote_followup_round: { ...payload.quote_followup_round, sent_at: '2026-02-30T08:30:00Z' } },
  ]) {
    expect(approvalEvidence({ approval_type: 'send_sms', payload: invalid })?.items).toEqual([
      { label: 'Underlag', text: 'Det sparade förslaget saknar ett fullständigt underlag för offertuppföljningen.' },
    ])
  }
  expect(approvalEvidence({ approval_type: 'send_email', payload })?.items[0].label).toBe('Underlag')
  expect(approvalEvidence({ approval_type: 'send_sms', payload: { message: 'An ordinary message' } })).toBeNull()
})

test('followup evidence does not enable a blocked send or replace its reviewed text', () => {
  const prepared = { review: { title: 'Granska', effect: 'Underlaget måste verifieras.', confirmLabel: null,
    blockedReason: 'Kunden har hört av sig.', messages: [{ channel: 'SMS' as const, recipients: ['+46700000000'], text: 'Granskad text' }] } }
  const result = withApprovalEvidence(prepared, { approval_type: 'send_sms', payload: {
    quote_followup_round: { quote_id: 'q1', round: 1, channel: 'sms', sent_at: '2026-09-10T08:30:00Z' }, quote_followup_source: 'hash',
  } })
  expect(result.review.confirmLabel).toBeNull()
  expect(result.review.blockedReason).toBe(prepared.review.blockedReason)
  expect(result.review.messages).toEqual(prepared.review.messages)
  expect(approvalEvidenceRows(result.review)).toContainEqual({ heading: 'Sparad källreferens', text: 'Offert' })
})
