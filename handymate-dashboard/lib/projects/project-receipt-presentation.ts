export type ProjectReceiptState = 'acknowledged' | 'saved' | 'sent' | 'queued' | 'partial' | 'failed' | 'needs_action' | 'rejected'

export interface ProjectReceiptRow {
  id: string
  status: string
  resolved_at?: unknown
  payload?: Record<string, any> | null
}

export interface ProjectReceiptPresentation {
  id: string
  state: ProjectReceiptState
  text: string
  statusLabel: string
  recordedAt: string | null
  recordedAtLabel: 'Körning registrerad' | 'Beslut registrerat' | null
  complete: boolean
}

export async function resolveProjectReceiptRead<T>(input: { sequence: number; isCurrent: (sequence: number) => boolean; load: () => Promise<T> }): Promise<{ stale: true } | { stale: false; value: T }> {
  const value = await input.load()
  return input.isCurrent(input.sequence) ? { stale: false, value } : { stale: true }
}

export function areValidProjectReceiptRows(rows: unknown[]): rows is ProjectReceiptRow[] {
  return rows.every(row => !!row && typeof row === 'object'
    && typeof (row as ProjectReceiptRow).id === 'string'
    && (row as ProjectReceiptRow).id.length > 0
    && !!(row as ProjectReceiptRow).payload
    && typeof (row as ProjectReceiptRow).payload === 'object')
}

const STATES = new Set<ProjectReceiptState>(['acknowledged', 'saved', 'sent', 'queued', 'partial', 'failed', 'needs_action', 'rejected'])
const LABELS: Record<ProjectReceiptState, string> = {
  acknowledged: 'Noterat', saved: 'Sparat', sent: 'Accepterat av sändtjänsten',
  queued: 'Köat', partial: 'Delvis utfört', failed: 'Misslyckat',
  needs_action: 'Behöver hanteras', rejected: 'Avvisat',
}

/** Present only the server-persisted receipt. Never reconstruct work from approval status. */
export function projectReceiptPresentation(row: ProjectReceiptRow): ProjectReceiptPresentation | null {
  if (typeof row.id !== 'string' || !row.id) return null
  const execution = row.payload?.execution_result
  const receipt = execution?.receipt
  if (!receipt || typeof receipt.text !== 'string' || !receipt.text.trim() || !STATES.has(receipt.state)) return null

  const executedAt = typeof execution.executed_at === 'string' && Number.isFinite(Date.parse(execution.executed_at))
    ? execution.executed_at
    : null
  const resolvedAt = typeof row.resolved_at === 'string' && Number.isFinite(Date.parse(row.resolved_at))
    ? row.resolved_at
    : null
  const state = receipt.state as ProjectReceiptState
  const outcome = execution.outcome
  const stalePositive = (state === 'saved' || state === 'sent') && outcome !== 'success'
  return {
    id: row.id,
    state,
    text: stalePositive ? `Tidigare sparad kvittens: ${receipt.text.trim()}` : receipt.text.trim(),
    statusLabel: stalePositive ? 'Utfall ej bekräftat' : LABELS[state],
    recordedAt: executedAt || resolvedAt,
    recordedAtLabel: executedAt ? 'Körning registrerad' : resolvedAt ? 'Beslut registrerat' : null,
    complete: outcome === 'success' && (state === 'saved' || state === 'sent'),
  }
}
