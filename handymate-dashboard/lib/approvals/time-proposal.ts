/** The exact persisted fields shown in a time-proposal review. */
export function timeProposalFields(p: Record<string, any>) {
  if (typeof p.project_id !== 'string' || !p.project_id || !Number.isSafeInteger(p.suggested_minutes) || p.suggested_minutes <= 0) throw new Error('Projekt och positiv tidsåtgång måste anges.')
  if (typeof p.booking_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.booking_date) || !Number.isFinite(Date.parse(p.booking_date)) || new Date(p.booking_date).toISOString().slice(0, 10) !== p.booking_date) throw new Error('Arbetsdatumet måste vara ett giltigt kalenderdatum.')
  if (p.assigned_user_id && typeof p.assigned_user_id !== 'string') throw new Error('Medarbetaren kunde inte verifieras.')
  return {
    business_user_id: p.assigned_user_id || null,
    project_id: p.project_id,
    work_date: p.booking_date,
    duration_minutes: p.suggested_minutes,
    description: p.project_name ? `Tidrapport-förslag · ${p.project_name}` : 'Tidrapport-förslag',
    is_billable: true,
    approval_status: 'approved',
  }
}

export function timeProposalMatches(row: Record<string, any>, expected: ReturnType<typeof timeProposalFields>) {
  return Object.entries(expected).every(([key, value]) => row[key] === value)
}
