'use client'

import { Search } from 'lucide-react'
import { usePipelineContext } from '../context'

/**
 * Filter-dropdown — visas under filter-knappen i headern.
 * Mobilversion av sökfältet ligger inuti dropdownen.
 */
export function PipelineFilters() {
  const {
    filterSearch,
    setFilterSearch,
    filterPriority,
    setFilterPriority,
    filterCustomerType,
    setFilterCustomerType,
    filterAssignedTo,
    setFilterAssignedTo,
    filterSource,
    setFilterSource,
    customerTypeOptions,
    sourceOptions,
    customerTypeLabel,
    sourceLabel,
    hasActiveFilters,
    activeFilterCount,
    teamMembers,
  } = usePipelineContext()

  return (
    <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xl z-50">
      <div className="space-y-3">
        {/* Mobilversion av sökfältet */}
        <div className="sm:hidden">
          <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Sök</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Ärende, kund, telefon..." value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-primary-400" />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Prioritet</label>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-primary-400">
            <option value="all">Alla</option>
            <option value="urgent">Brådskande</option>
            <option value="high">Hög</option>
            <option value="medium">Medium</option>
            <option value="low">Låg</option>
          </select>
        </div>
        {customerTypeOptions.length > 0 && (
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Kundtyp</label>
            <select value={filterCustomerType} onChange={e => setFilterCustomerType(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-primary-400">
              <option value="all">Alla</option>
              {customerTypeOptions.map(ct => (
                <option key={ct} value={ct}>{customerTypeLabel(ct)}</option>
              ))}
              <option value="unknown">Ingen kundtyp angiven</option>
            </select>
          </div>
        )}
        <div>
          <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Ansvarig</label>
          <select value={filterAssignedTo} onChange={e => setFilterAssignedTo(e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-primary-400">
            <option value="all">Alla</option>
            <option value="unassigned">Ej tilldelad</option>
            {teamMembers.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        {sourceOptions.length > 0 && (
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Källa</label>
            <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-primary-400">
              <option value="all">Alla</option>
              {sourceOptions.map(s => (
                <option key={s} value={s}>{sourceLabel(s)}</option>
              ))}
              <option value="unknown">Okänd källa</option>
            </select>
          </div>
        )}
        {hasActiveFilters && (
          <button
            onClick={() => {
              setFilterSearch('')
              setFilterPriority('all')
              setFilterCustomerType('all')
              setFilterAssignedTo('all')
              setFilterSource('all')
            }}
            className="text-xs text-primary-700 hover:underline font-medium"
          >
            Rensa alla filter ({activeFilterCount})
          </button>
        )}
      </div>
    </div>
  )
}
