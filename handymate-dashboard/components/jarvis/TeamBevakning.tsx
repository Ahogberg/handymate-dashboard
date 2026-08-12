'use client'

import { useState } from 'react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { AGENT_INFO } from '@/components/dashboard/agentPersonas'
import type { BevakningsRad, FyndPekare } from '@/lib/jarvis/bevakning'

/**
 * "Det här sköter teamet" — bevakningen som en ✓-lista (Matte Command
 * Center, designkontraktet 2026-08-12).
 *
 * ═══ VARFÖR EN CHECKLISTA OCH INTE ETT AVATARGRID ═══
 *
 * Den gamla versionen (Tur 4 etapp 3) var kort i grid med Matte på en egen
 * fullbreddsrad överst — ett litet dashboard i dashboarden. Designkontraktet
 * vill ha kollegor som säger vad de håller koll på, en rad var: "✓ Karin
 * bevakar 4 fakturor". Raderna kommer FÄRDIGA ur lib/jarvis/bevakning.ts i
 * den ordning byggBevakning returnerar dem — ingen omsortering och ingen
 * påhittad räkning här, bara agentens namn (ur AGENT_INFO, aldrig
 * hårdkodat) framför den riktiga rubriken och detaljen.
 *
 * ═══ FYND-PEKAREN — PEKARE, ALDRIG KOPIA ═══
 *
 * "N nya fynd ↓" scrollar till agentens rad i Värt att veta. Fyndtexten bor
 * BARA där — en kopia i listan vore samma felklass som det gamla
 * närvarobandet (samma sak på två ställen → man slutar läsa båda).
 *
 * ═══ TRÖSKELN, EXPLICIT ═══
 *
 * `kompakt` sätts av ytan till `beslut >= 2` (besluten äger skärmen).
 */
export function TeamBevakning({
  rader,
  kompakt,
  fynd,
}: {
  rader: BevakningsRad[]
  kompakt: boolean
  fynd?: Record<string, FyndPekare>
}) {
  const [oppen, setOppen] = useState(false)

  // Ingen bevakning → ingenting. En tom lista hade sagt "teamet finns" när
  // frågan är "vad bevakar teamet".
  if (rader.length === 0) return null

  const scrollTillFynd = (agentId: string) => {
    const p = fynd?.[agentId]
    if (!p) return
    document.getElementById(p.anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (kompakt && !oppen) {
    return (
      <button
        type="button"
        onClick={() => setOppen(true)}
        className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 min-h-[44px] flex items-center gap-3 text-left hover:border-slate-300 transition-colors"
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
    <div className="bg-white border border-slate-200 rounded-2xl px-4">
      {kompakt && (
        <div className="flex justify-end pt-2 -mb-1">
          <button
            type="button"
            onClick={() => setOppen(false)}
            aria-label="Fäll ihop bevakningen"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 transition-colors"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>
      )}
      <ul className="m-0 p-0 list-none divide-y divide-slate-100">
        {rader.map(r => {
          const namn = AGENT_INFO[r.agentId]?.name ?? r.agentId
          return (
            <li key={`${r.agentId}-${r.rubrik}`} className="flex items-center gap-2.5 py-3">
              <span
                className={`inline-flex w-5 h-5 rounded-full items-center justify-center shrink-0 ${
                  r.aktiv ? 'bg-primary-50 text-primary-700' : 'bg-slate-100 text-slate-400'
                }`}
                aria-hidden
              >
                <Check className="w-3 h-3" strokeWidth={3} />
              </span>
              <AgentAvatar agentKey={r.agentId} size="sm" />
              <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">
                <b className="font-semibold text-slate-900">{namn}:</b> {r.rubrik}
                <span className="text-slate-400"> — {r.detalj}</span>
                {r.fraga && (
                  <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">
                    Fråga
                  </span>
                )}
              </span>
              {fynd?.[r.agentId] && (
                <button
                  type="button"
                  onClick={() => scrollTillFynd(r.agentId)}
                  className="shrink-0 text-xs font-semibold text-primary-700 hover:underline"
                >
                  {fynd[r.agentId].antal} ny{fynd[r.agentId].antal === 1 ? 'tt fynd' : 'a fynd'} ↓
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default TeamBevakning
