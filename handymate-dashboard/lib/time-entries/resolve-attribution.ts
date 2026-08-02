/**
 * Etapp 1 Tier B (multi-employee-parity-plan.md): tool-router.ts logTime()
 * körs telefon-/Matte-triggat och har ingen inloggad-användare-identitet i
 * sitt anrop (till skillnad från checkin/approve, time_attestation-caset
 * och voice/execute — de tre andra insert-ställena, som alla har en riktig
 * användaridentitet att tillgå och fixades i en tidigare körning).
 *
 * Fallback-kedja för time_entry.business_user_id, i prioritetsordning:
 *   1. Bokningens assigned_user_id (Etapp 5 — manuell tilldelning i
 *      kalendern, eller ett dispatch-godkännande kan ha satt den).
 *   2. Om businessen bara har EN aktiv business_users-rad (enskild firma)
 *      — attribuera dit. Det är ett FAKTUM (det finns bara en möjlig
 *      person), inte en gissning.
 *   3. Annars null — aldrig sämre än tidigare beteende (som alltid var
 *      null), men inte en gissning för flermansfirmor utan tilldelning.
 */
export function resolveTimeEntryAttribution(
  bookingAssignedUserId: string | null | undefined,
  activeBusinessUserIds: string[],
): string | null {
  if (bookingAssignedUserId) return bookingAssignedUserId
  if (activeBusinessUserIds.length === 1) return activeBusinessUserIds[0]
  return null
}
