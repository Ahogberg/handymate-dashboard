'use client'

type CampaignFilter = 'all' | 'draft' | 'sent'

interface CampaignFilterTabsProps {
  filter: CampaignFilter
  setFilter: (f: CampaignFilter) => void
}

export function CampaignFilterTabs({ filter, setFilter }: CampaignFilterTabsProps) {
  return (
    <div className="flex bg-white border border-[#E2E8F0] rounded-xl p-1 overflow-x-auto">
      {[
        { id: 'all' as const, label: 'Alla' },
        { id: 'draft' as const, label: 'Utkast' },
        { id: 'sent' as const, label: 'Skickade' },
      ].map(f => (
        <button
          key={f.id}
          onClick={() => setFilter(f.id)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap min-h-[40px] ${
            filter === f.id ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}
