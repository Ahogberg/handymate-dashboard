/** Shared by the legacy dispatcher and the customer-facing handoff. */
export function quoteFollowupStep(sentAt: string | null, count: number | null, intervalDays: number | null, now = Date.now()) {
  const sent = sentAt ? Date.parse(sentAt) : NaN
  const round = count ?? 0
  const days = intervalDays && intervalDays > 0 ? intervalDays : 5
  if (!Number.isFinite(sent) || !Number.isInteger(round) || round < 0 || round >= 3 || !Number.isFinite(days)) return null
  const eligibleAt = sent + days * (round + 1) * 86400000
  if (!Number.isFinite(new Date(eligibleAt).getTime())) return null
  return { channel: round === 1 ? 'email' as const : 'sms' as const,
    eligibleAt: new Date(eligibleAt).toISOString(), due: now >= eligibleAt, round: round + 1 }
}
