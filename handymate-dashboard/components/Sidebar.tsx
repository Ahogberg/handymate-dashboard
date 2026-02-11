'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid,
  Phone,
  Calendar,
  Users,
  Briefcase,
  Clock,
  Settings,
  Zap,
  LogOut,
  FileText,
  Receipt,
  ChevronDown,
  FolderKanban,
  Menu,
  X,
  User
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useCurrentUser } from '@/lib/CurrentUserContext'

interface SidebarProps {
  businessName: string
  businessId?: string
  onLogout: () => void
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

export default function Sidebar({ businessName, businessId, onLogout }: SidebarProps) {
  const pathname = usePathname()
  const [pendingCount, setPendingCount] = useState(0)
  const [jobbOpen, setJobbOpen] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const { user: currentUser } = useCurrentUser()

  // Close mobile menu and user menu on route change
  useEffect(() => {
    setIsMobileOpen(false)
    setUserMenuOpen(false)
  }, [pathname])

  // Close user menu on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [userMenuOpen])

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isMobileOpen])

  // Fetch pending count for badge
  useEffect(() => {
    if (!businessId) return

    fetchPendingCount()

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
        () => { fetchPendingCount() }
      )
      .subscribe()

    const interval = setInterval(fetchPendingCount, 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [businessId])

  async function fetchPendingCount() {
    if (!businessId) return

    const { count: aiCount } = await supabase
      .from('ai_suggestion')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'pending')

    const { count: recordingCount } = await supabase
      .from('call_recording')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .is('transcript', null)

    setPendingCount((aiCount || 0) + (recordingCount || 0))
  }

  // Auto-expand Jobb dropdown if a child route is active
  const jobbPaths = ['/dashboard/projects', '/dashboard/quotes', '/dashboard/invoices']
  const isJobbActive = jobbPaths.some(p => pathname === p || pathname?.startsWith(p + '/'))

  useEffect(() => {
    if (isJobbActive) setJobbOpen(true)
  }, [isJobbActive])

  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(href + '/')
  }

  function navClass(active: boolean) {
    return `flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
      active
        ? 'bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-white border border-violet-500/30'
        : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
    }`
  }

  function subNavClass(active: boolean) {
    return `flex items-center gap-3 px-4 py-2 rounded-lg transition-all ${
      active
        ? 'text-violet-400 bg-violet-500/10'
        : 'text-zinc-500 hover:text-white hover:bg-zinc-800/50'
    }`
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="p-4 sm:p-6 border-b border-zinc-800">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/25">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white">Handymate</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {/* Dashboard */}
        <Link href="/dashboard" className={navClass(pathname === '/dashboard')}>
          <div className="flex items-center gap-3">
            <LayoutGrid className={`w-5 h-5 ${pathname === '/dashboard' ? 'text-violet-400' : ''}`} />
            <span className="text-sm sm:text-base">Dashboard</span>
          </div>
        </Link>

        {/* Samtal */}
        <Link href="/dashboard/calls" className={navClass(isActive('/dashboard/calls') || isActive('/dashboard/inbox') || isActive('/dashboard/assistant') || isActive('/dashboard/recordings'))}>
          <div className="flex items-center gap-3">
            <Phone className={`w-5 h-5 ${isActive('/dashboard/calls') || isActive('/dashboard/inbox') ? 'text-violet-400' : ''}`} />
            <span className="text-sm sm:text-base">Samtal</span>
          </div>
          {pendingCount > 0 && (
            <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-full animate-pulse">
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </Link>

        {/* Schema */}
        <Link href="/dashboard/schedule" className={navClass(isActive('/dashboard/schedule') || isActive('/dashboard/calendar'))}>
          <div className="flex items-center gap-3">
            <Calendar className={`w-5 h-5 ${isActive('/dashboard/schedule') ? 'text-violet-400' : ''}`} />
            <span className="text-sm sm:text-base">Schema</span>
          </div>
        </Link>

        {/* Kunder */}
        <Link href="/dashboard/customers" className={navClass(isActive('/dashboard/customers'))}>
          <div className="flex items-center gap-3">
            <Users className={`w-5 h-5 ${isActive('/dashboard/customers') ? 'text-violet-400' : ''}`} />
            <span className="text-sm sm:text-base">Kunder</span>
          </div>
        </Link>

        {/* Jobb (dropdown) */}
        <div>
          <button
            onClick={() => setJobbOpen(!jobbOpen)}
            className={`w-full ${navClass(isJobbActive)}`}
          >
            <div className="flex items-center gap-3">
              <Briefcase className={`w-5 h-5 ${isJobbActive ? 'text-violet-400' : ''}`} />
              <span className="text-sm sm:text-base">Jobb</span>
            </div>
            <ChevronDown className={`w-4 h-4 transition-transform ${jobbOpen ? 'rotate-180' : ''}`} />
          </button>
          {jobbOpen && (
            <div className="ml-4 mt-1 space-y-1">
              <Link href="/dashboard/projects" className={subNavClass(isActive('/dashboard/projects'))}>
                <FolderKanban className="w-4 h-4" />
                <span className="text-sm">Projekt</span>
              </Link>
              <Link href="/dashboard/quotes" className={subNavClass(isActive('/dashboard/quotes'))}>
                <FileText className="w-4 h-4" />
                <span className="text-sm">Offerter</span>
              </Link>
              <Link href="/dashboard/invoices" className={subNavClass(isActive('/dashboard/invoices'))}>
                <Receipt className="w-4 h-4" />
                <span className="text-sm">Fakturor</span>
              </Link>
            </div>
          )}
        </div>

        {/* Tid */}
        <Link href="/dashboard/time" className={navClass(isActive('/dashboard/time'))}>
          <div className="flex items-center gap-3">
            <Clock className={`w-5 h-5 ${isActive('/dashboard/time') ? 'text-violet-400' : ''}`} />
            <span className="text-sm sm:text-base">Tid</span>
          </div>
        </Link>

        {/* Inställningar */}
        <Link href="/dashboard/settings" className={navClass(isActive('/dashboard/settings') || isActive('/dashboard/team'))}>
          <div className="flex items-center gap-3">
            <Settings className={`w-5 h-5 ${isActive('/dashboard/settings') ? 'text-violet-400' : ''}`} />
            <span className="text-sm sm:text-base">Inställningar</span>
          </div>
        </Link>
      </nav>

      {/* User Menu */}
      <div className="p-4 border-t border-zinc-800">
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="w-full flex items-center gap-3 p-3 bg-zinc-800/50 rounded-xl hover:bg-zinc-800 transition-all"
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: currentUser?.color || '#8B5CF6' }}
            >
              <span className="text-white text-xs font-bold">
                {currentUser ? getInitials(currentUser.name) : businessName.substring(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm text-white truncate">{currentUser?.name || businessName}</p>
              <p className="text-xs text-zinc-500 truncate">{currentUser?.email || ''}</p>
            </div>
            <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {userMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50 overflow-hidden">
              <Link
                href="/dashboard/profile"
                className="flex items-center gap-2 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 transition-all"
              >
                <User className="w-4 h-4" />
                Min profil
              </Link>
              <div className="border-t border-zinc-800" />
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-all"
              >
                <LogOut className="w-4 h-4" />
                Logga ut
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="fixed top-4 left-4 z-40 p-3 bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-xl text-white md:hidden min-w-[48px] min-h-[48px] flex items-center justify-center"
        aria-label="Öppna meny"
      >
        <Menu className="w-5 h-5" />
        {pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center text-xs font-bold bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-full">
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        )}
      </button>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar - Mobile */}
      <div
        className={`fixed left-0 top-0 h-screen w-72 bg-zinc-900/95 backdrop-blur-xl border-r border-zinc-800 flex flex-col z-50 transition-transform duration-300 md:hidden ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          onClick={() => setIsMobileOpen(false)}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-lg min-w-[40px] min-h-[40px] flex items-center justify-center"
          aria-label="Stäng meny"
        >
          <X className="w-5 h-5" />
        </button>
        {sidebarContent}
      </div>

      {/* Sidebar - Desktop */}
      <div className="hidden md:flex fixed left-0 top-0 h-screen w-64 bg-zinc-900/50 backdrop-blur-xl border-r border-zinc-800 flex-col">
        {sidebarContent}
      </div>
    </>
  )
}
