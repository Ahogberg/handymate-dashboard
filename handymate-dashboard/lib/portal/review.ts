/**
 * Kundomdömet i portalen — delade konstanter för PortalReviewCTA (klient)
 * och POST /api/portal/[token]/review (server).
 *
 * Återskapad 2026-09-08: commit 35fe3db7 (yta 4, beslutskorten) importerade
 * den här modulen men filen lades aldrig till i git, så main slutade
 * typkontrollera. Innehållet följer commitens beskrivning och rutten:
 *   1–3 stjärnor sparas och går som meddelande i tråden, aldrig Google;
 *   4–5 stjärnor sparas och ger Google-kortet. Ett omdöme per kund (409).
 */

/** Valbara etiketter vid 4–5 stjärnor. Rutten släpper bara igenom dessa. */
export const REVIEW_TAGS = [
  'Kom i tid',
  'Snyggt jobb',
  'Bra bemötande',
  'Höll priset',
  'Städade efter sig',
] as const

export type ReviewTag = (typeof REVIEW_TAGS)[number]

/** Kommentarens maxlängd, klipps både i klienten och på servern. */
export const REVIEW_COMMENT_MAX = 500

/** 1–3 är ett lågt omdöme: kräver kommentar, går till tråden, aldrig till Google. */
export function isLowRating(rating: number): boolean {
  return Number.isFinite(rating) && rating <= 3
}
