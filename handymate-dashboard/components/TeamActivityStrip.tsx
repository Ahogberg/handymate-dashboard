'use client'

import { useEffect, useState } from 'react'
import { TEAM, getAgentById } from '@/lib/agents/team'

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
 * Visar bara aktiva agenter (idle filtreras bort) — Matte exkluderas eftersom
 * han representeras av docken nere till höger.
 */
export default function TeamActivityStrip({ onLoaded }: TeamActivityStripProps) {
  const [data, setData] = useState<TeamActivityResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/team-activity')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setData(d)
          onLoaded?.(d.summary)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [onLoaded])

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

          return (
            <div key={activity.id} className="flex items-center gap-3 py-2.5">
              <div className="relative flex-shrink-0">
                {agent.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={agent.avatar}
                    alt={agent.name}
                    className={`w-9 h-9 rounded-full object-cover ${activity.idle ? 'opacity-60 grayscale' : ''}`}
                  />
                ) : (
                  <div className={`w-9 h-9 rounded-full ${agent.color} flex items-center justify-center text-white text-xs font-semibold ${activity.idle ? 'opacity-60' : ''}`}>
                    {agent.initials}
                  </div>
                )}
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${activity.idle ? 'bg-gray-300' : 'bg-emerald-500'}`} />
              </div>

              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold leading-tight ${activity.idle ? 'text-gray-500' : 'text-gray-900'}`}>
                  {agent.name}
                </p>
                <p className={`text-xs leading-snug mt-0.5 ${activity.idle ? 'text-gray-400 italic' : 'text-gray-600'}`}>
                  {activity.stat && (
                    <span className="font-semibold text-gray-900">{activity.stat} </span>
                  )}
                  {activity.action}
                </p>
              </div>

              {activity.meta && !activity.idle && (
                <span className="text-[11px] text-gray-400 flex-shrink-0 whitespace-nowrap">
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
