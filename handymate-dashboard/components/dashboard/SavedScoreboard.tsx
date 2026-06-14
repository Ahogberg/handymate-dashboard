'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, Phone, FileText, Bell, Info } from 'lucide-react'
import { getAgentById } from '@/lib/agents/team'

/**
 * Tid-sparad-scoreboard — "Vad teamet sparat åt dig" (denna månad).
 *
 * Översätter teamets aktivitet till tid (UPPSKATTAD) + riktiga stödsiffror.
 * Konsumerar /api/dashboard/saved-scoreboard. Tid märks alltid som
 * uppskattning; stödsiffror är riktiga räkningar.
 */

interface PerAgent {
  id: string
  name: string
  role: string
  actions: number
  minutes: number
  detail: string
}

interface ScoreboardResponse {
  month_label: string
  is_estimate: boolean
  minutes_per_action: number
  total_minutes: number
  prev_total_minutes: number
  support: { calls: number; quotes_sent: number; reminders: number }
  per_agent: PerAgent[]
}

function fmtHours(minutes: number): string {
  if (minutes <= 0) return '0 h'
  if (minutes < 60) return `${minutes} min`
  return `${Math.round((minutes / 60) * 10) / 10} h`
}

export default function SavedScoreboard() {
  const [data, setData] = useState<ScoreboardResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/dashboard/saved-scoreboard')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled) return
        if (d) setData(d as ScoreboardResponse)
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

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 mb-6 animate-pulse">
        <div className="h-4 w-48 bg-gray-200 rounded mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (!data || data.total_minutes <= 0) return null

  const deltaMin = data.total_minutes - data.prev_total_minutes
  const deltaHours = Math.round((Math.abs(deltaMin) / 60) * 10) / 10

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-gray-900">
          Vad teamet sparat åt dig
        </h2>
        <span className="text-xs text-gray-500">{data.month_label}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {/* Hero: uppskattad admin-tid */}
        <div className="rounded-xl border border-primary-200 bg-gradient-to-br from-primary-50 to-white p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
            Admin teamet tog
          </div>
          <div className="text-3xl font-bold text-primary-700 leading-none mt-2">
            ~{fmtHours(data.total_minutes)}
          </div>
          {deltaMin !== 0 && (
            <div className={`flex items-center gap-1 text-xs font-medium mt-2 ${deltaMin > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
              <TrendingUp className="w-3.5 h-3.5" />
              {deltaMin > 0 ? '+' : '−'}{deltaHours} h mot förra månaden
            </div>
          )}
        </div>

        {/* Riktiga stödsiffror */}
        <SupportStat icon={Phone} value={String(data.support.calls)} label="samtal & SMS besvarade" />
        <SupportStat icon={FileText} value={String(data.support.quotes_sent)} label="offerter skickade" />
        <SupportStat icon={Bell} value={String(data.support.reminders)} label="påminnelser skickade" />
      </div>

      {/* Per-kollega nedbrytning */}
      {data.per_agent.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
          <div className="text-sm font-semibold text-gray-900 mb-3">Var tiden tog vägen</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.per_agent.map(a => {
              const agent = getAgentById(a.id)
              return (
                <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50/60">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 ${agent?.color || 'bg-primary-700'}`}>
                    {agent?.initials || a.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 leading-tight">
                      {a.name} <span className="text-gray-400 font-normal">· {a.role}</span>
                    </div>
                    <div className="text-base font-bold text-gray-900 mt-0.5">~{fmtHours(a.minutes)}</div>
                    <div className="text-xs text-gray-500">{a.detail}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-gray-400 mt-2">
        <Info className="w-3 h-3" />
        Tiden är en uppskattning (~{data.minutes_per_action} min per åtgärd). Samtal, offerter och
        påminnelser är faktiska räkningar.
      </p>
    </div>
  )
}

function SupportStat({ icon: Icon, value, label }: { icon: typeof Phone; value: string; label: string }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <div className="text-primary-700 mb-2">
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-2xl font-bold text-gray-900 leading-none">{value}</div>
      <div className="text-xs text-gray-500 mt-1.5">{label}</div>
    </div>
  )
}
