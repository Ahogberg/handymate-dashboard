'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles, Check, X, ArrowRight, Loader2 } from 'lucide-react'
import { TEAM, getAgentById } from '@/lib/agents/team'

interface Observation {
  id: string
  agent_id: string
  knowledge_type: 'insight' | 'pattern' | 'anomaly' | 'recommendation'
  title: string
  observation: string
  suggestion: string | null
  confidence: number
  data_basis: Record<string, unknown>
  related_approval_id: string | null
  created_at: string
}

const TYPE_LABEL: Record<string, string> = {
  insight: 'Insikt',
  pattern: 'Mönster',
  anomaly: 'Avvikelse',
  recommendation: 'Förslag',
}

const TYPE_BADGE_CLASS: Record<string, string> = {
  insight: 'bg-slate-100 text-slate-600',
  pattern: 'bg-blue-50 text-blue-700',
  anomaly: 'bg-amber-50 text-amber-700',
  recommendation: 'bg-primary-50 text-primary-700',
}

/**
 * Visar senaste 5 active observations från business_knowledge för
 * authenticated business. Renderar per-agent-avatar + titel + observation
 * + suggestion + actions (Agera / Dismiss).
 *
 * "Agera" länkar till /dashboard/approvals?filter=agent_observation
 * eftersom cron redan skapade pending_approval-raden. Inget separat
 * approval-skapande härifrån.
 *
 * "Dismiss" POST:ar /api/observations/[id] med action='dismiss' och
 * tar bort observationen från listan optimistically.
 */
export default function TeamObservationsCard() {
  const [observations, setObservations] = useState<Observation[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissing, setDismissing] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    fetch('/api/observations?limit=5')
      .then(r => (r.ok ? r.json() : { observations: [] }))
      .then(data => {
        if (cancelled) return
        setObservations((data?.observations || []) as Observation[])
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleDismiss(id: string) {
    if (dismissing.has(id)) return
    setDismissing(prev => new Set(prev).add(id))
    // Optimistic remove — om POST failar, hämta tillbaka
    const original = observations
    setObservations(obs => obs.filter(o => o.id !== id))
    try {
      const res = await fetch(`/api/observations/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' }),
      })
      if (!res.ok) {
        setObservations(original)
      }
    } catch {
      setObservations(original)
    } finally {
      setDismissing(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  if (loading) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-primary-700" />
          <span className="text-sm font-semibold text-gray-900">Ditt AI-team noterar</span>
        </div>
        <div className="space-y-3">
          {[0, 1].map(i => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex-shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3 bg-gray-100 rounded w-1/3" />
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-3 bg-gray-100 rounded w-4/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (observations.length === 0) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-gray-900">Ditt AI-team noterar</span>
        </div>
        <p className="text-sm text-slate-500 italic">
          Ditt AI-team har inget att rapportera just nu. Karin tittar igenom siffrorna varje söndag och onsdag — om hon märker något hör du av sig.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary-700" />
          <span className="text-sm font-semibold text-gray-900">Ditt AI-team noterar</span>
        </div>
        <span className="text-xs text-slate-400">{observations.length} {observations.length === 1 ? 'observation' : 'observationer'}</span>
      </div>

      <div className="space-y-4">
        {observations.map(obs => {
          const agent = getAgentById(obs.agent_id) || TEAM[0]
          const typeLabel = TYPE_LABEL[obs.knowledge_type] || 'Notering'
          const typeBadge = TYPE_BADGE_CLASS[obs.knowledge_type] || 'bg-slate-100 text-slate-600'
          const isDismissing = dismissing.has(obs.id)

          return (
            <div
              key={obs.id}
              className={`flex gap-3 ${isDismissing ? 'opacity-50' : ''}`}
            >
              {/* Avatar */}
              <div className="flex-shrink-0 relative">
                <div
                  className={`w-10 h-10 rounded-full ${agent.color} text-white flex items-center justify-center text-sm font-semibold overflow-hidden`}
                >
                  {agent.avatar ? (
                    <img
                      src={agent.avatar}
                      alt={agent.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  ) : (
                    agent.initials
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">{agent.name}</span>
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${typeBadge}`}>
                    {typeLabel}
                  </span>
                </div>

                <div className="text-sm font-medium text-gray-900 mb-1">
                  {obs.title}
                </div>

                <p className="text-sm text-slate-600 leading-relaxed">
                  {obs.observation}
                </p>

                {obs.suggestion && (
                  <p className="text-sm text-primary-700 mt-2 italic">
                    💡 {obs.suggestion}
                  </p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 mt-3">
                  {obs.suggestion && obs.related_approval_id && (
                    <Link
                      href="/dashboard/approvals?filter=agent_observation"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-700 hover:bg-primary-800 text-white text-xs font-medium transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Agera
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                  <button
                    onClick={() => handleDismiss(obs.id)}
                    disabled={isDismissing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 border border-[#E2E8F0] text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {isDismissing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <X className="w-3.5 h-3.5" />
                    )}
                    Avfärda
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
