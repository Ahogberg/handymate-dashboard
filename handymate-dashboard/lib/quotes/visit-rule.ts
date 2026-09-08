/** A deliberately narrow first rule: the owner's explicit number of visits.
 * It changes scope text, never hours, prices or deductions. */
export interface VisitRule { version: 1; kind: 'planned_visits'; visits: number; jobType: string }

export function readVisitRule(value: unknown): VisitRule | null {
  if (!value || typeof value !== 'object') return null
  const r = value as Record<string, unknown>
  return r.version === 1 && r.kind === 'planned_visits'
    && typeof r.visits === 'number' && Number.isInteger(r.visits) && r.visits >= 1 && r.visits <= 20
    && typeof r.jobType === 'string' && r.jobType.trim().length > 0 && r.jobType.length <= 100
    ? { version: 1, kind: 'planned_visits', visits: r.visits, jobType: r.jobType } : null
}

export function visitRuleText(visits: number): string {
  if (!Number.isInteger(visits) || visits < 1 || visits > 20) throw new Error('Ange mellan 1 och 20 besök.')
  return `Planerade besök: ${visits}.`
}

export function applyVisitRule(description: string, visits: number): string {
  const line = visitRuleText(visits)
  // Only replace the exact line owned by this feature. Other text is the user's.
  const rest = description.split('\n').filter(row => !/^Planerade besök: \d+\.$/.test(row.trim())).join('\n').trim()
  return [rest, line].filter(Boolean).join('\n\n')
}
