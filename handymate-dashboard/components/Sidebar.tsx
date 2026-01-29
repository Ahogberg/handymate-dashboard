'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  LayoutDashboard, 
  Calendar, 
  Users, 
  MessageSquare, 
  Settings,
  Sparkles
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
    <div className="flex flex-col w-64 bg-gray-900 min-h-screen">
      <div className="flex items-center h-16 px-6 bg-gray-800">
        <span className="text-xl font-bold text-white">Handymate</span>
      </div>
      
      <nav className="flex-1 px-4 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/dashboard' && pathname.startsWith(item.href))
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={clsx(
                'flex items-center px-4 py-3 text-sm font-medium rounded-lg transition',
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
            >
              <item.icon className="w-5 h-5 mr-3" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-medium">E</span>
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-white">Elexperten</p>
            <p className="text-xs text-gray-400">Demo-konto</p>
          </div>
        </div>
      </div>
    </div>
  )
}
