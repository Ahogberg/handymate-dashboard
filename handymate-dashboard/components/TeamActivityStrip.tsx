'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Check, X, ArrowRight, Loader2 } from 'lucide-react'
import { getAgentById } from '@/lib/agents/team'

interface AgentActivity {
  id: string
  stat: string | null
  action: string
  meta: string | null
  idle: boolean
}

interface TeamActivityResponse {
  agents: AgentActivity[]
  summary: {
    total_calls: number
    total_sms: number
    total_quotes: number
    total_invoiced: number
    total_bookings_updated: number
    total_automations: number
    active_agents: number
  }
}

interface Observation {
  id: string
  agent_id: string
  knowledge_type: 'insight' | 'pattern' | 'anomaly' | 'recommendation'
  title: string
  observation: string
  suggestion: string | null
  confidence: number
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

export function buildSummaryText(summary: TeamActivityResponse['summary']): string {
  const parts: string[] = []
  if (summary.total_calls > 0) parts.push(`${summary.total_calls} kundsamtal`)
  if (summary.total_sms > 0 && parts.length < 2) parts.push(`${summary.total_sms} SMS`)
  if (summary.total_quotes > 0) parts.push(`${summary.total_quotes} offerter`)
  if (summary.total_bookings_updated > 0 && parts.length < 2) parts.push(`${summary.total_bookings_updated} bokningar`)
  if (summary.total_automations > 0 && parts.length < 2) parts.push(`${summary.total_automations} automatiseringar`)

  if (parts.length === 0) return 'AI-teamet är på plats — inga inkommande just nu'
  if (parts.length === 1) return `AI-teamet har hanterat ${parts[0]} sedan igår kväll`
  return `AI-teamet har hanterat ${parts.slice(0, -1).join(', ')} och ${parts[parts.length - 1]} sedan igår kväll`
}

interface TeamActivityStripProps {
  onLoaded?: (summary: TeamActivityResponse['summary']) => void
}

/**
 * Vertikal lista över AI-teamets aktivitet senaste 24h.
 *
 * Om en agent har en aktiv observation (insikt/mönster/avvikelse/förslag i
 * business_knowledge) renderas den inline ovanpå standardstatusen — annars
 * visas den vanliga aktivitetsraden. Action-knappar (Agera/Avfärda) visas
 * bara när observation har en suggestion + related_approval_id.
 *
 * Matte exkluderas eftersom han representeras av docken nere till höger.
 */
export default function TeamActivityStrip({ onLoaded }: TeamActivityStripProps) {
  const [data, setData] = useState<TeamActivityResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [observations, setObservations] = useState<Observation[]>([])
  const [dismissing, setDismissing] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/dashboard/team-activity').then(r => (r.ok ? r.json() : null)),
      fetch('/api/observations?limit=20').then(r => (r.ok ? r.json() : { observations: [] })),
    ])
      .then(([activityData, observationsData]) => {
        if (cancelled) return
        if (activityData) {
          setData(activityData as TeamActivityResponse)
          onLoaded?.(activityData.summary)
        }
        setObservations((observationsData?.observations || []) as Observation[])
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [onLoaded])

  async function handleDismiss(id: string) {
    if (dismissing.has(id)) return
    setDismissing(prev => new Set(prev).add(id))
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
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="h-4 bg-gray-200 rounded w-32 animate-pulse" />
          <div className="h-3 bg-gray-100 rounded w-40 animate-pulse" />
        </div>
        <div className="space-y-2.5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5 animate-pulse">
              <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-200 rounded w-24" />
                <div className="h-2.5 bg-gray-100 rounded w-3/4" />
              </div>
              <div className="h-2.5 bg-gray-100 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!data) return null

  // Visa alla agenter utom Matte (han har egen dock-knapp). Idle agenter
  // visas också, bara dämpade — så listan aldrig försvinner.
  const visibleAgents = data.agents.filter(a => a.id !== 'matte')
  const activeCount = visibleAgents.filter(a => !a.idle).length

  // Plocka senaste observation per agent (max 1) — listan är redan sorterad
  // DESC från /api/observations, så första träffen per agent är senaste.
  const observationByAgent = new Map<string, Observation>()
  for (const obs of observations) {
    if (!observationByAgent.has(obs.agent_id)) {
      observationByAgent.set(obs.agent_id, obs)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900">Ditt AI-team idag</h2>
        <span className="text-[11px] text-gray-500">
          Senaste 24 timmarna · {activeCount} aktiva
        </span>
      </div>

      <div className="divide-y divide-gray-50">
        {visibleAgents.map(activity => {
          const agent = getAgentById(activity.id)
          if (!agent) return null

          const obs = observationByAgent.get(activity.id)
          const isDismissing = obs ? dismissing.has(obs.id) : false
          const typeLabel = obs ? (TYPE_LABEL[obs.knowledge_type] || 'Notering') : null
          const typeBadge = obs ? (TYPE_BADGE_CLASS[obs.knowledge_type] || 'bg-slate-100 text-slate-600') : null

          return (
            <div
              key={activity.id}
              className={`flex items-start gap-3 py-2.5 ${isDismissing ? 'opacity-50' : ''}`}
            >
              <div className="relative flex-shrink-0">
                {agent.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={agent.avatar}
                    alt={agent.name}
                    className="w-9 h-9 rounded-full object-cover"
                  />
                ) : (
                  <div className={`w-9 h-9 rounded-full ${agent.color} flex items-center justify-center text-white text-xs font-semibold`}>
                    {agent.initials}
                  </div>
                )}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                    activity.idle ? 'bg-emerald-300' : 'bg-emerald-500'
                  }`}
                  title={activity.idle ? 'Standby' : 'Aktiv'}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900 leading-tight">{agent.name}</p>
                  {activity.idle && !obs && (
                    <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                      Standby
                    </span>
                  )}
                  {obs && typeLabel && typeBadge && (
                    <span className={`inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${typeBadge}`}>
                      <Sparkles className="w-2.5 h-2.5" />
                      {typeLabel}
                    </span>
                  )}
                </div>

                {obs ? (
                  <>
                    <div className="text-sm font-medium text-gray-900 mt-1">{obs.title}</div>
                    <p className="text-xs text-gray-600 leading-snug mt-0.5">{obs.observation}</p>
                    {obs.suggestion && (
                      <p className="text-xs text-primary-700 mt-1.5 italic">💡 {obs.suggestion}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      {obs.suggestion && obs.related_approval_id && (
                        <button
                          type="button"
                          onClick={() => {
                            // Steg 1C (2026-05-28): försök scrolla till
                            // approval-card i PendingApprovalsBlock på
                            // samma sida (om bland top-3). Annars navigera
                            // till /dashboard/approvals med hash.
                            const target = document.getElementById(`approval-${obs.related_approval_id}`)
                            if (target) {
                              target.scrollIntoView({ behavior: 'smooth', block: 'center' })
                              target.classList.add('ring-2', 'ring-primary-400', 'ring-offset-2')
                              setTimeout(() => {
                                target.classList.remove('ring-2', 'ring-primary-400', 'ring-offset-2')
                              }, 2000)
                            } else {
                              window.location.href = `/dashboard/approvals#approval-${obs.related_approval_id}`
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary-700 hover:bg-primary-800 text-white text-[11px] font-medium transition-colors"
                        >
                          <Check className="w-3 h-3" />
                          Agera
                          <ArrowRight className="w-2.5 h-2.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDismiss(obs.id)}
                        disabled={isDismissing}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 border border-[#E2E8F0] text-[11px] font-medium transition-colors disabled:opacity-50"
                      >
                        {isDismissing ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <X className="w-3 h-3" />
                        )}
                        Avfärda
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-gray-600 leading-snug mt-0.5">
                    {activity.stat && (
                      <span className="font-semibold text-gray-900">{activity.stat} </span>
                    )}
                    {activity.action}
                  </p>
                )}
              </div>

              {activity.meta && !activity.idle && !obs && (
                <span className="text-[11px] text-gray-400 flex-shrink-0 whitespace-nowrap pt-0.5">
                  {activity.meta}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
