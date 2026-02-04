'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Calendar,
  Users,
  Sparkles,
  Settings,
  Zap,
  LogOut,
  Megaphone,
  FileText,
  Clock,
  Mic
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface SidebarProps {
  businessName: string
  businessId?: string
  onLogout: () => void
}

const menuItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Bokningar', href: '/dashboard/bookings', icon: Calendar },
  { name: 'Tidrapport', href: '/dashboard/time', icon: Clock },
  { name: 'Inspelningar', href: '/dashboard/recordings', icon: Mic },
  { name: 'Kunder', href: '/dashboard/customers', icon: Users },
  { name: 'AI Inbox', href: '/dashboard/ai-inbox', icon: Sparkles, badge: true },
  { name: 'Kampanjer', href: '/dashboard/campaigns', icon: Megaphone },
  { name: 'Offerter', href: '/dashboard/quotes', icon: FileText },
  { name: 'Inställningar', href: '/dashboard/settings', icon: Settings },
]

export default function Sidebar({ businessName, businessId, onLogout }: SidebarProps) {
  const pathname = usePathname()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!businessId) return

    // Initial fetch
    fetchPendingCount()

    // Set up realtime subscription
    const channel = supabase
      .channel('ai_suggestions_changes')
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

    const { count } = await supabase
      .from('ai_suggestion')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'pending')

    setPendingCount(count || 0)
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
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
          const showBadge = item.badge && pendingCount > 0

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
