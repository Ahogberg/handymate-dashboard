'use client'

import { useEffect, useState } from 'react'
import { BadgeCheck, Clock3, Hourglass } from 'lucide-react'
import { retentionRad, type Agarrapport } from '@/lib/value/agarrapport'
import { AGENT_INFO } from '@/components/dashboard/agentPersonas'
import type { PengarSummary } from '@/lib/value/pengar-pa-bordet'

/**
 * "Värdet den här månaden" — ägarrapportens live-block på Månadsrapporten
 * (Spår A1, 2026-08-10). INTE en ny sida: Månadsrapporten ÄR ägarens
 * rapportyta (rådets NOT NOW: en andra ekonomiyta blir en konkurrerande
 * sanning).
 *
 * Tre sanningsnivåer med varsin etikett — aldrig hopslagna:
 * BEKRÄFTAT (attributionskärnan) · UPPSKATTAT (märkt) · VILANDE (potential).
 * Retention-raden renderas bara när kostnadskällan är säker (servern
 * avgör — null betyder ingen rad, aldrig en gissning).
 *
 * Tystnadsregeln: 403/fel → ingenting renderas. Blocket är grädde.
 */
export function AgarrapportBlock() {
  const [rapport, setRapport] = useState<Agarrapport | null>(null)
  const [vilandeKr, setVilandeKr] = useState<number | null>(null)

  useEffect(() => {
    let aktiv = true
    fetch('/api/value/agarrapport')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (aktiv && d?.rapport) setRapport(d.rapport) })
      .catch(() => { /* blocket är grädde, aldrig mjölk */ })
    // Vilande ur samma källa som Att hämta — ingen andra sanning om kronorna.
    fetch('/api/dashboard/pengar')
      .then(r => (r.ok ? r.json() : null))
      .then((d: PengarSummary | null) => { if (aktiv && d && typeof d.totalKr === 'number') setVilandeKr(d.totalKr) })
      .catch(() => { /* raden utelämnas */ })
    return () => { aktiv = false }
  }, [])

  if (!rapport) return null

  const kr = (n: number) => `${n.toLocaleString('sv-SE')} kr`
  const manad = new Date().toLocaleDateString('sv-SE', { month: 'long' })
  const raden = retentionRad(rapport)
  const harNagot = rapport.bekraftat.kr > 0 || (vilandeKr ?? 0) > 0 || rapport.uppskattat || raden

  if (!harNagot) return null

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 mb-8">
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="m-0 text-[15px] font-semibold text-gray-900">Värdet i {manad}</h2>
        <span className="text-xs text-gray-400">tre nivåer — bekräftat blandas aldrig med uppskattat</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Nivå 1 — bekräftat */}
        <div>
          <div className="flex items-center gap-1.5">
            <BadgeCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Bekräftat</span>
          </div>
          <p className="m-0 mt-1.5 font-heading text-2xl font-bold text-gray-900 tabular-nums">
            {kr(rapport.bekraftat.kr)}
          </p>
          <p className="m-0 mt-0.5 text-[11px] text-gray-500">
            {rapport.bekraftat.rader.length > 0
              ? `${rapport.bekraftat.rader.length} verifierad${rapport.bekraftat.rader.length === 1 ? ' händelse' : 'e händelser'}`
              : 'inga verifierade händelser än'}
          </p>
        </div>

        {/* Nivå 3 — vilande (ur Pengar på bordet) */}
        {vilandeKr !== null && vilandeKr > 0 && (
          <div>
            <div className="flex items-center gap-1.5">
              <Hourglass className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Vilande</span>
            </div>
            <p className="m-0 mt-1.5 font-heading text-2xl font-bold text-gray-900 tabular-nums">{kr(vilandeKr)}</p>
            <p className="m-0 mt-0.5 text-[11px] text-gray-500">potential på Pengar på bordet</p>
          </div>
        )}

        {/* Nivå 2 — uppskattat, alltid märkt */}
        {rapport.uppskattat && (
          <div>
            <div className="flex items-center gap-1.5">
              <Clock3 className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Uppskattat</span>
            </div>
            <p className="m-0 mt-1.5 font-heading text-2xl font-bold text-slate-700 tabular-nums">
              {rapport.uppskattat.adminTimmar} tim
            </p>
            <p className="m-0 mt-0.5 text-[11px] text-gray-500">
              uppskattad administration · {rapport.uppskattat.samtalFangade} samtal fångade
            </p>
          </div>
        )}
      </div>

      {/* Bevisraderna — agenten, kronan och dagarna till utfall. */}
      {rapport.bekraftat.rader.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100 divide-y divide-gray-50">
          {rapport.bekraftat.rader.slice(0, 4).map((rad, i) => (
            <div key={`${rad.approval_id}-${i}`} className="flex items-center gap-2.5 py-1.5 text-[13px] text-gray-600">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: AGENT_INFO[rad.agent]?.dot || '#94a3b8' }}
                aria-hidden
              />
              <span className="flex-1 min-w-0 truncate">{rad.label}</span>
              <span className="text-xs text-gray-400 shrink-0">{rad.dagar} dgr till utfall</span>
              <span className="font-heading font-semibold shrink-0">{kr(rad.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Retention-raden — bara när kostnadskällan är säker. */}
      {raden && (
        <p className="m-0 mt-4 pt-3 border-t border-gray-100 text-[13px] text-gray-600">
          {raden}
        </p>
      )}
    </div>
  )
}

export default AgarrapportBlock
