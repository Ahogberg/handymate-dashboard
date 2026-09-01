/**
 * Offertens giltighetstid är ett löfte från skapandedatumet, inte en rullande
 * timer från senaste autospar. Samma indata ger samma datum oavsett när en
 * redigering råkar ske.
 */
export function calculateQuoteValidUntil(createdAt: string | Date, validDays: number): string {
  const anchor = createdAt instanceof Date ? new Date(createdAt.getTime()) : new Date(createdAt)
  if (Number.isNaN(anchor.getTime())) throw new Error('Offertens skapandedatum är ogiltigt')
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > 3650) throw new Error('Ogiltig giltighetstid')
  anchor.setUTCDate(anchor.getUTCDate() + validDays)
  return anchor.toISOString().slice(0, 10)
}
