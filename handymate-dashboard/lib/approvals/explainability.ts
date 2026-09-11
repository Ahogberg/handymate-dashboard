import type { ApprovalReview } from './review-contract'

export interface ApprovalEvidence {
  heading: 'Varför säger Handymate detta?'
  items: { label: string; text: string }[]
}

const SUPPORTED = new Set([
  'customer_fact', 'meeting_followup', 'project_log_note',
  'create_quote_draft', 'create_ata_draft',
])

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const displayDate = (value: unknown): string | null => {
  const valueText = text(value)
  if (!valueText) return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valueText)
  const validCalendarDate = (year: string, month: string, day: string) => {
    const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`)
    return date.getUTCFullYear() === Number(year) && date.getUTCMonth() + 1 === Number(month) && date.getUTCDate() === Number(day)
  }
  if (dateOnly) {
    const [, year, month, day] = dateOnly
    if (!validCalendarDate(year, month, day)) return null
    const date = new Date(`${valueText}T00:00:00.000Z`)
    return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
  }
  const timestamp = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(valueText)
  if (!timestamp || !validCalendarDate(timestamp[1], timestamp[2], timestamp[3])) return null
  const date = new Date(valueText)
  if (!Number.isFinite(date.getTime())) return null
  return `${new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date)} UTC`
}

/** Customer-facing evidence comes only from the original persisted payload.
 * Decision metadata, model rationale and edited preview input are never evidence. */
export function approvalEvidence(approval: {
  approval_type: string
  payload?: Record<string, unknown> | null
}): ApprovalEvidence | null {
  if (!SUPPORTED.has(approval.approval_type)) return null
  const payload = approval.payload || {}
  const items: ApprovalEvidence['items'] = []
  const type = approval.approval_type
  const excerpt = type === 'customer_fact' ? text(payload.evidence_quote)
    : ['meeting_followup', 'create_quote_draft', 'create_ata_draft'].includes(type) ? text(payload.source_text)
    : null
  if (excerpt) items.push({ label: 'Sparat källutdrag', text: excerpt })

  let hasSourceReference = false
  const reference = (source: string) => { hasSourceReference = true; items.push({ label: 'Sparad källreferens', text: source }) }
  if (['customer_fact', 'meeting_followup', 'project_log_note', 'create_quote_draft', 'create_ata_draft'].includes(type) && text(payload.recording_id)) reference('Samtal eller möte')
  else if (type === 'customer_fact' && text(payload.email_conversation_id)) reference('E-postkonversation')
  else if (type === 'create_ata_draft' && text(payload.source_report_id)) reference('Jobbrapport')
  else if (type === 'create_ata_draft' && text(payload.source_preparation_id)) reference('Projektförberedelse')
  else if (type === 'create_quote_draft' && text(payload.lead_id)) reference('Lead')

  if (!excerpt && !hasSourceReference) items.push({ label: 'Underlag', text: 'Det sparade förslaget saknar källutdrag och begriplig källreferens.' })

  const sourceDate = type === 'project_log_note' ? displayDate(payload.call_date) : null
  if (sourceDate) items.push({ label: 'Källdatum', text: sourceDate })
  const proposedDate = type === 'meeting_followup' ? displayDate(payload.due_date)
    : type === 'customer_fact' && payload.fact_type === 'commitment' ? displayDate(payload.due_date_iso)
    : null
  if (proposedDate) items.push({ label: 'Föreslaget datum', text: proposedDate })
  return { heading: 'Varför säger Handymate detta?', items }
}

export function withApprovalEvidence<T extends { review: ApprovalReview } | undefined>(
  prepared: T,
  approval: { approval_type: string; payload?: Record<string, unknown> | null },
): T {
  if (!prepared) return prepared
  const evidence = approvalEvidence(approval)
  return evidence ? { ...prepared, review: { ...prepared.review, evidence } } as T : prepared
}
