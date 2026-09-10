export interface BrainOverviewInput {
  handledVerified: number | null
  missionKnown: boolean
  missionActive: boolean
  waitingFollowups: number | null
  decisions: number | null
  moneyCases: number | null
}

export interface BrainOverviewCell { label: string; value: string }

export function scheduledFollowupCount(
  handover: { followups?: Array<{ state: string }> } | null,
): number | null {
  if (!handover) return null
  return (handover.followups ?? []).filter(item => item.state === 'scheduled').length
}

export function deriveBrainOverview(input: BrainOverviewInput): BrainOverviewCell[] {
  return [
    { label: 'Hanterat', value: input.handledVerified == null ? 'Läget kunde inte läsas' : `${input.handledVerified} visade verifierade resultat` },
    { label: 'Arbetar med', value: !input.missionKnown ? 'Läget kunde inte läsas' : input.missionActive ? 'Aktivt uppdrag – öppna för aktuellt läge' : 'Inget aktivt uppdrag' },
    { label: 'Väntar på', value: input.waitingFollowups == null ? 'Läget kunde inte läsas' : input.waitingFollowups ? `${input.waitingFollowups} planerade uppföljningar i uppdraget` : 'Inga planerade uppföljningar i uppdraget' },
    { label: 'Behöver dig', value: input.decisions == null ? 'Läget kunde inte läsas' : input.decisions ? `${input.decisions} visade beslut` : 'Inga beslut just nu' },
    { label: 'Pengar', value: input.moneyCases == null ? 'Läget kunde inte läsas' : input.moneyCases ? `${input.moneyCases} synliga pengakategorier` : 'Inga synliga pengakategorier' },
  ]
}
