'use client'

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
  FileText
} from 'lucide-react'

interface SidebarProps {
  businessName: string
  onLogout: () => void
}

const menuItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Bokningar', href: '/dashboard/bookings', icon: Calendar },
  { name: 'Kunder', href: '/dashboard/customers', icon: Users },
  { name: 'AI Inbox', href: '/dashboard/ai-inbox', icon: Sparkles },
  { name: 'Kampanjer', href: '/dashboard/campaigns', icon: Megaphone },
  { name: 'Offerter', href: '/dashboard/quotes', icon: FileText },
  { name: 'Inställningar', href: '/dashboard/settings', icon: Settings },
]

export default function Sidebar({ businessName, onLogout }: SidebarProps) {
  const pathname = usePathname()

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
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                isActive 
                  ? 'bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-white border border-violet-500/30' 
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              <item.icon className={`w-5 h-5 ${isActive ? 'text-violet-400' : ''}`} />
              {item.name}
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
