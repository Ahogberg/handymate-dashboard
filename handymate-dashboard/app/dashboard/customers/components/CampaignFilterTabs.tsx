'use client'

type CampaignFilter = 'all' | 'draft' | 'sent'

interface CampaignFilterTabsProps {
  filter: CampaignFilter
  setFilter: (f: CampaignFilter) => void
}

export function CampaignFilterTabs({ filter, setFilter }: CampaignFilterTabsProps) {
  return (
    <div className="inline-flex items-center bg-white border border-slate-200 rounded-xl p-1">
      {[
        { id: 'all' as const, label: 'Alla' },
        { id: 'draft' as const, label: 'Utkast' },
        { id: 'sent' as const, label: 'Skickade' },
      ].map(f => (
        <button
          key={f.id}
          onClick={() => setFilter(f.id)}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
            filter === f.id ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}
