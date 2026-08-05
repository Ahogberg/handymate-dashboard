/**
 * Kanoniska offertstatusar (gap 6-bis, tasks/vilande-pengar-masterplan.md
 * VP3). quotes.status är fri text utan CHECK — värdena som faktiskt SKRIVS
 * är (kartlagt 2026-08-05):
 *
 *   draft | sent | opened | accepted | signed | declined | expired
 *
 * 'rejected' skrivs ALDRIG till quotes (det är en pending_approvals-status).
 * Två läsfilter filtrerade ändå på 'rejected' och matchade därför aldrig
 * något — prisintelligensen hade t.ex. aldrig sett en förlorad offert.
 * Använd konstanterna här i alla nya statusfilter så driften inte uppstår
 * igen.
 */

/** Osåld men fortfarande öppen — skickad eller öppnad, obesvarad. */
export const OPEN_QUOTE_STATUSES = ['sent', 'opened'] as const

/** Vunnen. */
export const WON_QUOTE_STATUSES = ['accepted', 'signed'] as const

/** Förlorad — kunden avböjde eller offerten gick ut. */
export const LOST_QUOTE_STATUSES = ['declined', 'expired'] as const
