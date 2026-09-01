import type { CallProcessingState } from './call-processing'

export interface CallApproval {
  id: string
  approval_type: string
  title: string
  status: string
  expires_at?: string | null
  payload: Record<string, any> | null
}

export interface CallOutcomeItem {
  id: string
  title: string
  agent: string
  label: string
  href: string
}

const artifacts: Record<string, { key: string; route: string; label: string }> = {
  create_quote_draft: { key: 'quote_id', route: '/dashboard/quotes/', label: 'Offertutkast skapat — inte skickat' },
  meeting_followup: { key: 'task_id', route: '/dashboard/tasks', label: 'Uppföljningsuppgift skapad — inte ett utskick' },
  customer_fact: { key: 'fact_id', route: '/dashboard/customers/', label: 'Kunduppgift bekräftad' },
  // Samtalsefterarbete (2026-09-01): båda landar på projektet (payload.project_id).
  create_ata_draft: { key: 'ata_id', route: '/dashboard/projects/', label: 'ÄTA-utkast skapat — inte skickat' },
  project_log_note: { key: 'log_id', route: '/dashboard/projects/', label: 'Dagboksrad sparad — intern anteckning' },
}

const PROJEKTKORT = new Set(['create_ata_draft', 'project_log_note'])

/** Presentation only. No new AI, no inference from model text or approval status. */
export function deriveCallOutcome(state: CallProcessingState, rows: CallApproval[], now = new Date()) {
  const done: CallOutcomeItem[] = []
  const pending: CallOutcomeItem[] = []
  const failed: CallOutcomeItem[] = []
  const other: CallOutcomeItem[] = []
  for (const row of rows) {
    if (row.approval_type === 'meeting_summary') continue
    const payload = row.payload || {}
    const result = payload.execution_result
    const rule = artifacts[row.approval_type]
    const item: CallOutcomeItem = { id: row.id, title: row.title,
      agent: row.approval_type === 'create_quote_draft' || row.approval_type === 'create_ata_draft' ? 'Daniel'
        : row.approval_type === 'customer_fact' || row.approval_type === 'project_log_note' ? 'Matte' : 'Lisa',
      label: '', href: `/dashboard/approvals?recording_id=${encodeURIComponent(String(payload.recording_id || ''))}#approval-${encodeURIComponent(row.id)}` }
    if (result?.outcome === 'failed') {
      failed.push({ ...item, label: 'Kunde inte utföras — öppna beslutet' })
    } else if (result?.outcome === 'success' && rule && typeof result.artifacts?.[rule.key] === 'string') {
      const id = result.artifacts[rule.key]
      const href = row.approval_type === 'meeting_followup' ? rule.route
        : row.approval_type === 'customer_fact' && payload.customer_id
          ? `${rule.route}${encodeURIComponent(payload.customer_id)}`
          : PROJEKTKORT.has(row.approval_type) && payload.project_id
            ? `${rule.route}${encodeURIComponent(payload.project_id)}`
            : row.approval_type === 'create_quote_draft' ? `${rule.route}${encodeURIComponent(id)}` : item.href
      done.push({ ...item, href, label: rule.label })
    } else if (row.status === 'pending' && !payload.source_expired && (!row.expires_at || Date.parse(row.expires_at) > now.getTime())) {
      pending.push({ ...item, label: 'Väntar på ditt beslut' })
    } else {
      other.push({ ...item, label: payload.source_expired || row.status === 'expired' || (row.expires_at && Date.parse(row.expires_at) <= now.getTime())
        ? 'Utgånget — inget nytt har utförts' : row.status === 'rejected' ? 'Avvisat'
          : result?.outcome === 'skipped' ? 'Kvitterat utan utförande' : 'Utförandet är inte verifierat' })
    }
  }
  const pipeline = state.pipeline
  if (pipeline && ['created_lead', 'already_created'].includes(pipeline.action) && pipeline.leadId && pipeline.dealId) {
    done.unshift({ id: `deal:${pipeline.dealId}`, title: 'Kvalificerad förfrågan registrerad', agent: 'Lisa',
      label: 'Lead och affär finns — inte en vunnen affär', href: '/dashboard/pipeline' })
  }
  const processingIssue = state.phase === 'failed' || state.phase === 'partial'
    ? 'Efterarbetet kunde inte slutföras. Sparade förslag finns kvar; försök igen för att komplettera.'
    : state.phase === 'processing' ? 'Samtalet bearbetas. Du kan lämna sidan och komma tillbaka.'
      : state.phase === 'expired' ? 'Råunderlaget är gallrat. Bekräftade handlingar har egna lagringsregler.'
        : !state.version && rows.length ? 'Äldre samtal: fullständigheten i efterarbetet är inte verifierad.' : null
  return { done, pending, failed, other, processingIssue,
    retryable: ['failed', 'partial'].includes(state.phase || '') || (state.phase === 'processing' && Date.parse(state.lease_until || '') <= now.getTime()),
    analyzed: state.phase === 'complete',
  }
}
