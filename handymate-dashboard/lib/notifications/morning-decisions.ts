export interface MorningDecision {
  id: string
  title: string
  created_at: string
  amount_kr?: number
  expires_at?: string | null
}
export function pickMorningDecisions(
  rows: MorningDecision[],
): MorningDecision[] {
  return [...rows]
    .sort((a, b) => {
      const aDeadline = a.expires_at
        ? Date.parse(a.expires_at)
        : Number.POSITIVE_INFINITY
      const bDeadline = b.expires_at
        ? Date.parse(b.expires_at)
        : Number.POSITIVE_INFINITY
      return (
        aDeadline - bDeadline ||
        (a.expires_at || b.expires_at
          ? (b.amount_kr ?? 0) - (a.amount_kr ?? 0)
          : 0) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id)
      )
    })
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
