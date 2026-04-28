'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import { Calendar, Clock, FileText, ClipboardCheck, Wallet } from 'lucide-react'

export type TimeTab = 'today' | 'week' | 'billable' | 'approve' | 'payroll'

interface TabDef {
  id: TimeTab
  label: string
  icon: typeof Clock
  /** Permission som krävs. Saknas = synlig för alla. */
  permission?: 'approve_time' | 'create_invoices' | 'see_financials'
}

const TABS: TabDef[] = [
  { id: 'today',    label: 'Idag',           icon: Clock },
  { id: 'week',     label: 'Vecka',          icon: Calendar },
  { id: 'billable', label: 'Att fakturera',  icon: FileText,        permission: 'create_invoices' },
  { id: 'approve',  label: 'Att attestera',  icon: ClipboardCheck,  permission: 'approve_time' },
  { id: 'payroll',  label: 'Löneunderlag',   icon: Wallet,          permission: 'see_financials' },
]

/**
 * Tab-navigation för tidsmodulen. Skriver tab-state till URL via ?tab=.
 * Filter-params (user, week, project, status) bevaras vid tab-byte.
 */
export default function TabsBar({ active }: { active: TimeTab }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { can, loading } = useCurrentUser()

  const visible = TABS.filter(t => !t.permission || can(t.permission))

  const switchTab = (id: TimeTab) => {
    const next = new URLSearchParams(params?.toString() || '')
    next.set('tab', id)
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  if (loading) {
    return <div className="h-[42px] mb-6" />
  }

  return (
    <div className="mb-6 border-b border-[#E2E8F0] overflow-x-auto">
      <div className="flex gap-1 min-w-fit" role="tablist">
        {visible.map(tab => {
          const Icon = tab.icon
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => switchTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-[10px] text-[13px] font-medium border-b-2 -mb-[1px] whitespace-nowrap transition-colors ${
                isActive
                  ? 'text-[#0F766E] border-[#0F766E]'
                  : 'text-[#64748B] border-transparent hover:text-[#1E293B]'
              }`}
            >
              <Icon className="w-[15px] h-[15px]" />
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
