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

/**
 * Visar vad varje AI-team-medlem har gjort senaste 24h.
 * Renderas högst upp på dashboarden under identity-pill.
 */
export default function TeamActivityStrip() {
  const [data, setData] = useState<TeamActivityResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/team-activity')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {TEAM.map(agent => (
            <div key={agent.id} className="animate-pulse">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-gray-200" />
                <div className="h-3 bg-gray-200 rounded w-16" />
              </div>
              <div className="h-3 bg-gray-100 rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!data) return null

  const summaryParts: string[] = []
  if (data.summary.total_calls > 0) {
    summaryParts.push(`${data.summary.total_calls} kundsamtal`)
  }
  if (data.summary.total_sms > 0) {
    summaryParts.push(`${data.summary.total_sms} SMS`)
  }
  if (data.summary.total_quotes > 0) {
    summaryParts.push(`${data.summary.total_quotes} offerter`)
  }
  if (data.summary.total_bookings_updated > 0) {
    summaryParts.push(`${data.summary.total_bookings_updated} bokningar`)
  }
  if (data.summary.total_automations > 0 && summaryParts.length < 3) {
    summaryParts.push(`${data.summary.total_automations} automatiseringar`)
  }

  const summaryText = summaryParts.length > 0
    ? `AI-teamet har hanterat ${summaryParts.slice(0, 3).join(', ')} sedan igår kväll`
    : `AI-teamet är på plats — inga inkommande just nu`

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900">Ditt AI-team idag</h2>
        <span className="text-xs text-gray-500">
          {data.summary.active_agents} av {TEAM.length} aktiva
        </span>
      </div>

      <p className="text-xs text-gray-600 mb-4 leading-relaxed">{summaryText}</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {data.agents.map(activity => {
          const agent = getAgentById(activity.id)
          if (!agent) return null

          return (
            <div
              key={activity.id}
              className={`flex flex-col gap-1.5 p-2.5 rounded-lg transition-all ${
                activity.idle
                  ? 'opacity-60 bg-gray-50'
                  : 'bg-gradient-to-br from-white to-gray-50 border border-gray-100'
              }`}
            >
              <div className="flex items-center gap-2">
                {agent.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={agent.avatar}
                    alt={agent.name}
                    className={`w-8 h-8 rounded-full object-cover flex-shrink-0 ${
                      activity.idle ? 'grayscale' : ''
                    }`}
                  />
                ) : (
                  <div className={`w-8 h-8 rounded-full ${agent.color} flex items-center justify-center text-white text-xs font-semibold flex-shrink-0`}>
                    {agent.initials}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-900 truncate">{agent.name}</p>
                  <p className="text-[10px] text-gray-500 truncate">{agent.role}</p>
                </div>
              </div>

              <div className="min-h-[28px]">
                {activity.stat && (
                  <span className="text-base font-bold text-gray-900 leading-tight">
                    {activity.stat}
                  </span>
                )}
                <p className={`text-[11px] leading-tight ${activity.idle ? 'text-gray-400 italic' : 'text-gray-600'}`}>
                  {activity.action}
                </p>
                {activity.meta && (
                  <p className="text-[10px] text-gray-400 mt-0.5">{activity.meta}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
