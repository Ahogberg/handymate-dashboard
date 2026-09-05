export const REPORT_LABELS = {
  log_time: 'Tid', add_work_note: 'Arbetsanteckning', log_material: 'Material', create_ata_draft: 'ÄTA-förslag',
} as const
export type ReportTool = keyof typeof REPORT_LABELS
export interface ReportConfirmation { token: string; tool_name: ReportTool; summary: string; confirm_label: string; args: Record<string, unknown> }
export function readReportConfirmation(value: unknown, projectId: string, date: string): ReportConfirmation | null {
  if (value == null) return null
  if (typeof value !== 'object') throw new Error('Förslaget kunde inte kontrolleras.')
  const v = value as Record<string, unknown>
  const args = v.args as Record<string, unknown> | null
  if (typeof v.tool_name !== 'string' || !Object.prototype.hasOwnProperty.call(REPORT_LABELS, v.tool_name) || typeof v.token !== 'string' || !v.token || typeof v.summary !== 'string' || typeof v.confirm_label !== 'string' || !args || args.project_id !== projectId) throw new Error('Förslaget hör inte till den här rapporten.')
  if (v.tool_name === 'log_time' && args.work_date !== date || v.tool_name === 'add_work_note' && args.log_date !== date) throw new Error('Förslagets datum stämmer inte med rapporten.')
  return v as unknown as ReportConfirmation
}
export function confirmedReportResult(value: unknown, pending: ReportConfirmation): 'saved' | 'already_saved' | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, any>
  return v.confirmed === true && v.execution_result?.tool === pending.tool_name && ['saved','already_saved'].includes(v.execution_result?.status) ? v.execution_result.status : null
}
