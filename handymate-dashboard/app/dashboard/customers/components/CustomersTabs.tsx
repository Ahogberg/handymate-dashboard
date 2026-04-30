'use client'

import Link from 'next/link'
import { Megaphone, Merge, Plus, Upload, Users } from 'lucide-react'

type TabKey = 'customers' | 'campaigns' | 'duplicates'

interface CustomersTabsProps {
  activeTab: TabKey
  setActiveTab: (t: TabKey) => void
  customerCount: number
  campaignCount: number
  onFetchDuplicates: () => void
  onCreateCustomer: () => void
}

/**
 * Underline-style tabs (matchar offert-listans tabs). Aktivt tab har
 * primary-700 underline + ikon + label, inaktivt är slate-500.
 */
export function CustomersTabs({
  activeTab,
  setActiveTab,
  customerCount,
  campaignCount,
  onFetchDuplicates,
  onCreateCustomer,
}: CustomersTabsProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div className="flex items-center border-b border-slate-200 gap-1 -mb-px">
        <TabButton
          active={activeTab === 'customers'}
          icon={<Users className="w-3.5 h-3.5" />}
          label="Kundlista"
          shortLabel="Kunder"
          count={customerCount}
          onClick={() => setActiveTab('customers')}
        />
        <TabButton
          active={activeTab === 'campaigns'}
          icon={<Megaphone className="w-3.5 h-3.5" />}
          label="Kampanjer"
          count={campaignCount}
          onClick={() => setActiveTab('campaigns')}
        />
        <TabButton
          active={activeTab === 'duplicates'}
          icon={<Merge className="w-3.5 h-3.5" />}
          label="Dubbletter"
          shortLabel="Dupl."
          onClick={() => {
            setActiveTab('duplicates')
            onFetchDuplicates()
          }}
        />
      </div>

      {activeTab === 'customers' && (
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/customers/import"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Importera</span>
          </Link>
          <button
            onClick={onCreateCustomer}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-primary-700 hover:bg-primary-600 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Ny kund
          </button>
        </div>
      )}

      {activeTab === 'campaigns' && (
        <Link
          href="/dashboard/campaigns/new"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-primary-700 hover:bg-primary-600 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          Ny kampanj
        </Link>
      )}
    </div>
  )
}

function TabButton({
  active,
  icon,
  label,
  shortLabel,
  count,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  shortLabel?: string
  count?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-3 text-sm font-semibold transition-colors border-b-2 ${
        active
          ? 'text-primary-700 border-primary-700'
          : 'text-slate-500 hover:text-slate-700 border-transparent'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {shortLabel && <span className="sm:hidden">{shortLabel}</span>}
      {typeof count === 'number' && (
        <span
          className={`ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${
            active ? 'bg-primary-50 text-primary-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}
