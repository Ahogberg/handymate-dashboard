/**
 * Klassificerar utfallet av executeApprovalPayload() till en persisterbar
 * status. Ren funktion, ingen I/O — testbar isolerat.
 *
 * Bakgrund (juli-audit): status-flippen till 'approved' sker ATOMISKT innan
 * exekveringen körs (se app/api/approvals/[id]/route.ts). Om exekveringen
 * sedan misslyckas fanns felet tidigare BARA i HTTP-svaret — missade
 * klienten det (mobilkrasch, stängd flik) trodde hantverkaren att SMS:et/
 * offerten/fakturan gick ut fast den aldrig gjorde det. Denna funktion
 * härleder ett stabilt utfall som skrivs till pending_approvals.payload så
 * spåret överlever även om ingen såg responsen.
 *
 * Reglerna är avsiktligt en spegling av hur klienten redan idag läser
 * execution-objektet (components/dashboard/PendingApprovalsBlock.tsx,
 * handleAction) — så att "vad UI:t visar" och "vad som sparas" alltid
 * stämmer överens.
 */

export type ExecutionOutcome = 'success' | 'failed' | 'skipped'

const REASON_TEXT: Record<string, string> = {
  permission_denied: 'Saknar behörighet',
  rate_limited: 'För många försök',
  four_eyes_required: 'Kräver ny granskning',
  fail: 'Handlingen kunde inte utföras',
}

export function classifyExecutionResult(
  result: Record<string, unknown> | null,
): { outcome: ExecutionOutcome; error_text: string | null } {
  // reject-actions kör aldrig executeApprovalPayload — executionResult är
  // null. Det är inte ett fel, bara "inget att exekvera".
  if (result === null) {
    return { outcome: 'skipped', error_text: null }
  }

  const reason = result.reason as string | undefined
  const isKnownFailReason =
    reason === 'fail' ||
    reason === 'permission_denied' ||
    reason === 'rate_limited' ||
    reason === 'four_eyes_required'

  const failed =
    Boolean(result.error) ||
    result.ok === false ||
    result.sms_sent === false ||
    isKnownFailReason

  if (failed) {
    const errorText = result.error
      ? String(result.error)
      : REASON_TEXT[reason || 'fail'] || REASON_TEXT.fail
    return { outcome: 'failed', error_text: errorText }
  }

  if (result.skipped) {
    return { outcome: 'skipped', error_text: null }
  }

  return { outcome: 'success', error_text: null }
}
