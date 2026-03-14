'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Inbox, Volume2, Mail, Loader2 } from 'lucide-react'

const LoadingSpinner = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 className="w-6 h-6 text-sky-700 animate-spin" />
  </div>
)

const InboxPage = dynamic(() => import('@/app/dashboard/inbox/page'), {
  loading: LoadingSpinner,
})

const RecordingsPage = dynamic(() => import('@/app/dashboard/recordings/page'), {
  loading: LoadingSpinner,
})

const EmailInboxPage = dynamic(() => import('@/app/dashboard/email/page'), {
  loading: LoadingSpinner,
})

type TabKey = 'inbox' | 'email' | 'history'

const tabs: { key: TabKey; label: string; icon: any }[] = [
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'email', label: 'E-post', icon: Mail },
  { key: 'history', label: 'Samtalshistorik', icon: Volume2 },
]

export default function CallsPage() {
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as TabKey) || 'inbox'
  const [activeTab, setActiveTab] = useState<TabKey>(
    tabs.some(t => t.key === initialTab) ? initialTab : 'inbox'
  )

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Sticky tab bar */}
      <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-xl border-b border-gray-200 px-4 sm:px-8 pt-4 sm:pt-6 pb-0">
        <div className="flex gap-1 p-1 bg-white rounded-xl border border-gray-200 mb-4 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-gradient-to-r from-teal-600/20 to-teal-500/20 text-white border border-teal-300'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <tab.icon className={`w-4 h-4 ${activeTab === tab.key ? 'text-sky-700' : ''}`} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'inbox' && <InboxPage />}
      {activeTab === 'email' && <EmailInboxPage />}
      {activeTab === 'history' && <RecordingsPage />}
    </div>
  )
}
