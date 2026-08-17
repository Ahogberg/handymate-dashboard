'use client'

import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { AGENT_INFO } from '@/components/dashboard/agentPersonas'
import { agentForApproval, approveLabel, typeLabel } from '@/lib/jarvis/approval-view'

/**
 * "Gör detta först" — Next Best Action Engine (2026-08-13, rankad kö C2
 * 2026-08-17). Kvittoprincipen-korrekt beslutsyta ovanför den vanliga kön
 * i JarvisHome.
 *
 * Det här är en BESLUTSYTA (docs/design/SYNLIG-INTELLIGENS.md) — kvittot
 * (rationale) renderas alltid inline, aldrig bakom "Visa varför".
 * Rubriken attribueras till Matte (rankningen är ett tvärgrupps-omdöme
 * mellan olika agenters ärenden), men varje kort bär sin kandidats EGEN
 * agent i chipen nere till höger — beloppet självt är arbetets, aldrig
 * någons åsikt.
 *
 * ═══ RANKAD KÖ (Etapp C2) ═══
 *
 * ≥2 kandidater → mockupens numrerade kort (1 röd-tonad, 2 amber,
 * 3 neutral — positionsfärger, ordningen ÄR budskapet). Exakt 1 → samma
 * enkortslayout som innan. 0 → ingenting; den vanliga ApprovalCard-kön
 * är fallbacken och en rankning utan NBA-rader hittas ALDRIG på.
 *
 * `principlesApplied` under etiketten "Din regel" — samma etikett som
 * DanielsBedomning.tsx redan använder — Christoffers principer syns
 * ALDRIG vid namn, de framstår som ägarens egna (Andreas beslut).
 * Citaten är dagens NBA-rads (delade över kandidaterna, se
 * app/api/next-best-action/route.ts), så de renderas EN gång under
 * första kortet — samma text tre gånger vore brus, inte transparens.
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
  /** Synliga kandidater i rangordning (≤3). Tom lista renderar ingenting. */
  recommendations: NextBestActionRecommendation[]
  onApprove: (rec: NextBestActionRecommendation) => void
  onDismiss: (rec: NextBestActionRecommendation) => void
}

/** Positionsfärgerna — mockupens 1 röd / 2 amber / 3 neutral. */
const RANK_STYLE = [
  { card: 'border-red-200', circle: 'bg-red-50 border-red-200 text-red-700', pill: 'bg-red-50 text-red-700' },
  { card: 'border-amber-200', circle: 'bg-amber-50 border-amber-200 text-amber-700', pill: 'bg-amber-50 text-amber-700' },
  { card: 'border-slate-200', circle: 'bg-slate-50 border-slate-200 text-slate-500', pill: 'bg-slate-100 text-slate-600' },
] as const

function Belopp({ rec }: { rec: NextBestActionRecommendation }) {
  if (rec.financialImpactKr == null || !rec.financialImpactKind) return null
  const osakert = rec.financialImpactKind === 'UPPSKATTAT'
  return (
    <span
      className={`font-heading tabular-nums font-semibold shrink-0 ${osakert ? 'text-gray-400 italic' : 'text-slate-700'}`}
      title={osakert ? 'Uppskattat, inte ett facit' : 'Känt, uppmätt belopp'}
    >
      {osakert ? '~' : ''}
      {rec.financialImpactKr.toLocaleString('sv-SE')} kr
    </span>
  )
}

function DinaRegler({ principer }: { principer: string[] }) {
  if (principer.length === 0) return null
  return (
    <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
      {principer.map((p, i) => (
        <p key={i} className="m-0 text-[13px] text-slate-600 flex gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 shrink-0 pt-0.5">Din regel</span>
          <span className="min-w-0">{p}</span>
        </p>
      ))}
    </div>
  )
}

/** Kandidatens egen agent, nere till höger — mockupens attributionschip. */
function AgentChip({ approval }: { approval: Approval }) {
  const key = agentForApproval(approval)
  const info = AGENT_INFO[key]
  if (!info) return null
  return (
    <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
      <AgentAvatar agentKey={key} size="sm" />
      {info.name}
    </span>
  )
}

export function GorDettaForst({ recommendations, onApprove, onDismiss }: Props) {
  if (recommendations.length === 0) return null

  // ── Exakt en kandidat: enkortslayouten, som innan ──────────────────────
  if (recommendations.length === 1) {
    const rec = recommendations[0]
    const { approval, rationale, urgencyNote, reasoning, principlesApplied } = rec
    return (
      <div className="bg-white border border-primary-200 border-l-[3px] border-l-primary-600 rounded-card px-4 py-3.5 mb-2.5">
        <div className="flex items-center gap-2.5 mb-2">
          <AgentAvatar agentKey="matte" size="sm" />
          <span className="flex-1 min-w-0 text-sm font-semibold text-primary-900">Gör detta först</span>
          <Belopp rec={rec} />
        </div>

        <p className="m-0 font-heading text-sm font-semibold text-slate-900">{approval.title}</p>
        {urgencyNote && <p className="m-0 mt-0.5 text-xs text-slate-500">{urgencyNote}</p>}

        <p className="m-0 mt-2 text-[13px] leading-relaxed text-slate-600">{reasoning || rationale}</p>

        <DinaRegler principer={principlesApplied} />

        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => onApprove(rec)}
            className="px-4 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:bg-primary-800 transition-colors"
          >
            {approveLabel(approval.approval_type, approval.payload)}
          </button>
          <button
            type="button"
            onClick={() => onDismiss(rec)}
            className="px-3 py-2 text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors"
          >
            Inte nu
          </button>
          <AgentChip approval={approval} />
        </div>
      </div>
    )
  }

  // ── ≥2 kandidater: den numrerade rankade kön ───────────────────────────
  return (
    <div className="mb-2.5">
      <div className="flex items-center gap-2.5 mb-2 px-1">
        <AgentAvatar agentKey="matte" size="sm" />
        <span className="flex-1 min-w-0 text-sm font-semibold text-primary-900">Gör detta först</span>
        <span className="text-xs text-slate-400 shrink-0 hidden sm:inline">Rangordnat efter vad det kostar att vänta</span>
      </div>

      <div className="space-y-2.5">
        {recommendations.slice(0, 3).map((rec, i) => {
          const stil = RANK_STYLE[Math.min(i, RANK_STYLE.length - 1)]
          const { approval } = rec
          return (
            <div key={approval.id} className={`bg-white border ${stil.card} rounded-card p-4 flex gap-3.5`}>
              <div
                className={`w-8 h-8 rounded-full border grid place-items-center font-heading font-bold text-sm tabular-nums shrink-0 ${stil.circle}`}
                aria-label={`Prioritet ${i + 1}`}
              >
                {i + 1}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${stil.pill}`}>
                    {typeLabel(approval.approval_type)}
                  </span>
                  {rec.urgencyNote && (
                    <span className="text-xs text-slate-400 min-w-0 truncate">{rec.urgencyNote}</span>
                  )}
                  <span className="ml-auto">
                    <Belopp rec={rec} />
                  </span>
                </div>

                <p className="m-0 font-heading text-[15px] font-semibold text-slate-900">{approval.title}</p>

                {/* Kvittot inline — per-kandidatens rationale, aldrig bakom
                    en toggle (Kvittoprincipen). */}
                <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-slate-600">
                  {rec.rationale || rec.reasoning}
                </p>

                {i === 0 && <DinaRegler principer={rec.principlesApplied} />}

                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => onApprove(rec)}
                    className="px-4 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:bg-primary-800 transition-colors"
                  >
                    {approveLabel(approval.approval_type, approval.payload)}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismiss(rec)}
                    className="px-3 py-2 text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Inte nu
                  </button>
                  <AgentChip approval={approval} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
