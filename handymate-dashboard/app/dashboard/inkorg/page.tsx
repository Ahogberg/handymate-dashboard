'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { MessageSquare, Volume2, Mail, History, Loader2 } from 'lucide-react'

/**
 * Inkorgen — en plats för allt som kommer in (2026-08-09).
 *
 * ═══ VARFÖR DEN FINNS ═══
 *
 * Allt som en kund skickar in landade tidigare på fyra ytor, varav TRE inte
 * fanns i sidomenyn:
 *
 *   /dashboard/sms-inbox   SMS            ← enda i menyn
 *   /dashboard/calls       flikbehållare  ← inte i menyn
 *   /dashboard/inbox       samtal+förslag ← inte i menyn
 *   /dashboard/ai-inbox    kopia av inbox ← inte i menyn
 *
 * Följden var att transkript och åtgärdsförslag från inkommande samtal bara
 * gick att nå genom att skriva URL:en själv. Arbetet fanns, men var osynligt.
 *
 * Den här sidan är samma flikmönster som /dashboard/calls redan använde —
 * lazy-laddade befintliga sidor, ingen ny datahämtning — men med SMS på plats
 * och en post i menyn. Ytan är också hemmet för mötesinspelningar när de
 * kommer (etapp 3): en flik till, ingen ny navigering att lära sig.
 *
 * ═══ VARFÖR LAZY ═══
 *
 * Samtalsfliken är 934 rader och gör egna Supabase-anrop. Att ladda den när
 * hantverkaren bara ville läsa ett SMS vore att betala för fyra sidor när man
 * öppnar en.
 */

const LoadingSpinner = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
  </div>
)

const SmsInboxPage = dynamic(() => import('@/app/dashboard/sms-inbox/page'), {
  loading: LoadingSpinner,
})

const CallInboxPage = dynamic(() => import('@/app/dashboard/inbox/page'), {
  loading: LoadingSpinner,
})

const EmailInboxPage = dynamic(() => import('@/app/dashboard/email/page'), {
  loading: LoadingSpinner,
})

const RecordingsPage = dynamic(() => import('@/app/dashboard/recordings/page'), {
  loading: LoadingSpinner,
})

type TabKey = 'sms' | 'samtal' | 'epost' | 'historik'

const tabs: { key: TabKey; label: string; icon: any }[] = [
  { key: 'sms', label: 'SMS', icon: MessageSquare },
  { key: 'samtal', label: 'Samtal', icon: Volume2 },
  { key: 'epost', label: 'E-post', icon: Mail },
  { key: 'historik', label: 'Historik', icon: History },
]

/** Gamla länkar ska landa på rätt flik i stället för att bara gå till SMS. */
const LEGACY_TAB: Record<string, TabKey> = {
  inbox: 'samtal',
  email: 'epost',
  history: 'historik',
}

export default function InkorgPage() {
  const searchParams = useSearchParams()
  const raw = searchParams?.get('tab') || ''
  const fran = LEGACY_TAB[raw] || (tabs.some(t => t.key === raw) ? (raw as TabKey) : 'sms')
  const [activeTab, setActiveTab] = useState<TabKey>(fran)

  return (
    <div className="bg-[#F8FAFC] min-h-screen">
      <div className="sticky top-0 z-30 bg-[#F8FAFC]/95 backdrop-blur-xl border-b border-gray-200 px-4 sm:px-8 pt-4 sm:pt-6 pb-0">
        <div className="flex gap-1 p-1 bg-white rounded-xl border border-[#E2E8F0] mb-4 overflow-x-auto">
          {tabs.map(tab => {
            const aktiv = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                aria-current={aktiv ? 'page' : undefined}
                // Den gamla flikbehållaren hade `bg-[#F0FDFA] text-white` på
                // aktiv flik — vit text på nästan vit bakgrund, alltså osynlig
                // etikett. Aktiv flik bär nu teal text på tealtonad botten.
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap min-h-[44px] ${
                  aktiv
                    ? 'bg-primary-50 text-primary-800 border border-primary-200'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <tab.icon className={`w-4 h-4 ${aktiv ? 'text-primary-700' : ''}`} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {activeTab === 'sms' && <SmsInboxPage />}
      {activeTab === 'samtal' && <CallInboxPage />}
      {activeTab === 'epost' && <EmailInboxPage />}
      {activeTab === 'historik' && <RecordingsPage />}
    </div>
  )
}
