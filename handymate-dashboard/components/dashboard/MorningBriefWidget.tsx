'use client'

import { useEffect, useState } from 'react'

interface BriefDetail { text: string; urgency: 'low' | 'medium' | 'high' }
interface AgentBrief { agentId: string; quote: string; badge?: string; badgeType: string; details: BriefDetail[] }
interface MorningBrief { date: string; greeting: string; agents: AgentBrief[]; generatedAt: string }

const AGENTS: Record<string, { name: string; role: string; initials: string; bg: string; text: string }> = {
  matte:  { name: 'Matte', role: 'Chef', initials: 'M', bg: 'bg-teal-100', text: 'text-teal-700' },
  karin:  { name: 'Karin', role: 'Ekonomi', initials: 'K', bg: 'bg-blue-100', text: 'text-blue-700' },
  daniel: { name: 'Daniel', role: 'Sälj', initials: 'D', bg: 'bg-amber-100', text: 'text-amber-700' },
  lars:   { name: 'Lars', role: 'Projekt', initials: 'L', bg: 'bg-green-100', text: 'text-green-700' },
  hanna:  { name: 'Hanna', role: 'Marknad', initials: 'H', bg: 'bg-pink-100', text: 'text-pink-700' },
}

const BADGE_STYLES: Record<string, string> = {
  danger: 'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-700',
  success: 'bg-emerald-100 text-emerald-700',
  neutral: 'bg-gray-100 text-gray-500',
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
    <div className="bg-white border border-gray-200 rounded-2xl p-5 animate-pulse">
      <div className="h-4 bg-gray-100 rounded w-48 mb-4" />
      <div className="grid grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-gray-50 rounded-xl" />)}
      </div>
    </div>
  )

  if (!brief) return null

  const selectedBrief = brief.agents.find(a => a.agentId === selected)
  const agentConf = AGENTS[selected] || AGENTS.matte

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">{brief.greeting}</h3>
        <span className="text-xs text-gray-400">
          {new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      {/* Agent cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mb-4">
        {brief.agents.map(agent => {
          const conf = AGENTS[agent.agentId] || AGENTS.matte
          const isActive = selected === agent.agentId
          const badgeCls = BADGE_STYLES[agent.badgeType] || BADGE_STYLES.neutral

          return (
            <button
              key={agent.agentId}
              onClick={() => setSelected(agent.agentId)}
              className={`text-left p-3 rounded-xl transition-all ${
                isActive ? 'bg-white border-2 border-teal-500 shadow-sm' : 'bg-gray-50 border border-transparent hover:bg-gray-100'
              }`}
            >
              <div className={`w-8 h-8 rounded-full ${conf.bg} ${conf.text} flex items-center justify-center text-xs font-semibold mb-2`}>
                {conf.initials}
              </div>
              <p className="text-xs font-medium text-gray-900">{conf.name}</p>
              <p className="text-[10px] text-gray-400 mb-1.5">{conf.role}</p>
              <p className="text-[11px] text-gray-500 italic line-clamp-2 mb-2">"{agent.quote}"</p>
              {agent.badge && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badgeCls}`}>
                  {agent.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Detail panel */}
      {selectedBrief && selectedBrief.details.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-3 space-y-1">
          {selectedBrief.details.map((detail, i) => (
            <div key={i} className="flex items-start gap-2 py-1.5 border-b border-gray-100 last:border-0">
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${URGENCY_DOT[detail.urgency] || 'bg-gray-300'}`} />
              <span className="text-xs text-gray-700 leading-relaxed">{detail.text}</span>
            </div>
          ))}
        </div>
      )}

      {selectedBrief && selectedBrief.details.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Inget att rapportera.</p>
        </div>
      )}
    </div>
  )
}
