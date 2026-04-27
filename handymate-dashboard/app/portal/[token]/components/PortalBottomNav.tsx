'use client'

import { Home, FolderKanban, FileText, User } from 'lucide-react'

export type BottomTab = 'home' | 'project' | 'docs' | 'contact'

interface PortalBottomNavProps {
  active: BottomTab
  onChange: (tab: BottomTab) => void
}

const TABS: { id: BottomTab; label: string; Icon: typeof Home }[] = [
  { id: 'home',    label: 'Hem',      Icon: Home },
  { id: 'project', label: 'Projekt',  Icon: FolderKanban },
  { id: 'docs',    label: 'Dokument', Icon: FileText },
  { id: 'contact', label: 'Kontakt',  Icon: User },
]

/**
 * Sticky bottom-nav (4 tabs). Replikerar Claude Designs BPTabs.
 * Active-state = --bee-700 (per business).
 */
export default function PortalBottomNav({ active, onChange }: PortalBottomNavProps) {
  return (
    <div className="bp-tabs">
      {TABS.map(t => {
        const isActive = active === t.id
        return (
          <button
            type="button"
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`bp-tab ${isActive ? 'active' : ''}`}
          >
            <span className="bp-tab-icon">
              <t.Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
            </span>
            <span>{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}
