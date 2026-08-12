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

/**
 * Value Ledger-grunden (kort → skapad artefakt, 2026-08-12): vilka
 * artefakt-ID:n SKAPADES av den här exekveringen? Vitlistad — vi spreadar
 * ALDRIG hela executionResult in i databasen (då följer felmeddelanden,
 * HTTP-metadata och annat brus med som payloaden inte ska bära). Bara
 * kända artefaktreferenser plockas ut, aldrig gissade nya nycklar.
 *
 * Kartlagd genom att gå igenom VARJE executor-case i
 * app/api/approvals/[id]/route.ts (`return {` + `action:`):
 *   ata_id        — create_ata_draft (ÄTA:n bakom en framtida faktura)
 *   invoice_id    — fakturera_projekt, review_auto_invoice
 *   quote_id      — create_quote_draft/quote_request/quote_addition,
 *                   create_ata_draft (reservväg utan projekt), four_eyes_quote
 *   task_id       — meeting_followup
 *   fact_id       — customer_fact
 *   booking_id    — reserverad för create_booking/autopilot_package —
 *                   inget case exponerar den på toppnivå ännu (den ligger
 *                   dold i classifyResponse-metadata), men nyckeln
 *                   vitlistas redan nu så en framtida fix inte missar
 *                   den här listan.
 *   campaign_id   — seasonal_campaign
 *   checklist_id  — checklist_forslag / egenkontroll_foto
 *   time_entry_id — time_attestation / tidrapport_forslag
 *   project_id    — checklist_forslag, four_eyes_project_close,
 *                   create_ata_draft, tidrapport_forslag
 *   sms_id        — send_sms/quote_nudge/review_request-familjen
 *   message_id    — send_email (Resend-referensen — INTE "email_id", det
 *                   är det fältnamn caset faktiskt returnerar)
 *   total         — beloppet för den skapade artefakten (offert/faktura),
 *                   när caset räknat fram det
 *
 * Rena metadatafält (results, error, ok, reason, navigate_to, sms_sent,
 * acknowledged, m.fl.) hoppas medvetet över — de beskriver UTFALLET, inte
 * en skapad artefakt.
 */
export const ARTIFACT_ID_KEYS = [
  'ata_id',
  'invoice_id',
  'quote_id',
  'task_id',
  'fact_id',
  'booking_id',
  'campaign_id',
  'checklist_id',
  'time_entry_id',
  'project_id',
  'sms_id',
  'message_id',
  'total',
] as const

/**
 * Plockar ut artefakt-ID:n ur ett exekveringsresultat. Grunden för
 * Value Ledger: kedjan kort → skapad artefakt ska vara bevisbar i
 * databasen, inte bara i HTTP-svaret (se persist-blocket i
 * app/api/approvals/[id]/route.ts). Bara vitlistade nycklar (ARTIFACT_ID_KEYS)
 * med definierade värden tas med — null/undefined skrivs aldrig.
 * Returnerar undefined (ingen artifacts-nyckel alls) när resultatet saknar
 * vitlistade fält, så payload.execution_result inte får en tom {}-nyckel
 * att tolka.
 */
export function extractExecutionArtifacts(
  result: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
  if (!result) return undefined
  const artifacts: Record<string, unknown> = {}
  for (const key of ARTIFACT_ID_KEYS) {
    const value = result[key]
    if (value !== undefined && value !== null) {
      artifacts[key] = value
    }
  }
  return Object.keys(artifacts).length > 0 ? artifacts : undefined
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
