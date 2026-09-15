export interface MorningDecision {
  id: string
  title: string
  created_at: string
  amount_kr?: number
}
export function pickMorningDecisions(
  rows: MorningDecision[],
): MorningDecision[] {
  return [...rows]
    .sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) ||
        (b.amount_kr ?? 0) - (a.amount_kr ?? 0) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 3)
}
export function expirySummary(
  items: Array<{ kind: string; title: string }>,
): string {
  const expired = items.filter((i) => i.kind === 'expired')
  return expired.length
    ? `${expired.length} förslag fick inget svar: ${expired
        .slice(0, 3)
        .map((i) => i.title)
        .join(' · ')}`
    : ''
}
