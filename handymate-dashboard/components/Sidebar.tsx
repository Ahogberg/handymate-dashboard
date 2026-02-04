'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Calendar,
  Users,
  Inbox,
  Settings,
  Zap,
  LogOut,
  FileText,
  Receipt,
  ChevronDown
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface SidebarProps {
  businessName: string
  businessId?: string
  onLogout: () => void
}

interface MenuItem {
  name: string
  href: string
  icon: any
  badge?: boolean
  subItems?: { name: string; href: string; icon: any }[]
}

const menuItems: MenuItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Inbox', href: '/dashboard/inbox', icon: Inbox, badge: true },
  { name: 'Kalender', href: '/dashboard/calendar', icon: Calendar },
  { name: 'Kunder', href: '/dashboard/customers', icon: Users },
  {
    name: 'Offerter & Fakturor',
    href: '/dashboard/quotes',
    icon: FileText,
    subItems: [
      { name: 'Offerter', href: '/dashboard/quotes', icon: FileText },
      { name: 'Fakturor', href: '/dashboard/invoices', icon: Receipt },
    ]
  },
  { name: 'Inställningar', href: '/dashboard/settings', icon: Settings },
]

export default function Sidebar({ businessName, businessId, onLogout }: SidebarProps) {
  const pathname = usePathname()
  const [pendingCount, setPendingCount] = useState(0)
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['Offerter & Fakturor'])

  useEffect(() => {
    if (!businessId) return

    // Initial fetch
    fetchPendingCount()

    // Set up realtime subscription for AI suggestions
    const channel = supabase
      .channel('inbox_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_suggestion',
          filter: `business_id=eq.${businessId}`
        },
        () => {
          fetchPendingCount()
        }
      )
      .subscribe()

    // Poll every 30 seconds as backup
    const interval = setInterval(fetchPendingCount, 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [businessId])

  async function fetchPendingCount() {
    if (!businessId) return

    // Count pending AI suggestions
    const { count: aiCount } = await supabase
      .from('ai_suggestion')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'pending')

    // Count unprocessed recordings (no transcript yet)
    const { count: recordingCount } = await supabase
      .from('call_recording')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .is('transcript', null)

    setPendingCount((aiCount || 0) + (recordingCount || 0))
  }

  return (
    <div className="fixed left-0 top-0 h-screen w-64 bg-zinc-900/50 backdrop-blur-xl border-r border-zinc-800 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-zinc-800">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/25">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white">Handymate</span>
        </Link>
      </div>

      {/* Menu */}
      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
          const hasSubItems = item.subItems && item.subItems.length > 0
          const isExpanded = expandedMenus.includes(item.name)
          const isSubItemActive = hasSubItems && item.subItems?.some(sub => pathname === sub.href || pathname?.startsWith(sub.href + '/'))
          const showBadge = item.badge && pendingCount > 0

          if (hasSubItems) {
            return (
              <div key={item.name}>
                <button
                  onClick={() => {
                    if (isExpanded) {
                      setExpandedMenus(expandedMenus.filter(m => m !== item.name))
                    } else {
                      setExpandedMenus([...expandedMenus, item.name])
                    }
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
                    isSubItemActive
                      ? 'bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-white border border-violet-500/30'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className={`w-5 h-5 ${isSubItemActive ? 'text-violet-400' : ''}`} />
                    {item.name}
                  </div>
                  <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
                {isExpanded && (
                  <div className="ml-4 mt-1 space-y-1">
                    {item.subItems?.map((sub) => {
                      const isSubActive = pathname === sub.href || pathname?.startsWith(sub.href + '/')
                      return (
                        <Link
                          key={sub.name}
                          href={sub.href}
                          className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all ${
                            isSubActive
                              ? 'text-violet-400 bg-violet-500/10'
                              : 'text-zinc-500 hover:text-white hover:bg-zinc-800/50'
                          }`}
                        >
                          <sub.icon className="w-4 h-4" />
                          {sub.name}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-white border border-violet-500/30'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <item.icon className={`w-5 h-5 ${isActive ? 'text-violet-400' : ''}`} />
                {item.name}
              </div>

              {showBadge && (
                <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-full animate-pulse">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Company Badge + Logout */}
      <div className="p-4 border-t border-zinc-800">
        <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">
                {businessName.substring(0, 2).toUpperCase()}
              </span>
            </div>
            <span className="text-sm text-zinc-300 truncate">{businessName}</span>
          </div>
          <button
            onClick={onLogout}
            className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-700 rounded-lg transition-all"
            title="Logga ut"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
