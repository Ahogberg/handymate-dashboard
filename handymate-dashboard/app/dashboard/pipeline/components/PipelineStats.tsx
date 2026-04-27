'use client'

import { formatValueCompact } from '../helpers'
import type { PipelineStats as PipelineStatsType } from '../types'

interface PipelineStatsProps {
  stats: PipelineStatsType | null
}

export function PipelineStats({ stats }: PipelineStatsProps) {
  if (!stats) return null

  return (
    <div className="flex-shrink-0 border-t border-gray-200 px-4 lg:px-6 py-3 bg-white/60 backdrop-blur-sm">
      <div className="flex items-center gap-4 lg:gap-8 overflow-x-auto text-xs">
        <div className="flex items-center gap-2 flex-shrink-0"><div className="w-2 h-2 rounded-full bg-primary-700" /><span className="text-gray-500">Aktiva:</span><span className="text-gray-900 font-medium">{stats.totalDeals}</span><span className="text-gray-400">({formatValueCompact(stats.totalValue)})</span></div>
        <div className="flex items-center gap-2 flex-shrink-0"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-gray-500">Vunna:</span><span className="text-gray-900 font-medium">{formatValueCompact(stats.wonValue)}</span></div>
        <div className="flex items-center gap-2 flex-shrink-0"><div className="w-2 h-2 rounded-full bg-primary-500" /><span className="text-gray-500">Nya idag:</span><span className="text-gray-900 font-medium">{stats.newLeadsToday}</span></div>
        <div className="flex items-center gap-2 flex-shrink-0"><div className="w-2 h-2 rounded-full bg-amber-400" /><span className="text-gray-500">Uppföljning:</span><span className="text-gray-900 font-medium">{stats.needsFollowUp}</span></div>
      </div>
    </div>
  )
}
