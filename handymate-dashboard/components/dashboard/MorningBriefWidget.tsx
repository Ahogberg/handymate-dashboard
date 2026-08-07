'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TEAM } from '@/lib/agents/team'
import { useBusiness } from '@/lib/BusinessContext'

interface BriefDetail { text: string; urgency: 'low' | 'medium' | 'high'; link?: string }
interface AgentBrief { agentId: string; quote: string; badge?: string; badgeType: string; details: BriefDetail[] }
interface MorningBrief { date: string; greeting: string; agents: AgentBrief[]; generatedAt: string }

// Samma tröskel som IdagCore:s bevisband (ProofBand) — ett splitternytt
// konto har inget att visa än. Dupliceras hellre lokalt än att koppla
// ihop widgeten med IdagCore-filen (minimal diff, se tasks-uppdraget).
const NEW_ACCOUNT_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000

// Har briefen någon riktig signal, eller är alla agenter bara på sina
// "inget att rapportera"-defaultvärden? Ett nytt konto ska aldrig mötas
// av en brief som låtsas ha koll ("Allt lugnt idag") innan teamet ens
// hunnit lära känna företaget — döljs helt då (bevisbandet nedanför
// äger cold start-förväntningen redan).
function hasSignal(brief: MorningBrief): boolean {
  return brief.agents.some(a => a.details.length > 0 || a.badgeType === 'danger' || a.badgeType === 'warning')
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

/**
 * SPÅR D1 (2026-08-06): kartan låg hårdkodad här och hade gått isär från
 * resten av produkten på tre sätt — **Lisa saknades helt**, Lars var oliv i
 * stället för smaragd, och Hanna var rosa i stället för lila. Samma agent,
 * olika person beroende på var man tittade. Härleds nu ur den enda källan.
 */
const AGENTS: Record<string, { name: string; initials: string; bg: string; text: string }> = Object.fromEntries(
  TEAM.map(a => [a.id, { name: a.name, initials: a.initials, bg: a.softBg, text: a.softText }]),
)

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
  const router = useRouter()
  const business = useBusiness()
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

  // Cold start: nytt konto (< 3 dagar) utan någon riktig signal — rendera
  // inget alls. Bevisbandet i IdagCore, som visas direkt under, sätter
  // rätt förväntan ("Ditt team lär känna företaget…"); en tom skryt-lägesrapport
  // härifrån ovanpå den vore både brus och missvisande.
  const isNewAccount = !!business?.created_at && (Date.now() - new Date(business.created_at).getTime()) < NEW_ACCOUNT_MAX_AGE_MS
  if (isNewAccount && !hasSignal(brief)) return null

  const selectedBrief = brief.agents.find(a => a.agentId === selected)

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-900">Lägesrapport</span>
        <span className="text-xs text-gray-400">
          {new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      {/* Agent-kort — grid för att ge varje agent mer plats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {brief.agents.map(agent => {
          const conf = AGENTS[agent.agentId] || AGENTS.matte
          const isActive = selected === agent.agentId
          const dotColor = STATUS_DOT[agent.badgeType] || STATUS_DOT.neutral

          return (
            <button
              key={agent.agentId}
              onClick={() => setSelected(agent.agentId)}
              className={`flex flex-col items-center text-center p-2.5 rounded-xl min-w-0 transition-all ${
                isActive
                  ? 'bg-white border border-gray-300 shadow-sm'
                  : 'bg-gray-50 border border-transparent hover:bg-gray-100'
              }`}
            >
              {/* Avatar med profilbild + status-prick */}
              <div className="relative shrink-0 mb-1.5">
                <img
                  src={`${SUPABASE_URL}/storage/v1/object/public/team-avatars/${agent.agentId.charAt(0).toUpperCase() + agent.agentId.slice(1)}.png`}
                  alt={conf.name}
                  onError={(e) => {
                    const el = e.currentTarget
                    el.style.display = 'none'
                    const fallback = el.nextElementSibling as HTMLElement
                    if (fallback) fallback.style.display = 'flex'
                  }}
                  style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
                />
                <div
                  style={{
                    display: 'none',
                    width: 36, height: 36, borderRadius: '50%',
                    background: conf.bg, color: conf.text,
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 500,
                  }}
                >
                  {conf.initials}
                </div>
                <div
                  className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white"
                  style={{ background: dotColor }}
                />
              </div>

              {/* Namn + citat */}
              <p className="text-xs font-medium text-gray-900">{conf.name}</p>
              <p className="text-[11px] text-gray-400 italic leading-tight line-clamp-2 w-full">
                {agent.quote}
              </p>
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
              <div
                key={i}
                className={`flex items-center gap-2 py-1.5 min-h-[44px] rounded-lg px-1 -mx-1 ${
                  detail.link ? 'cursor-pointer hover:bg-gray-50 transition-colors' : ''
                }`}
                onClick={() => detail.link && router.push(detail.link)}
              >
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${URGENCY_DOT[detail.urgency] || 'bg-gray-300'}`} />
                <span className={`text-xs leading-relaxed ${detail.link ? 'text-gray-700 hover:text-primary-700' : 'text-gray-600'}`}>
                  {detail.text}
                </span>
                {detail.link && <span className="text-gray-300 text-xs ml-auto shrink-0">→</span>}
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
