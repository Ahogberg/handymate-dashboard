'use client'

import Link from 'next/link'
import { AgentAvatar } from '@/components/agents/AgentAvatar'

/**
 * ProjektCaseKort — Cross-Agent Case (Business Twin-epiken, 2026-08-14).
 *
 * Flera agenters signaler om SAMMA projekt (lib/jarvis/project-case.ts,
 * app/api/project-cases/route.ts) som EN sammanhållen berättelse i stället
 * för lösryckta kort i kön. Samma princip som completion_batch_id redan
 * bevisat: en delad rubrik, men INGA egna knappar här — varje signal
 * behåller sitt eget kort och sin egen knapp i kön nedanför
 * (fyra-ögon-regeln, aldrig ett bundlat "godkänn allt").
 *
 * Rubriken attribueras till Matte (tvärgrupps-omdöme mellan olika agenters
 * ärenden, samma motivering som GorDettaForst.tsx). Reality-remsan är
 * OATTRIBUERAD — en summa/fas är inte en åsikt. Varje signal-rad bär sin
 * EGEN agents avatar.
 */

export interface ProjektCaseSignal {
  approval_id: string
  approval_type: string
  agentId: string
  title: string
}

export interface ProjektCaseData {
  project_id: string
  name: string | null
  signals: ProjektCaseSignal[]
  reality: {
    fasLabel: string
    /** null om arbetskostnad ej konfigurerad eller projektet är tomt — då
     *  visas ingen marginal alls, hellre tyst än ett gissat tal. */
    marginalPct: number | null
    marginalKind: 'KÄNT' | 'UPPSKATTAT' | null
    forvantadIntaktKr: number
  } | null
}

export function ProjektCaseKort({ data }: { data: ProjektCaseData }) {
  const namn = data.name ?? 'Ett projekt'
  const { reality } = data

  return (
    <div className="bg-white border border-primary-200 border-l-[3px] border-l-primary-600 rounded-2xl px-4 py-3.5 mb-2.5">
      <div className="flex items-center gap-2.5 mb-1">
        <AgentAvatar agentKey="matte" size="sm" />
        <span className="flex-1 min-w-0 text-sm font-semibold text-primary-900">{namn} behöver dig</span>
      </div>
      <p className="m-0 text-xs text-slate-500">
        {data.signals.length} signaler hänger ihop
      </p>

      {reality && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
          <span>{reality.fasLabel}</span>
          {reality.marginalPct != null && reality.marginalKind && (
            <>
              <span className="text-slate-300">·</span>
              <span
                className={reality.marginalKind === 'UPPSKATTAT' ? 'text-gray-400 italic' : 'text-slate-700'}
                title={reality.marginalKind === 'UPPSKATTAT' ? 'Uppskattat, inte ett facit' : 'Känt, uppmätt belopp'}
              >
                {reality.marginalKind === 'UPPSKATTAT' ? '~' : ''}{reality.marginalPct}% marginal
              </span>
            </>
          )}
          <span className="text-slate-300">·</span>
          <span>{reality.forvantadIntaktKr.toLocaleString('sv-SE')} kr förväntad intäkt</span>
        </div>
      )}

      <div className="mt-2.5 flex flex-col gap-1.5">
        {data.signals.map(s => (
          <div key={s.approval_id} className="flex items-center gap-2 min-w-0">
            <AgentAvatar agentKey={s.agentId} size="sm" />
            <span className="text-sm text-slate-700 truncate">{s.title}</span>
          </div>
        ))}
      </div>

      <Link
        href={`/dashboard/projects/${data.project_id}`}
        className="mt-3 inline-block text-sm font-medium text-primary-700 hover:text-primary-800"
      >
        Öppna projektet →
      </Link>
    </div>
  )
}

export default ProjektCaseKort
