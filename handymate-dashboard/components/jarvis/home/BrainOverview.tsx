'use client'

import { useMission } from '@/lib/mission/MissionProvider'
import { deriveBrainOverview, scheduledFollowupCount } from '@/lib/jarvis/brain-overview'

interface Props {
  handled: number | null | undefined
  needsYou: number | null | undefined
  moneyCases: number | null | undefined
}

export function BrainOverview({ handled, needsYou, moneyCases }: Props) {
  const mission = useMission()
  const missionState = mission.loading ? 'loading' : mission.error ? 'unavailable' : 'known'
  const missionActive = missionState === 'known' && mission.mission?.status === 'active'
  const cells = deriveBrainOverview({
    handledVerified: handled,
    missionState,
    missionActive,
    waitingFollowups: missionActive ? scheduledFollowupCount(mission.handover) : null,
    decisions: needsYou,
    moneyCases,
  })
  return <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-3" aria-label="Firman just nu">
    <h2 className="sr-only">Firman just nu</h2>
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {cells.map(cell => <div key={cell.label} className="min-w-0 rounded-xl bg-slate-50 px-3 py-2.5">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{cell.label}</dt>
        <dd className="mt-1 text-sm font-medium text-slate-800">{cell.value}</dd>
      </div>)}
    </dl>
  </section>
}
