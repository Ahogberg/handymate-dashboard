'use client'

import { FolderKanban, FileText, Receipt, MessageSquare } from 'lucide-react'
import type { Tab } from '../types'

interface PortalTabsProps {
  activeTab: Tab
  unreadMessages: number
  onTabChange: (tab: Tab) => void
}

/**
 * Sticky tab-navigation under headern (Projekt | Offerter | Fakturor | Meddelanden).
 * Extraherat från page.tsx vid komponent-splitten — INGEN visuell ändring.
 *
 * Notering: tabs visas bara när inget projekt är valt — den logiken
 * äger orchestrator-komponenten i page.tsx (PortalTabs renderas
 * villkorligt utifrån selectedProject).
 */
export default function PortalTabs({ activeTab, unreadMessages, onTabChange }: PortalTabsProps) {
  return (
    <div className="bg-white border-b border-gray-200 sticky top-[73px] z-10">
      <div className="max-w-2xl mx-auto px-4 flex">
        {([
          { id: 'projects' as Tab, label: 'Projekt', icon: FolderKanban },
          { id: 'quotes' as Tab, label: 'Offerter', icon: FileText },
          { id: 'invoices' as Tab, label: 'Fakturor', icon: Receipt },
          { id: 'messages' as Tab, label: 'Meddelanden', icon: MessageSquare, badge: unreadMessages },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
              activeTab === tab.id
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.badge ? (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary-700 text-gray-900 rounded-full">{tab.badge}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}
