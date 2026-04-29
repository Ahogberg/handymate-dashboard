'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Eye, Filter, FolderKanban, Plus, Search, X } from 'lucide-react'
import { usePipelineContext } from '../context'
import { formatValueCompact } from '../helpers'
import { PipelineFilters } from './PipelineFilters'
import type { PipelineStats as PipelineStatsType } from '../types'

interface PipelineHeaderProps {
  stats: PipelineStatsType | null
  // Mobile-tab-tillstånd hör hemma här eftersom det bara används i headern
  mobileStageIndex: number
  setMobileStageIndex: (i: number) => void
}

export function PipelineHeader({ stats, mobileStageIndex, setMobileStageIndex }: PipelineHeaderProps) {
  const {
    stages,
    pipelineView,
    setPipelineView,
    filterSearch,
    setFilterSearch,
    hasActiveFilters,
    activeFilterCount,
    hideEmpty,
    toggleHideEmpty,
    setShowNewDeal,
    fetchCustomers,
    fetchJobTypes,
    fetchLeadSources,
    fetchJobTypeOptions,
    dealsForStage,
    scrollPipeline,
  } = usePipelineContext()

  // Lokal UI-state — bara headern bryr sig om dropdown öppen/stängd
  const [showFilter, setShowFilter] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

  // Klick-utanför stänger filter-dropdownen
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false)
    }
    if (showFilter) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showFilter])

  return (
    <>
      <header className="flex-shrink-0 px-4 lg:px-6 py-4 border-b border-gray-200 bg-white/60 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-700 flex items-center justify-center">
              <FolderKanban className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Verksamhetsöversikt</h1>
              <p className="text-sm text-gray-500 hidden sm:block">
                {stats ? `${stats.totalDeals} aktiva deals · ${formatValueCompact(stats.totalValue)}` : 'Säljtratt och aktiva projekt på en plats'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Översikt / Kanban / Tidslinje toggle */}
            <div className="hidden sm:flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setPipelineView('flow')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${pipelineView === 'flow' ? 'bg-white text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Översikt
              </button>
              <button
                onClick={() => setPipelineView('kanban')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${pipelineView === 'kanban' ? 'bg-white text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Kanban
              </button>
              <button
                onClick={() => setPipelineView('timeline')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${pipelineView === 'timeline' ? 'bg-white text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Tidslinje
              </button>
            </div>

            {/* Synligt sökfält */}
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Sök ärende, kund, telefon..."
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                className="pl-9 pr-8 py-2 w-56 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-primary-400 focus:w-72 transition-all"
              />
              {filterSearch && (
                <button
                  onClick={() => setFilterSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                  aria-label="Rensa sökning"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="relative" ref={filterRef}>
              <button onClick={() => setShowFilter(!showFilter)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${hasActiveFilters ? 'bg-primary-50 border-primary-300 text-primary-700' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300'}`}>
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline text-sm">Filter</span>
                {activeFilterCount > 0 && (
                  <span className="bg-primary-700 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {showFilter && <PipelineFilters />}
            </div>
            <button onClick={toggleHideEmpty}
              className={`hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${hideEmpty ? 'bg-primary-50 text-primary-700 border-primary-200' : 'bg-white text-gray-500 border-gray-200 hover:text-gray-900'}`}
              title={hideEmpty ? 'Visa alla steg' : 'Dölj tomma steg'}>
              <Eye className="w-4 h-4" />
              <span className="hidden xl:inline">{hideEmpty ? 'Visa alla' : 'Dölj tomma'}</span>
            </button>
            {/* Stage settings removed — stages are locked */}
            <button onClick={() => { setShowNewDeal(true); fetchCustomers(); fetchJobTypes(); fetchLeadSources(); fetchJobTypeOptions() }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-700 text-white text-sm font-medium transition-all shadow-lg shadow-primary-600/10">
              <Plus className="w-4 h-4" /><span className="hidden sm:inline">Ny deal</span>
            </button>
          </div>
        </div>

        {/* Mobile tabs */}
        <div className="mt-3 flex gap-1 overflow-x-auto pb-1 lg:hidden scrollbar-hide">
          {stages.map((stage, idx) => (
            <button key={stage.id} onClick={() => setMobileStageIndex(idx)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${mobileStageIndex === idx ? 'text-white' : 'bg-gray-100 text-gray-500'}`}
              style={mobileStageIndex === idx ? { backgroundColor: stage.color } : undefined}>
              {stage.name}<span className="ml-1 opacity-70">{dealsForStage(stage.id).length}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Funnel bar + controls */}
      <div className="hidden lg:flex items-center gap-2 px-4 py-2 bg-white/60 border-b border-gray-100">
        {/* Funnel mini-bar */}
        <div className="flex-1 flex items-center gap-0.5">
          {stages.filter(s => !s.is_lost).map(stage => {
            const count = dealsForStage(stage.id).length
            return (
              <button key={stage.id} onClick={() => {
                const el = document.getElementById(`stage-${stage.id}`)
                el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
              }}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all hover:opacity-100 ${count === 0 ? 'opacity-40' : 'opacity-80'}`}
                style={{ backgroundColor: stage.color + '20', color: stage.color }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
                {stage.name.split(' ')[0]}
                {count > 0 && <span className="font-bold">{count}</span>}
              </button>
            )
          })}
          {(() => {
            const lostStage = stages.find(s => s.is_lost)
            if (!lostStage) return null
            return (
              <button onClick={() => {
                const el = document.getElementById(`stage-${lostStage.id}`)
                el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
              }}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-red-600 bg-red-50 opacity-80 hover:opacity-100">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                Förlorad
                {dealsForStage(lostStage.id).length > 0 && <span className="font-bold">{dealsForStage(lostStage.id).length}</span>}
              </button>
            )
          })()}
        </div>
        {/* Toggle hide empty */}
        <button onClick={toggleHideEmpty}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${hideEmpty ? 'bg-primary-50 text-primary-700 border border-[#E2E8F0]' : 'bg-gray-50 text-gray-500 border border-[#E2E8F0]'}`}>
          <Eye className="w-3.5 h-3.5" />
          {hideEmpty ? 'Visa alla steg' : 'Dölj tomma'}
        </button>
        {/* Scroll arrows */}
        <button onClick={() => scrollPipeline('left')} className="p-1.5 rounded-lg bg-gray-50 border border-[#E2E8F0] text-gray-400 hover:text-gray-700 hover:bg-gray-100">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={() => scrollPipeline('right')} className="p-1.5 rounded-lg bg-gray-50 border border-[#E2E8F0] text-gray-400 hover:text-gray-700 hover:bg-gray-100">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </>
  )
}
