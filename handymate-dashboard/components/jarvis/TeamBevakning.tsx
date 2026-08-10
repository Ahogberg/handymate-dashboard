'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { AGENT_INFO } from '@/components/dashboard/agentPersonas'
import type { BevakningsRad } from '@/lib/jarvis/bevakning'

/**
 * "Teamet just nu" — bevakningskorten (Tur 4 etapp 3).
 *
 * Ersätter TeamPresenceBand: bandet härledde dåtid ("vad har agenterna
 * gjort"), det här säger vad teamet HÅLLER ÖGONEN PÅ och när de säger till.
 * Raderna kommer färdiga ur lib/jarvis/bevakning.ts — komponenten ritar bara.
 *
 * ═══ TRÖSKELN, EXPLICIT ═══
 *
 * `kompakt` sätts av ytan till `beslut >= 2` (förenar Tur 4 med 3b: besluten
 * äger skärmen). Kompakt = EN rad med staplade avatarer och antal; chevronen
 * expanderar lokalt. Vid `beslut <= 1` får bevakningen andas i en grid.
 *
 * Grön puls bara vid `aktiv` — schemalagda rader och Hannas fråga pulserar
 * aldrig (regeln bor i lib:en, inte här).
 */
export function TeamBevakning({ rader, kompakt }: { rader: BevakningsRad[]; kompakt: boolean }) {
  const [oppen, setOppen] = useState(false)

  // Ingen bevakning → ingenting. En tom rad ansikten hade sagt "teamet finns"
  // när frågan är "vad bevakar teamet".
  if (rader.length === 0) return null

  if (kompakt && !oppen) {
    return (
      <button
        type="button"
        onClick={() => setOppen(true)}
        className="mt-6 w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 min-h-[44px] flex items-center gap-3 text-left hover:border-slate-300 transition-colors"
      >
        <span className="flex -space-x-2 shrink-0">
          {rader.slice(0, 4).map(r => (
            <span key={r.agentId} className="inline-flex rounded-lg ring-2 ring-white">
              <AgentAvatar agentKey={r.agentId} size="sm" />
            </span>
          ))}
        </span>
        <span className="flex-1 min-w-0 text-sm text-slate-600 truncate">
          Teamet bevakar <b className="font-semibold text-slate-900">{rader.length} saker</b>
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
      </button>
    )
  }

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-2.5">
        <h2 className="m-0 text-[15px] font-semibold text-slate-900">Teamet just nu</h2>
        <span className="text-xs text-slate-400">säger till när något behöver dig</span>
        {kompakt && (
          <button
            type="button"
            onClick={() => setOppen(false)}
            aria-label="Fäll ihop bevakningen"
            className="ml-auto w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 transition-colors"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {rader.map(r => (
          <div key={`${r.agentId}-${r.rubrik}`} className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2.5">
              <AgentAvatar agentKey={r.agentId} size="sm" />
              <span className="min-w-0 text-[13px] font-semibold text-slate-900 truncate">
                {AGENT_INFO[r.agentId]?.name ?? r.agentId}
              </span>
              {r.fraga && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 shrink-0">
                  Fråga
                </span>
              )}
              {r.aktiv && (
                <span className="relative flex h-2 w-2 ml-auto shrink-0" aria-hidden>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              )}
            </div>
            <p className="m-0 mt-2 text-sm font-medium text-slate-800 leading-snug">{r.rubrik}</p>
            <p className="m-0 mt-0.5 text-xs text-slate-500 leading-snug">{r.detalj}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default TeamBevakning
