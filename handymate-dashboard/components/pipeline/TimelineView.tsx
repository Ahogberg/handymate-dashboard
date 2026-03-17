'use client'

import { useMemo } from 'react'

// ─── Types (match pipeline page) ─────────────────────────────

interface Stage {
  id: string
  name: string
  slug: string
  color: string
  sort_order: number
  is_system: boolean
  is_won: boolean
  is_lost: boolean
}

interface TimelineDeal {
  id: string
  title: string
  value: number | null
  stage_id: string
  priority: string
  created_at: string
  updated_at: string
  customer?: {
    customer_id: string
    name: string
    phone_number: string
    email: string
  } | null
}

interface TimelineViewProps {
  deals: TimelineDeal[]
  stages: Stage[]
  onDealClick: (deal: TimelineDeal) => void
}

// ─── Helpers ─────────────────────────────────────────────────

function getStageName(stageId: string, stages: Stage[]): string {
  return stages.find(s => s.id === stageId)?.name || ''
}

function getStageColor(stageId: string, stages: Stage[]): string {
  if (!stageId || !stages?.length) return '#0F766E'
  const stage = stages.find(s => s.id === stageId)
  return stage?.color && stage.color.startsWith('#') ? stage.color : '#0F766E'
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000))
}

function formatDate(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`
}

function formatDayLabel(d: Date): string {
  const days = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör']
  return days[d.getDay()]
}

// ─── Component ───────────────────────────────────────────────

export function TimelineView({ deals, stages, onDealClick }: TimelineViewProps) {
  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const DAYS = 14

  const dayHeaders = useMemo(() =>
    Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - (DAYS - 1 - i))
      return d
    }), [today])

  // Enrich deals with age info
  const enrichedDeals = useMemo(() => {
    return deals
      .filter(d => {
        const stage = stages.find(s => s.id === d.stage_id)
        return stage && !stage.is_won && !stage.is_lost
      })
      .map(deal => {
        // Use updated_at as proxy for stage entry (best available)
        const stageEntered = new Date(deal.updated_at || deal.created_at)
        const hoursInStage = (Date.now() - stageEntered.getTime()) / 3600000
        const daysInStage = Math.floor(hoursInStage / 24)
        const isStale = hoursInStage > 48
        const isWarning = hoursInStage > 24 && hoursInStage <= 48

        return { ...deal, hoursInStage, daysInStage, isStale, isWarning, stageEntered }
      })
      .sort((a, b) => b.hoursInStage - a.hoursInStage) // Stale first
  }, [deals, stages])

  const staleCount = enrichedDeals.filter(d => d.isStale).length

  return (
    <div className="h-full overflow-auto p-4">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden min-w-[800px]">
        {/* Header row */}
        <div
          className="grid border-b border-gray-200 bg-gray-50"
          style={{ gridTemplateColumns: `220px repeat(${DAYS}, 1fr)` }}
        >
          <div className="px-3 py-2 text-xs font-medium text-gray-500 border-r border-gray-200">
            Lead
          </div>
          {dayHeaders.map((d, i) => {
            const isToday = d.toDateString() === today.toDateString()
            return (
              <div
                key={i}
                className={`px-1 py-2 text-center border-r border-gray-100 last:border-r-0 ${
                  isToday ? 'bg-teal-50' : ''
                }`}
              >
                <div className={`text-[10px] ${isToday ? 'font-semibold text-teal-700' : 'text-gray-400'}`}>
                  {formatDayLabel(d)}
                </div>
                <div className={`text-xs ${isToday ? 'font-bold text-teal-800' : 'text-gray-500'}`}>
                  {formatDate(d)}
                </div>
              </div>
            )
          })}
        </div>

        {/* Deal rows */}
        {enrichedDeals.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            Inga aktiva deals att visa
          </div>
        ) : (
          enrichedDeals.map(deal => {
            const created = new Date(deal.created_at)
            created.setHours(0, 0, 0, 0)
            const stageColor = getStageColor(deal.stage_id, stages)
            const stageName = getStageName(deal.stage_id, stages)

            return (
              <div
                key={deal.id}
                className="grid border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50 cursor-pointer transition-colors"
                style={{ gridTemplateColumns: `220px repeat(${DAYS}, 1fr)` }}
                onClick={() => onDealClick(deal)}
              >
                {/* Lead info */}
                <div className="px-3 py-3 border-r border-gray-200">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {deal.title}
                  </p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {deal.customer?.name || '—'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                        deal.isStale
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : deal.isWarning
                            ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                            : 'bg-green-50 text-green-700 border-green-200'
                      }`}
                    >
                      {deal.daysInStage}d i {stageName}
                    </span>
                    {deal.isStale && <span title="Ingen aktivitet 48h+">🔴</span>}
                    {deal.isWarning && !deal.isStale && <span title="Ingen aktivitet 24h+">⚠️</span>}
                    {deal.value != null && deal.value > 0 && (
                      <span className="text-[10px] text-gray-400">
                        {deal.value >= 1000 ? `${Math.round(deal.value / 1000)}k kr` : `${deal.value} kr`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Timeline bars */}
                {dayHeaders.map((d, i) => {
                  const dayStart = new Date(d)
                  dayStart.setHours(0, 0, 0, 0)
                  const dayEnd = new Date(d)
                  dayEnd.setHours(23, 59, 59, 999)

                  const isActive = dayStart >= created && dayStart <= today
                  const isToday = d.toDateString() === today.toDateString()

                  return (
                    <div
                      key={i}
                      className={`relative ${isToday ? 'bg-teal-50/30' : ''} border-r border-gray-50 last:border-r-0`}
                    >
                      {isActive && (
                        <div
                          className="absolute inset-y-2 left-0.5 right-0.5 rounded-sm"
                          style={{
                            backgroundColor: stageColor,
                            opacity: deal.isStale ? 0.9 : deal.isWarning ? 0.7 : 0.5,
                          }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })
        )}

        {/* Stale leads warning */}
        {staleCount > 0 && (
          <div className="px-4 py-3 bg-red-50 border-t border-red-200 flex items-center gap-2">
            <span>🔴</span>
            <span className="text-sm text-red-700">
              {staleCount} {staleCount === 1 ? 'lead' : 'leads'} utan aktivitet i 48+ timmar
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
