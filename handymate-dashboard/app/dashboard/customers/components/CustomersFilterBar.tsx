'use client'

import { Search, Tag } from 'lucide-react'
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
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Sök kund..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E] min-h-[44px]"
        />
      </div>
      {tags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSelectedTagFilter('')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              !selectedTagFilter ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            Alla
          </button>
          {tags.map(tag => (
            <button
              key={tag.tag_id}
              onClick={() => setSelectedTagFilter(selectedTagFilter === tag.tag_id ? '' : tag.tag_id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${
                selectedTagFilter === tag.tag_id ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              style={selectedTagFilter === tag.tag_id ? { backgroundColor: tag.color } : undefined}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
              {tag.name}
              <span className="opacity-60">({tag.customer_count})</span>
            </button>
          ))}
          <span className="w-px h-4 bg-gray-200 mx-1" />
          <button
            onClick={() => setLtvFilter(ltvFilter === 'vip' ? '' : 'vip')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              ltvFilter === 'vip' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            👑 VIP
          </button>
          <button
            onClick={() => setLtvFilter(ltvFilter === 'inactive_vip' ? '' : 'inactive_vip')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              ltvFilter === 'inactive_vip' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            Inaktiva VIP
          </button>
          <span className="w-px h-4 bg-gray-200 mx-1" />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortBy)}
            className="px-2 py-1 rounded-lg text-xs border border-[#E2E8F0] text-gray-500 focus:outline-none"
          >
            <option value="name">Namn A-Ö</option>
            <option value="ltv">Livstidsvärde</option>
            <option value="recent">Senast skapad</option>
          </select>
        </div>
      )}
      <button
        onClick={onOpenTagModal}
        className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
        title="Hantera taggar"
      >
        <Tag className="w-4 h-4" />
      </button>
    </div>
  )
}
