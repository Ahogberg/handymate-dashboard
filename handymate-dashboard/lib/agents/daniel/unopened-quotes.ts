/**
 * Daniel — obeöppnad-offert-trigger (2026-06-03).
 *
 * Audit-3 (tasks/agent-triggers-map.md) identifierade ett designgap:
 * befintlig stale-opens-trigger (view_count >= 3) missar offerter som
 * skickats men aldrig öppnats av kunden. Det är sannolikt ett större
 * försäljnings-gap än stale-opens — kunden har glömt offerten, lägre
 * konvertering.
 *
 * Predikat:
 *   - quote.status === 'sent'
 *   - quote.view_count === 0
 *   - 5 <= days_since_sent <= 14
 *
 * Fönstret 5-14d:
 *   - Min 5d: ge kunden andrum efter mottagandet. Nudga dag 2 = spammigt.
 *   - Max 14d: efter 2 veckor är offert sannolikt död; bättre att låta
 *     den expira än nudga.
 *
 * Pure helpers — inga DB-anrop. Testbar via scripts/test-daniel-unopened.ts.
 */

export const UNOPENED_WINDOW_MIN_DAYS = 5
export const UNOPENED_WINDOW_MAX_DAYS = 14

/** Minimal shape som predikatet behöver — kompatibel med QuoteRow. */
export interface UnopenedCandidate {
  quote_id: string
  status: string
  view_count: number | null
  sent_at: string | null
}

/**
 * Days mellan sent_at och now. Returnerar null om sent_at saknas.
 * Avrundning: floor — en faktura som skickades exakt 5 dagar och 1 timme
 * sedan räknas som 5 dagar (inkluderas i fönstret), inte 6.
 */
export function daysSinceSent(sentAt: string | null, now: number): number | null {
  if (!sentAt) return null
  const ms = now - new Date(sentAt).getTime()
  if (ms < 0) return null
  return Math.floor(ms / 86400000)
}

/**
 * Predikat: är denna offert en kandidat för obeöppnad-nudge?
 *
 * Returnerar false för:
 *   - Fel status (accepted/draft/expired/declined/signed)
 *   - view_count > 0 (kunden har öppnat — då gäller stale-opens-triggern istället)
 *   - sent_at saknas (data-issue; säkrare att skippa)
 *   - days_since_sent utanför 5-14d-fönstret
 */
export function isUnopenedActionable(
  quote: UnopenedCandidate,
  now: number = Date.now(),
): boolean {
  if (quote.status !== 'sent') return false
  if (Number(quote.view_count || 0) > 0) return false
  const days = daysSinceSent(quote.sent_at, now)
  if (days === null) return false
  return days >= UNOPENED_WINDOW_MIN_DAYS && days <= UNOPENED_WINDOW_MAX_DAYS
}
