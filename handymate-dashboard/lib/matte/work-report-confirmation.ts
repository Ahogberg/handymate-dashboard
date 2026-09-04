import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BusinessUser } from '../permissions'
import { signPendingExternalAction, type PendingExternalAction } from '../agent/external-confirm'
import { loadWorkReportContext, prepareWorkReportAction, workReportSummary, WorkReportError, type WorkReportAction, type WorkReportContext } from './work-report'

export function pendingWorkReport(action: WorkReportAction, ctx: WorkReportContext, businessId: string, threadId: string | null, remaining: WorkReportAction[] = [], requestId: string = crypto.randomUUID()) {
  return {
    tool_name: action.toolName, args: action.toolInput, summary: workReportSummary(action, ctx),
    confirm_label: action.toolName === 'log_time' ? 'Lägg till tiden'
      : action.toolName === 'add_work_note' ? 'Spara anteckningen'
      : action.toolName === 'log_material' ? 'Bokför materialet'
      : 'Spara förslaget',
    token: signPendingExternalAction({ ...action, businessId, threadId, agent: 'lars', workReport: { projectId: ctx.projectId, userId: ctx.userId, date: ctx.date, requestId, remaining } }),
  }
}

/** No model call, no second execution path: exact signed action -> shared router.
 * Revalidate role/assignment/timer at the moment of confirmation, not just proposal.
 */
export async function confirmWorkReport(
  pending: PendingExternalAction, db: SupabaseClient, businessId: string, user: BusinessUser | null,
  execute: (name: string, input: Record<string, unknown>, db: SupabaseClient, businessId: string, context: any) => Promise<any>,
) {
  const scope = pending.workReport
  if (!scope || !user || scope.userId !== user.id || pending.businessId !== businessId) throw new WorkReportError(403, 'Bekräftelsen tillhör en annan användare.')
  const ctx = await loadWorkReportContext(db, businessId, user, scope.projectId, scope.date)
  if (!scope.requestId || scope.remaining.length > 3) throw new WorkReportError(400, 'Rapportens bekräftelse är ogiltig.')
  // A deterministic unique key is the concurrent/retry guard. Same token or
  // reissued next card can never insert a second row for this action.
  const confirmationId = crypto.createHash('sha256').update(`${businessId}:${user.id}:${scope.requestId}:${pending.toolName}`).digest('hex').slice(0, 32)
  const result = await execute(pending.toolName, pending.toolInput, db, businessId, {
    businessName: '', contactEmail: '', googleConnection: null, triggerSource: 'user', businessUserId: user.id,
    workReport: scope, confirmationId,
  })
  const ok = result?.success === true && !result?.error
  let next: ReturnType<typeof pendingWorkReport> | null = null
  let nextError = ''
  if (ok && scope.remaining.length) {
    try {
      const nextAction = prepareWorkReportAction(scope.remaining[0].toolName, scope.remaining[0].toolInput, ctx)
      // scope.remaining kan nu vara upp till 3 långt (taket höjt till fyra
      // förslag/tur, se app/api/matte/chat/route.ts). Bär vidare RESTEN av
      // kedjan (index 1+) till nästa kort — annars tappas senare kort tyst
      // så fort en tur innehåller fler än två förslag.
      next = pendingWorkReport(nextAction, ctx, businessId, pending.threadId, scope.remaining.slice(1), scope.requestId)
    } catch (error) { nextError = error instanceof Error ? error.message : 'Nästa förslag kunde inte kontrolleras.' }
  }
  const label = pending.toolName === 'log_time' ? 'Tiden'
    : pending.toolName === 'add_work_note' ? 'Arbetsanteckningen'
    : pending.toolName === 'log_material' ? 'Materialet'
    : 'Förslaget'
  const reply = ok
    ? `${result.data?.message || `${label} sparad.`}${next ? '\nNästa del är inte sparad ännu. Kontrollera nästa kort.' : ''}${nextError ? `\nNästa del sparades inte: ${nextError}` : ''}`
    : `${label} kunde inte sparas: ${result?.error || 'Skrivningen kunde inte bekräftas.'} Ingen senare del har utförts.`
  return {
    reply, messages: [{ agent: 'lars', content: reply }], current_agent: 'lars', thread_id: pending.threadId,
    action: null, confirmed: ok, pending_confirmation: next,
    execution_result: { tool: pending.toolName, status: ok ? (result.data?.duplicate ? 'already_saved' : 'saved') : 'failed' },
  }
}
