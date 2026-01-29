'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  LayoutDashboard, 
  Calendar, 
  Users, 
  Settings,
  Sparkles,
  Zap
} from 'lucide-react'
import clsx from 'clsx'

const navigation = [
  { name: 'Översikt', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Bokningar', href: '/dashboard/bookings', icon: Calendar },
  { name: 'Kunder', href: '/dashboard/customers', icon: Users },
  { name: 'AI Inbox', href: '/dashboard/ai-inbox', icon: Sparkles },
  { name: 'Inställningar', href: '/dashboard/settings', icon: Settings },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="flex flex-col w-64 bg-zinc-900/50 border-r border-zinc-800 min-h-screen backdrop-blur-xl">
      <div className="flex items-center h-16 px-6 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/25">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white">Handymate</span>
        </div>
      </div>
      
      <nav className="flex-1 px-4 py-6 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/dashboard' && pathname.startsWith(item.href))
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={clsx(
                'flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all',
                isActive
                  ? 'bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-white border border-violet-500/30'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
              )}
            >
              <item.icon className={clsx(
                'w-5 h-5 mr-3',
                isActive ? 'text-violet-400' : ''
              )} />
              {item.name}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-zinc-800">
        <div className="flex items-center p-3 rounded-xl bg-zinc-800/50">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">E</span>
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-white">Elexperten</p>
            <p className="text-xs text-zinc-500">Stockholm</p>
          </div>
        </div>
      </div>
    </div>
  )
}
