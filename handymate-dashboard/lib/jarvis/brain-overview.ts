export interface BrainOverviewInput {
  handledVerified: number | null | undefined
  missionState: 'loading' | 'known' | 'unavailable'
  missionActive: boolean
  waitingFollowups: number | null
  decisions: number | null | undefined
  moneyCases: number | null | undefined
}

export interface BrainOverviewCell { label: string; value: string }

export function scheduledFollowupCount(
  handover: { followups?: Array<{ state: string }> } | null,
): number | null {
  if (!handover) return null
  return (handover.followups ?? []).filter(item => item.state === 'scheduled').length
}

export function deriveBrainOverview(input: BrainOverviewInput): BrainOverviewCell[] {
  const readNumber = (value: number | null | undefined, known: (n: number) => string) =>
    value === undefined ? 'Läser läget…' : value === null ? 'Läget kunde inte läsas' : known(value)
  const missionValue = input.missionState === 'loading'
    ? 'Läser läget…'
    : input.missionState === 'unavailable'
      ? 'Läget kunde inte läsas'
      : input.missionActive ? 'Aktivt uppdrag – öppna för aktuellt läge' : 'Inget aktivt uppdrag'
  const waitingValue = input.missionState === 'loading'
    ? 'Läser läget…'
    : input.missionState === 'unavailable'
      ? 'Läget kunde inte läsas'
      : !input.missionActive
        ? 'Inget aktivt uppdrag'
        : input.waitingFollowups == null
          ? 'Läget kunde inte läsas'
          : input.waitingFollowups ? `${input.waitingFollowups} planerade uppföljningar i uppdraget` : 'Inga planerade uppföljningar i uppdraget'
  return [
    { label: 'Hanterat', value: readNumber(input.handledVerified, n => `${n} visade verifierade resultat`) },
    { label: 'Arbetar med', value: missionValue },
    { label: 'Väntar på', value: waitingValue },
    { label: 'Behöver dig', value: readNumber(input.decisions, n => n ? `${n} visade beslut` : 'Inga beslut just nu') },
    { label: 'Pengar', value: readNumber(input.moneyCases, n => n ? `${n} synliga pengakategorier` : 'Inga synliga pengakategorier') },
  ]
}
