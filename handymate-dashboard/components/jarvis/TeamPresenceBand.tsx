'use client'

import { AgentAvatar } from '@/components/agents/AgentAvatar'
import type { NarvaroRad } from '@/lib/jarvis/team-presence'

/**
 * Teamets närvaro överst på hemskärmen.
 *
 * Ansiktena först, en rad text per agent. Ingen ram och inga knappar — bandet
 * är "berättar"-läget i agentspråket, och får aldrig se ut som något att
 * besluta om. Det är därför det ligger OVANFÖR rubriken "Kräver ditt beslut"
 * och inte blandas in bland korten.
 *
 * Renderar ingenting när ingen gjort något. En tom rad ansikten hade sagt
 * "teamet finns" när frågan är "vad har teamet gjort".
 */
export function TeamPresenceBand({ rader }: { rader: NarvaroRad[] }) {
  if (rader.length === 0) return null

  return (
    <div className="mt-4 bg-white border border-slate-200 rounded-2xl px-4 py-3">
      <div className="flex items-center gap-2 mb-2.5">
        <h2 className="m-0 text-[13px] font-semibold text-slate-700">Teamet senaste dygnet</h2>
        <span className="text-[11px] text-slate-400">{rader.length} har jobbat</span>
      </div>

      <div className="flex flex-col gap-2">
        {rader.map(r => (
          <div key={r.agentId} className="flex items-center gap-2.5">
            <AgentAvatar agentKey={r.agentId} size="sm" />
            <span className="min-w-0 flex-1 text-[13px] text-slate-600 truncate">
              <b className="font-semibold text-slate-900">{r.namn}</b>
              {' — '}
              {r.senaste}
            </span>
            {r.antal > 1 && (
              <span className="shrink-0 text-[11px] font-semibold text-slate-400 tabular-nums">
                {r.antal} st
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default TeamPresenceBand
