'use client'

import { useEffect, useState } from 'react'

interface BriefDetail { text: string; urgency: 'low' | 'medium' | 'high' }
interface AgentBrief { agentId: string; quote: string; badge?: string; badgeType: string; details: BriefDetail[] }
interface MorningBrief { date: string; greeting: string; agents: AgentBrief[]; generatedAt: string }

const AGENTS: Record<string, { name: string; initials: string; bg: string; text: string }> = {
  matte:  { name: 'Matte', initials: 'M', bg: 'bg-teal-100', text: 'text-teal-700' },
  karin:  { name: 'Karin', initials: 'K', bg: 'bg-blue-100', text: 'text-blue-700' },
  daniel: { name: 'Daniel', initials: 'D', bg: 'bg-amber-100', text: 'text-amber-700' },
  lars:   { name: 'Lars', initials: 'L', bg: 'bg-green-100', text: 'text-green-700' },
  hanna:  { name: 'Hanna', initials: 'H', bg: 'bg-pink-100', text: 'text-pink-700' },
}

const STATUS_DOT: Record<string, string> = {
  danger: 'bg-red-500',
  warning: 'bg-amber-400',
  success: 'bg-emerald-500',
  neutral: 'bg-emerald-500',
}

const URGENCY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-400',
  low: 'bg-emerald-500',
}

export default function MorningBriefWidget() {
  const [brief, setBrief] = useState<MorningBrief | null>(null)
  const [selected, setSelected] = useState('matte')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/morning-brief')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.agents) {
          setBrief(data)
          const urgent = data.agents.find((a: AgentBrief) => a.badgeType === 'danger' || a.badgeType === 'warning')
          if (urgent) setSelected(urgent.agentId)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 animate-pulse">
      <div className="flex gap-2">
        {[...Array(5)].map((_, i) => <div key={i} className="h-10 w-32 bg-gray-100 rounded-full" />)}
      </div>
    </div>
  )

  if (!brief) return null

  const selectedBrief = brief.agents.find(a => a.agentId === selected)

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-900">{brief.greeting}</span>
        <span className="text-xs text-gray-400">
          {new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      {/* Agent pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {brief.agents.map(agent => {
          const conf = AGENTS[agent.agentId] || AGENTS.matte
          const isActive = selected === agent.agentId
          const dotColor = STATUS_DOT[agent.badgeType] || STATUS_DOT.neutral

          return (
            <button
              key={agent.agentId}
              onClick={() => setSelected(agent.agentId)}
              className={`flex items-center gap-2 px-3 py-2 rounded-full shrink-0 transition-all ${
                isActive
                  ? 'bg-white border border-gray-300 shadow-sm'
                  : 'bg-gray-50 border border-transparent hover:bg-gray-100'
              }`}
            >
              {/* Avatar med status-prick */}
              <div className="relative shrink-0">
                <div className={`w-7 h-7 rounded-full ${conf.bg} ${conf.text} flex items-center justify-center text-[11px] font-semibold`}>
                  {conf.initials}
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-[1.5px] border-white ${dotColor}`} />
              </div>

              {/* Namn + citat */}
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-900 whitespace-nowrap">{conf.name}</p>
                <p className="text-[10px] text-gray-400 italic whitespace-nowrap overflow-hidden text-ellipsis max-w-[100px]">
                  {agent.quote}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Detail panel */}
      {selectedBrief && selectedBrief.details.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          {selectedBrief.details.slice(0, 3).map((detail, i) => (
            <div key={i} className="flex items-start gap-2 py-1">
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${URGENCY_DOT[detail.urgency] || 'bg-gray-300'}`} />
              <span className="text-xs text-gray-600 leading-relaxed">{detail.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
