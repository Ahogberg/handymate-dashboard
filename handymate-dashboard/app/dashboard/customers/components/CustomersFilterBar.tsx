'use client'

import { Crown, Search, Tag } from 'lucide-react'
import type { CustomerTag } from './types'

type LtvFilter = '' | 'vip' | 'inactive_vip'
type SortBy = 'name' | 'ltv' | 'recent'

interface CustomersFilterBarProps {
  searchTerm: string
  setSearchTerm: (s: string) => void
  tags: CustomerTag[]
  selectedTagFilter: string
  setSelectedTagFilter: (id: string) => void
  ltvFilter: LtvFilter
  setLtvFilter: (f: LtvFilter) => void
  sortBy: SortBy
  setSortBy: (s: SortBy) => void
  onOpenTagModal: () => void
}

export function CustomersFilterBar({
  searchTerm,
  setSearchTerm,
  tags,
  selectedTagFilter,
  setSelectedTagFilter,
  ltvFilter,
  setLtvFilter,
  sortBy,
  setSortBy,
  onOpenTagModal,
}: CustomersFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full sm:w-auto sm:max-w-xs flex-1 sm:flex-none">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Sök kund…"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors"
        />
      </div>
      {tags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setSelectedTagFilter('')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              !selectedTagFilter
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            Alla
          </button>
          {tags.map(tag => (
            <button
              key={tag.tag_id}
              onClick={() => setSelectedTagFilter(selectedTagFilter === tag.tag_id ? '' : tag.tag_id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                selectedTagFilter === tag.tag_id
                  ? 'text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
              style={selectedTagFilter === tag.tag_id ? { backgroundColor: tag.color } : undefined}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
              {tag.name}
              <span className="opacity-60">({tag.customer_count})</span>
            </button>
          ))}
          <span className="w-px h-4 bg-slate-200 mx-1" />
          <button
            onClick={() => setLtvFilter(ltvFilter === 'vip' ? '' : 'vip')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              ltvFilter === 'vip'
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Crown className="w-3 h-3" />
            VIP
          </button>
          <button
            onClick={() => setLtvFilter(ltvFilter === 'inactive_vip' ? '' : 'inactive_vip')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              ltvFilter === 'inactive_vip'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            Inaktiva VIP
          </button>
          <span className="w-px h-4 bg-slate-200 mx-1" />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortBy)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-600 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors"
          >
            <option value="name">Namn A–Ö</option>
            <option value="ltv">Livstidsvärde</option>
            <option value="recent">Senast skapad</option>
          </select>
        </div>
      )}
      <button
        onClick={onOpenTagModal}
        className="ml-auto sm:ml-0 inline-flex items-center justify-center w-9 h-9 text-slate-500 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
        title="Hantera taggar"
        aria-label="Hantera taggar"
      >
        <Tag className="w-4 h-4" />
      </button>
    </div>
  )
}
