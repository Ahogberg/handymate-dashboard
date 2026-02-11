'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Inbox, Mic, Volume2, Loader2 } from 'lucide-react'

const LoadingSpinner = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
  </div>
)

const InboxPage = dynamic(() => import('@/app/dashboard/inbox/page'), {
  loading: LoadingSpinner,
})

const RecordingsPage = dynamic(() => import('@/app/dashboard/recordings/page'), {
  loading: LoadingSpinner,
})

const AssistantPage = dynamic(() => import('@/app/dashboard/assistant/page'), {
  loading: LoadingSpinner,
})

type TabKey = 'inbox' | 'history' | 'assistant'

const tabs: { key: TabKey; label: string; icon: any }[] = [
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'history', label: 'Samtalshistorik', icon: Volume2 },
  { key: 'assistant', label: 'AI-assistent', icon: Mic },
]

export default function CallsPage() {
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as TabKey) || 'inbox'
  const [activeTab, setActiveTab] = useState<TabKey>(
    tabs.some(t => t.key === initialTab) ? initialTab : 'inbox'
  )

  return (
    <div className="bg-[#09090b] min-h-screen">
      {/* Sticky tab bar */}
      <div className="sticky top-0 z-30 bg-[#09090b]/95 backdrop-blur-xl border-b border-zinc-800 px-4 sm:px-8 pt-4 sm:pt-6 pb-0">
        <div className="flex gap-1 p-1 bg-zinc-900/50 rounded-xl border border-zinc-800 mb-4 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-white border border-violet-500/30'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              <tab.icon className={`w-4 h-4 ${activeTab === tab.key ? 'text-violet-400' : ''}`} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content - each page renders its own full layout */}
      {activeTab === 'inbox' && <InboxPage />}
      {activeTab === 'history' && <RecordingsPage />}
      {activeTab === 'assistant' && <AssistantPage />}
    </div>
  )
}
