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
  HelpCircle,
  FileText,
  Receipt,
  ChevronDown,
  FolderKanban,
  Menu,
  X,
  User,
  TrendingUp,
  Bell,
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

interface NotificationItem {
  id: string
  type: string
  title: string
  message: string | null
  icon: string
  link: string | null
  is_read: boolean
  created_at: string
}

export default function Sidebar({ businessName, businessId, onLogout }: SidebarProps) {
  const pathname = usePathname()
  const [pendingCount, setPendingCount] = useState(0)
  const [jobbOpen, setJobbOpen] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifCount, setNotifCount] = useState(0)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
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

  // Close notification panel on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    if (notifOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [notifOpen])

  // Fetch notification count
  useEffect(() => {
    if (!businessId) return
    fetchNotifCount()
    const interval = setInterval(fetchNotifCount, 30000)
    return () => clearInterval(interval)
  }, [businessId])

  async function fetchNotifCount() {
    if (!businessId) return
    try {
      const { count } = await supabase
        .from('notification')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('is_read', false)
      setNotifCount(count || 0)
    } catch { /* silent */ }
  }

  async function openNotifications() {
    setNotifOpen(!notifOpen)
    if (!notifOpen && businessId) {
      setNotifLoading(true)
      try {
        const { data } = await supabase
          .from('notification')
          .select('*')
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })
          .limit(15)
        setNotifications((data || []) as NotificationItem[])
      } catch { /* silent */ }
      setNotifLoading(false)
    }
  }

  async function markAllRead() {
    if (!businessId) return
    try {
      await supabase
        .from('notification')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('business_id', businessId)
        .eq('is_read', false)
      setNotifCount(0)
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    } catch { /* silent */ }
  }

  async function markOneRead(id: string) {
    try {
      await supabase
        .from('notification')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id)
      setNotifCount(prev => Math.max(0, prev - 1))
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    } catch { /* silent */ }
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just nu'
    if (mins < 60) return `${mins} min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} tim`
    const days = Math.floor(hours / 24)
    return `${days} dag${days > 1 ? 'ar' : ''}`
  }

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
  const jobbPaths = ['/dashboard/projects', '/dashboard/quotes', '/dashboard/invoices', '/dashboard/documents']
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
        ? 'bg-white/10 text-white border border-white/20'
        : 'text-blue-200/70 hover:text-white hover:bg-white/5'
    }`
  }

  function subNavClass(active: boolean) {
    return `flex items-center gap-3 px-4 py-2 rounded-lg transition-all ${
      active
        ? 'text-cyan-300 bg-white/10'
        : 'text-blue-300/50 hover:text-white hover:bg-white/5'
    }`
  }

  const sidebarContent = (
    <>
      {/* Logo + Notification bell */}
      <div className="p-4 sm:p-6 border-b border-white/10">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">Handymate</span>
          </Link>
          <div className="relative" ref={notifRef}>
            <button
              onClick={openNotifications}
              className="relative p-2 rounded-lg text-blue-200/70 hover:text-white hover:bg-white/10 transition-all"
              aria-label="Notifikationer"
            >
              <Bell className="w-5 h-5" />
              {notifCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-full">
                  {notifCount > 99 ? '99+' : notifCount}
                </span>
              )}
            </button>

            {/* Notification dropdown */}
            {notifOpen && (
              <div className="absolute left-0 top-full mt-2 w-80 bg-[#0f2744] border border-white/10 rounded-xl shadow-2xl z-50 max-h-[70vh] flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <span className="text-sm font-semibold text-white">Notifikationer</span>
                  {notifCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      Markera alla som lästa
                    </button>
                  )}
                </div>
                <div className="overflow-y-auto flex-1">
                  {notifLoading ? (
                    <div className="p-6 text-center text-blue-300/50 text-sm">Laddar...</div>
                  ) : notifications.length === 0 ? (
                    <div className="p-6 text-center text-blue-300/50 text-sm">Inga notifikationer</div>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        className={`px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-all cursor-pointer ${
                          !n.is_read ? 'bg-white/[0.03]' : ''
                        }`}
                        onClick={() => {
                          if (!n.is_read) markOneRead(n.id)
                          if (n.link) {
                            setNotifOpen(false)
                            setIsMobileOpen(false)
                            window.location.href = n.link
                          }
                        }}
                      >
                        <div className="flex items-start gap-3">
                          {!n.is_read && (
                            <div className="w-2 h-2 rounded-full bg-cyan-400 mt-1.5 flex-shrink-0" />
                          )}
                          <div className={`flex-1 min-w-0 ${n.is_read ? 'ml-5' : ''}`}>
                            <p className={`text-sm truncate ${n.is_read ? 'text-blue-200/60' : 'text-white font-medium'}`}>
                              {n.title}
                            </p>
                            {n.message && (
                              <p className="text-xs text-blue-300/40 mt-0.5 truncate">{n.message}</p>
                            )}
                            <p className="text-[10px] text-blue-300/30 mt-1">{timeAgo(n.created_at)}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {/* Dashboard */}
        <Link href="/dashboard" className={navClass(pathname === '/dashboard')}>
          <div className="flex items-center gap-3">
            <LayoutGrid className={`w-5 h-5 ${pathname === '/dashboard' ? 'text-cyan-300' : ''}`} />
            <span className="text-sm sm:text-base">Dashboard</span>
          </div>
        </Link>

        {/* Samtal */}
        <Link href="/dashboard/calls" className={navClass(isActive('/dashboard/calls') || isActive('/dashboard/inbox') || isActive('/dashboard/assistant') || isActive('/dashboard/recordings'))}>
          <div className="flex items-center gap-3">
            <Phone className={`w-5 h-5 ${isActive('/dashboard/calls') || isActive('/dashboard/inbox') ? 'text-cyan-300' : ''}`} />
            <span className="text-sm sm:text-base">Samtal</span>
          </div>
          {pendingCount > 0 && (
            <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-full animate-pulse">
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </Link>

        {/* Schema */}
        <Link href="/dashboard/schedule" className={navClass(isActive('/dashboard/schedule') || isActive('/dashboard/calendar'))}>
          <div className="flex items-center gap-3">
            <Calendar className={`w-5 h-5 ${isActive('/dashboard/schedule') ? 'text-cyan-300' : ''}`} />
            <span className="text-sm sm:text-base">Schema</span>
          </div>
        </Link>

        {/* Kunder */}
        <Link href="/dashboard/customers" className={navClass(isActive('/dashboard/customers'))}>
          <div className="flex items-center gap-3">
            <Users className={`w-5 h-5 ${isActive('/dashboard/customers') ? 'text-cyan-300' : ''}`} />
            <span className="text-sm sm:text-base">Kunder</span>
          </div>
        </Link>

        {/* Pipeline */}
        <Link href="/dashboard/pipeline" className={navClass(isActive('/dashboard/pipeline'))}>
          <div className="flex items-center gap-3">
            <TrendingUp className={`w-5 h-5 ${isActive('/dashboard/pipeline') ? 'text-cyan-300' : ''}`} />
            <span className="text-sm sm:text-base">Pipeline</span>
          </div>
        </Link>

        {/* Jobb (dropdown) */}
        <div>
          <button
            onClick={() => setJobbOpen(!jobbOpen)}
            className={`w-full ${navClass(isJobbActive)}`}
          >
            <div className="flex items-center gap-3">
              <Briefcase className={`w-5 h-5 ${isJobbActive ? 'text-cyan-300' : ''}`} />
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
              <Link href="/dashboard/documents" className={subNavClass(isActive('/dashboard/documents'))}>
                <FileText className="w-4 h-4" />
                <span className="text-sm">Dokument</span>
              </Link>
            </div>
          )}
        </div>

        {/* Tid */}
        <Link href="/dashboard/time" className={navClass(isActive('/dashboard/time'))}>
          <div className="flex items-center gap-3">
            <Clock className={`w-5 h-5 ${isActive('/dashboard/time') ? 'text-cyan-300' : ''}`} />
            <span className="text-sm sm:text-base">Tid</span>
          </div>
        </Link>

        {/* Automationer */}
        <Link href="/dashboard/automations" className={navClass(isActive('/dashboard/automations') || isActive('/dashboard/communication'))}>
          <div className="flex items-center gap-3">
            <Zap className={`w-5 h-5 ${isActive('/dashboard/automations') || isActive('/dashboard/communication') ? 'text-cyan-300' : ''}`} />
            <span className="text-sm sm:text-base">Automationer</span>
          </div>
        </Link>

        {/* Inställningar */}
        <Link href="/dashboard/settings" className={navClass(isActive('/dashboard/settings') || isActive('/dashboard/team'))}>
          <div className="flex items-center gap-3">
            <Settings className={`w-5 h-5 ${isActive('/dashboard/settings') ? 'text-cyan-300' : ''}`} />
            <span className="text-sm sm:text-base">Inställningar</span>
          </div>
        </Link>

        {/* Hjälp */}
        <Link href="/dashboard/help" className={navClass(isActive('/dashboard/help'))}>
          <div className="flex items-center gap-3">
            <HelpCircle className={`w-5 h-5 ${isActive('/dashboard/help') ? 'text-cyan-300' : ''}`} />
            <span className="text-sm sm:text-base">Hjälp</span>
          </div>
        </Link>
      </nav>

      {/* User Menu */}
      <div className="p-4 border-t border-white/10">
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="w-full flex items-center gap-3 p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-all"
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: currentUser?.color || '#3b82f6' }}
            >
              <span className="text-white text-xs font-bold">
                {currentUser ? getInitials(currentUser.name) : businessName.substring(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm text-white truncate">{currentUser?.name || businessName}</p>
              <p className="text-xs text-blue-300/50 truncate">{currentUser?.email || ''}</p>
            </div>
            <ChevronDown className={`w-4 h-4 text-blue-300/50 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {userMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#0f2744] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
              <Link
                href="/dashboard/profile"
                className="flex items-center gap-2 px-4 py-3 text-sm text-blue-200 hover:bg-white/10 transition-all"
              >
                <User className="w-4 h-4" />
                Min profil
              </Link>
              <div className="border-t border-white/10" />
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-blue-300/50 hover:text-red-400 hover:bg-white/10 transition-all"
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
        className="fixed top-4 left-4 z-40 p-3 bg-white/90 backdrop-blur-xl border border-gray-200 rounded-xl text-gray-700 md:hidden min-w-[48px] min-h-[48px] flex items-center justify-center shadow-sm"
        aria-label="Öppna meny"
      >
        <Menu className="w-5 h-5" />
        {pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center text-xs font-bold bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-full">
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        )}
      </button>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar - Mobile */}
      <div
        className={`fixed left-0 top-0 h-screen w-72 bg-gradient-to-b from-[#1e3a5f] to-[#0f2744] border-r border-white/10 flex flex-col z-50 transition-transform duration-300 md:hidden ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          onClick={() => setIsMobileOpen(false)}
          className="absolute top-4 right-4 p-2 text-blue-200/70 hover:text-white rounded-lg min-w-[40px] min-h-[40px] flex items-center justify-center"
          aria-label="Stäng meny"
        >
          <X className="w-5 h-5" />
        </button>
        {sidebarContent}
      </div>

      {/* Sidebar - Desktop */}
      <div className="hidden md:flex fixed left-0 top-0 h-screen w-64 bg-gradient-to-b from-[#1e3a5f] to-[#0f2744] border-r border-white/10 flex-col">
        {sidebarContent}
      </div>
    </>
  )
}
