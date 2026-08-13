'use client'

import { AgentAvatar } from '@/components/agents/AgentAvatar'

/**
 * "Gör detta först" — Next Best Action Engine (2026-08-13). Kvittoprincipen-
 * korrekt hero-yta ovanför den vanliga kön i JarvisHome.
 *
 * Det här är en BESLUTSYTA (docs/design/SYNLIG-INTELLIGENS.md) — kvittot
 * renderas alltid inline, aldrig bakom "Visa varför". Attribuerat till
 * Matte (inte kandidatens egen agent), eftersom rankningen är ett
 * tvärgrupps-omdöme mellan olika agenters ärenden, inte en enskild agents
 * beräkning. Beloppet självt är arbetets, aldrig Mattes åsikt — "en summa
 * är inte en åsikt".
 *
 * `principlesApplied` under etiketten "Din regel" — samma etikett som
 * DanielsBedomning.tsx redan använder — Christoffers principer syns
 * ALDRIG vid namn, de framstår som ägarens egna (Andreas beslut).
 */

interface Approval {
  id: string
  approval_type: string
  title: string
  description: string | null
  payload: Record<string, unknown>
}

export interface NextBestActionRecommendation {
  approval: Approval
  rank: number
  rationale: string
  financialImpactKr: number | null
  financialImpactKind: 'KÄNT' | 'UPPSKATTAT' | null
  urgencyNote: string | null
  reasoning: string
  principlesApplied: string[]
}

interface Props {
  recommendation: NextBestActionRecommendation
  approveLabelText: string
  onApprove: () => void
  onDismiss: () => void
}

export function GorDettaForst({ recommendation, approveLabelText, onApprove, onDismiss }: Props) {
  const { approval, rationale, financialImpactKr, financialImpactKind, urgencyNote, reasoning, principlesApplied } = recommendation

  return (
    <div className="bg-white border border-primary-200 border-l-[3px] border-l-primary-600 rounded-2xl px-4 py-3.5 mb-2.5">
      <div className="flex items-center gap-2.5 mb-2">
        <AgentAvatar agentKey="matte" size="sm" />
        <span className="flex-1 min-w-0 text-sm font-semibold text-primary-900">Gör detta först</span>
        {financialImpactKr != null && financialImpactKind && (
          <span
            className={`text-xs font-medium shrink-0 ${financialImpactKind === 'UPPSKATTAT' ? 'text-gray-400 italic' : 'text-slate-700'}`}
            title={financialImpactKind === 'UPPSKATTAT' ? 'Uppskattat, inte ett facit' : 'Känt, uppmätt belopp'}
          >
            {financialImpactKind === 'UPPSKATTAT' ? '~' : ''}
            {financialImpactKr.toLocaleString('sv-SE')} kr
          </span>
        )}
      </div>

      <p className="m-0 text-sm font-medium text-slate-900">{approval.title}</p>
      {urgencyNote && <p className="m-0 mt-0.5 text-xs text-slate-500">{urgencyNote}</p>}

      <p className="m-0 mt-2 text-[13px] leading-relaxed text-slate-600">{reasoning || rationale}</p>

      {principlesApplied.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
          {principlesApplied.map((p, i) => (
            <p key={i} className="m-0 text-[13px] text-slate-600 flex gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 shrink-0 pt-0.5">Din regel</span>
              <span className="min-w-0">{p}</span>
            </p>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={onApprove}
          className="px-4 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:bg-primary-800 transition-colors"
        >
          {approveLabelText}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="px-3 py-2 text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors"
        >
          Inte nu
        </button>
      </div>
    </div>
  )
}
