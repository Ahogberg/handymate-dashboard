'use client'

import { useEffect, useState } from 'react'

interface BriefDetail { text: string; urgency: 'low' | 'medium' | 'high' }
interface AgentBrief { agentId: string; quote: string; badge?: string; badgeType: string; details: BriefDetail[] }
interface MorningBrief { date: string; greeting: string; agents: AgentBrief[]; generatedAt: string }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

const AGENTS: Record<string, { name: string; initials: string; bg: string; text: string }> = {
  matte:  { name: 'Matte', initials: 'M', bg: '#E1F5EE', text: '#0F6E56' },
  karin:  { name: 'Karin', initials: 'K', bg: '#E6F1FB', text: '#185FA5' },
  daniel: { name: 'Daniel', initials: 'D', bg: '#FAEEDA', text: '#854F0B' },
  lars:   { name: 'Lars', initials: 'L', bg: '#EAF3DE', text: '#3B6D11' },
  hanna:  { name: 'Hanna', initials: 'H', bg: '#FBEAF0', text: '#993556' },
}

const STATUS_DOT: Record<string, string> = {
  danger: '#EF4444',
  warning: '#F59E0B',
  success: '#22C55E',
  neutral: '#22C55E',
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
        {[...Array(5)].map((_, i) => <div key={i} className="h-10 w-20 bg-gray-100 rounded-full" />)}
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

      {/* Agent pills — avatar + namn, kompakt */}
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
              {/* Avatar med profilbild + status-prick */}
              <div className="relative shrink-0">
                <img
                  src={`${SUPABASE_URL}/storage/v1/object/public/team-avatars/${agent.agentId}.png`}
                  alt={conf.name}
                  onError={(e) => {
                    const el = e.currentTarget
                    el.style.display = 'none'
                    const fallback = el.nextElementSibling as HTMLElement
                    if (fallback) fallback.style.display = 'flex'
                  }}
                  style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
                />
                <div
                  style={{
                    display: 'none',
                    width: 28, height: 28, borderRadius: '50%',
                    background: conf.bg, color: conf.text,
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 500,
                  }}
                >
                  {conf.initials}
                </div>
                <div
                  className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-[1.5px] border-white"
                  style={{ background: dotColor }}
                />
              </div>

              {/* Namn */}
              <span className="text-xs font-medium text-gray-900 whitespace-nowrap">{conf.name}</span>
            </button>
          )
        })}
      </div>

      {/* Detail panel */}
      {selectedBrief && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          {/* Agentens quote */}
          <p className="text-xs italic text-gray-500 mb-2">"{selectedBrief.quote}"</p>

          {/* Detaljer */}
          {selectedBrief.details.length > 0 ? (
            selectedBrief.details.slice(0, 3).map((detail, i) => (
              <div key={i} className="flex items-start gap-2 py-1">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${URGENCY_DOT[detail.urgency] || 'bg-gray-300'}`} />
                <span className="text-xs text-gray-600 leading-relaxed">{detail.text}</span>
              </div>
            ))
          ) : (
            <p className="text-xs text-gray-400">Inget att rapportera.</p>
          )}
        </div>
      )}
    </div>
  )
}
