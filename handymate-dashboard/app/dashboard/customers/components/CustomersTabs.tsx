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

export function CustomersTabs({
  activeTab,
  setActiveTab,
  customerCount,
  campaignCount,
  onFetchDuplicates,
  onCreateCustomer,
}: CustomersTabsProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex bg-white border border-[#E2E8F0] rounded-xl p-1">
        <button
          onClick={() => setActiveTab('customers')}
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 sm:flex-none min-h-[44px] ${
            activeTab === 'customers' ? 'bg-primary-700 text-white' : 'text-gray-500 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span className="hidden sm:inline">Kundlista</span>
          <span className="sm:hidden">Kunder</span>
          <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-50 rounded-full">{customerCount}</span>
        </button>
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 sm:flex-none min-h-[44px] ${
            activeTab === 'campaigns' ? 'bg-primary-700 text-white' : 'text-gray-500 hover:text-white'
          }`}
        >
          <Megaphone className="w-4 h-4" />
          Kampanjer
          <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-50 rounded-full">{campaignCount}</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('duplicates')
            onFetchDuplicates()
          }}
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 sm:flex-none min-h-[44px] ${
            activeTab === 'duplicates' ? 'bg-primary-700 text-white' : 'text-gray-500 hover:text-white'
          }`}
        >
          <Merge className="w-4 h-4" />
          <span className="hidden sm:inline">Dubbletter</span>
          <span className="sm:hidden">Dupl.</span>
        </button>
      </div>

      {activeTab === 'customers' && (
        <div className="flex items-center gap-2 sm:ml-auto">
          <Link
            href="/dashboard/customers/import"
            className="flex items-center justify-center px-4 py-2.5 bg-white border border-[#E2E8F0] rounded-lg font-medium text-gray-900 hover:bg-gray-200 min-h-[44px]"
          >
            <Upload className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Importera</span>
          </Link>
          <button
            onClick={onCreateCustomer}
            className="flex items-center justify-center px-4 py-2.5 bg-primary-700 rounded-xl font-medium text-white hover:opacity-90 min-h-[44px]"
          >
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Ny kund</span>
          </button>
        </div>
      )}

      {activeTab === 'campaigns' && (
        <Link
          href="/dashboard/campaigns/new"
          className="sm:ml-auto flex items-center justify-center px-4 py-2.5 bg-primary-700 rounded-xl font-medium text-white hover:opacity-90 min-h-[44px]"
        >
          <Plus className="w-4 h-4 mr-2" />
          Ny kampanj
        </Link>
      )}
    </div>
  )
}
