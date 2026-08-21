/**
 * Delade kategori-etiketter för supportärenden (support_ticket.category).
 * Används av både admin-kön (SupportQueueTab) och ärendevyn
 * (app/admin/support/[id]/page.tsx) — hölls tidigare dubblerad på båda
 * ställena, konsoliderad hit.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  cancellation: 'Uppsägning',
  refund: 'Återbetalning',
  gdpr: 'GDPR/juridik',
  bug_financial: 'Bugg (pengapåverkan)',
  human_requested: 'Ville prata med människa',
  other: 'Övrigt',
}
