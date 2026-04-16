'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Phone,
  Calendar,
  Users,
  Briefcase,
  Settings,
  Zap,
  LogOut,
  ChevronDown,
  Menu,
  X,
  User,
  TrendingUp,
  Bell,
  Lock,
  Bot,
  ClipboardCheck,
  Gift,
  Mail,
  MessageSquare,
  Megaphone,
  CheckSquare,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import { useBusiness } from '@/lib/BusinessContext'
import { hasFeature, PlanType, getPlanLabel } from '@/lib/feature-gates'

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

// ── Navigation structure ──────────────────────────────────────────────
interface NavChild {
  label: string
  href: string
  exact?: boolean
  featureGate?: string
  dotKey?: string
}

type NavItem =
  | { type: 'link'; key: string; label: string; icon: any; href: string; exact?: boolean; paths?: string[]; hasBadge?: boolean; hasApprovalBadge?: boolean; featureGate?: string }
  | { type: 'group'; key: string; label: string; icon: any; children: NavChild[] }

const NAV: NavItem[] = [
  {
    type: 'group', key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard,
    children: [
      { label: 'Översikt', href: '/dashboard', exact: true },
      { label: 'Analys', href: '/dashboard/analytics', featureGate: 'lead_intelligence' },
    ],
  },
  { type: 'link', key: 'approvals', label: 'Godkännanden', icon: ClipboardCheck, href: '/dashboard/approvals', hasApprovalBadge: true },
  { type: 'link', key: 'customers', label: 'Kunder', icon: Users, href: '/dashboard/customers', paths: ['/dashboard/customers', '/dashboard/warranties', '/dashboard/customer-portal'] },
  { type: 'link', key: 'pipeline', label: 'Säljtratt', icon: TrendingUp, href: '/dashboard/pipeline' },
  { type: 'link', key: 'tasks', label: 'Uppgifter', icon: CheckSquare, href: '/dashboard/tasks' },
  { type: 'link', key: 'calendar', label: 'Kalender', icon: Calendar, href: '/dashboard/calendar' },
  { type: 'link', key: 'agent', label: 'Mitt team', icon: Bot, href: '/dashboard/agent' },
  { type: 'link', key: 'sms_inbox', label: 'SMS', icon: MessageSquare, href: '/dashboard/sms-inbox' },
  {
    type: 'group', key: 'jobs', label: 'Jobb', icon: Briefcase,
    children: [
      { label: 'Projekt', href: '/dashboard/projects' },
      { label: 'Offerter', href: '/dashboard/quotes' },
      { label: 'Fakturor', href: '/dashboard/invoices' },
      { label: 'Dokument', href: '/dashboard/documents' },
    ],
  },
  {
    type: 'group', key: 'planning', label: 'Planering', icon: Calendar,
    children: [
      { label: 'Schema', href: '/dashboard/schedule' },
      { label: 'Tidrapportering', href: '/dashboard/time' },
      { label: 'Fordon', href: '/dashboard/vehicles' },
      { label: 'Lager', href: '/dashboard/planning/inventory' },
    ],
  },
  {
    type: 'group', key: 'marketing', label: 'Kampanjer', icon: Megaphone,
    children: [
      { label: 'SMS-kampanjer', href: '/dashboard/campaigns' },
      { label: 'Utskick (Leads)', href: '/dashboard/marketing/leads', featureGate: 'leads_outbound' },
    ],
  },
]

// Bottom section: Inställningar + Bjud in kollega (rendered below separator)
const BOTTOM_NAV: NavItem[] = [
  { type: 'link', key: 'settings', label: 'Inställningar', icon: Settings, href: '/dashboard/settings', paths: ['/dashboard/settings', '/dashboard/billing', '/dashboard/automations'] },
  { type: 'link', key: 'referral', label: 'Bjud in en vän', icon: Gift, href: '/dashboard/referral' },
]

// ── Component ─────────────────────────────────────────────────────────
export default function Sidebar({ businessName, businessId, onLogout }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const business = useBusiness()
  const plan: PlanType = business.subscription_plan || 'starter'
  const [pendingCount, setPendingCount] = useState(0)
  const [approvalCount, setApprovalCount] = useState(0)
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifCount, setNotifCount] = useState(0)
  const [automationFailed, setAutomationFailed] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const { user: currentUser } = useCurrentUser()

  // ── Route helpers ──────────────────────────────────────────────────
  function isPathActive(href: string, exact?: boolean): boolean {
    // Handle query-param links like /dashboard/settings?tab=phone
    if (href.includes('?')) {
      const [path, query] = href.split('?')
      if (pathname !== path) return false
      const params = new URLSearchParams(query)
      let match = true
      params.forEach((v, k) => {
        if (searchParams?.get(k) !== v) match = false
      })
      return match
    }
    if (exact) return pathname === href && !searchParams?.get('tab')
    return pathname === href || pathname?.startsWith(href + '/') === true
  }

  function isLinkActive(item: Extract<NavItem, { type: 'link' }>): boolean {
    if (item.exact) return pathname === item.href
    if (item.paths) return item.paths.some(p => isPathActive(p))
    return isPathActive(item.href)
  }

  function isGroupActive(item: Extract<NavItem, { type: 'group' }>): boolean {
    return item.children.some(c => isPathActive(c.href, c.exact))
  }

  // ── Auto-expand only the active group (collapsed by default) ──────
  useEffect(() => {
    setIsMobileOpen(false)
    setUserMenuOpen(false)

    const allNav = [...NAV, ...BOTTOM_NAV]
    const activeKey = allNav.find(item => item.type === 'group' && isGroupActive(item))?.key
    setOpenGroups(activeKey ? new Set([activeKey]) : new Set())
  }, [pathname])

  // ── Accordion: only one group open at a time ──────────────────────
  function toggleGroup(key: string) {
    setOpenGroups(prev => prev.has(key) ? new Set<string>() : new Set<string>([key]))
  }

  // ── Close menus on click outside ───────────────────────────────────
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

  // ── Notifications ──────────────────────────────────────────────────
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

  // ── Prevent body scroll on mobile ──────────────────────────────────
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isMobileOpen])

  // ── Pending AI suggestion count + badge ────────────────────────────
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

  // ── Pending approvals count ─────────────────────────────────────────
  useEffect(() => {
    if (!businessId) return

    fetchApprovalCount()

    const channel = supabase
      .channel('approval_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pending_approvals',
          filter: `business_id=eq.${businessId}`
        },
        () => { fetchApprovalCount() }
      )
      .subscribe()

    const interval = setInterval(fetchApprovalCount, 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [businessId])

  async function fetchApprovalCount() {
    if (!businessId) return
    try {
      const { count } = await supabase
        .from('pending_approvals')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('status', 'pending')
      setApprovalCount(count || 0)
    } catch { /* silent */ }

    // Check for failed automation rules in last 24h
    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { count: failedCount } = await supabase
        .from('v3_automation_logs')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('status', 'failed')
        .gte('created_at', yesterday)
      setAutomationFailed((failedCount || 0) > 0)
    } catch { /* table may not exist yet */ }
  }

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

  // ── Style helpers ──────────────────────────────────────────────────
  function navClass(active: boolean) {
    return `flex items-center justify-between px-4 py-2.5 rounded-xl transition-all relative ${
      active
        ? 'bg-white/[0.12] text-white shadow-sm shadow-black/10'
        : 'text-primary-200/70 hover:text-white hover:bg-white/5'
    }`
  }

  function subNavClass(active: boolean) {
    return `block px-4 py-2 rounded-lg text-sm transition-all ${
      active
        ? 'text-white bg-white/[0.08] font-medium'
        : 'text-primary-300/50 hover:text-white hover:bg-white/5'
    }`
  }

  // ── Render a single nav item (shared helper) ──────────────────────
  function renderNavItem(item: NavItem) {
    if (item.type === 'link') {
      const active = isLinkActive(item)
      const Icon = item.icon
      const locked = item.featureGate ? !hasFeature(plan, item.featureGate) : false
      return (
        <Link key={item.key} href={item.href} className={`${navClass(active)} ${active ? 'nav-active-indicator' : ''} ${locked ? 'opacity-50' : ''}`} title={locked ? `Ingår i ${getPlanLabel(plan === 'starter' ? 'professional' : 'business')}` : undefined}>
          <div className="flex items-center gap-3">
            <Icon className={`w-5 h-5 ${active ? 'text-primary-300' : ''}`} />
            <span className="text-sm">{item.label}</span>
          </div>
          {locked ? (
            <Lock className="w-3.5 h-3.5 text-primary-300/40" />
          ) : item.hasBadge && pendingCount > 0 ? (
            <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold bg-primary-700 text-white rounded-full animate-pulse">
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          ) : item.hasApprovalBadge && approvalCount > 0 ? (
            <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold bg-red-500 text-white rounded-full animate-pulse">
              {approvalCount > 99 ? '99+' : approvalCount}
            </span>
          ) : null}
        </Link>
      )
    }

    // Group item
    const groupActive = isGroupActive(item)
    const isOpen = openGroups.has(item.key)
    const Icon = item.icon

    return (
      <div key={item.key}>
        <button
          onClick={() => {
            // Dashboard: navigera + alltid öppna (stäng aldrig)
            if (item.key === 'dashboard' && item.children?.[0]?.href) {
              router.push(item.children[0].href)
              setOpenGroups(new Set([item.key]))
            } else {
              toggleGroup(item.key)
            }
          }}
          className={`w-full ${navClass(groupActive)} ${groupActive ? 'nav-active-indicator' : ''}`}
        >
          <div className="flex items-center gap-3">
            <Icon className={`w-5 h-5 ${groupActive ? 'text-primary-300' : ''}`} />
            <span className="text-sm">{item.label}</span>
          </div>
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && (
          <div className="ml-8 mt-0.5 mb-1 space-y-0.5">
            {item.children.map(child => {
              const childActive = isPathActive(child.href, child.exact)
              const childLocked = child.featureGate ? !hasFeature(plan, child.featureGate) : false
              return (
                <Link key={child.href} href={child.href} className={`${subNavClass(childActive)} ${childLocked ? 'opacity-50' : ''}`} title={childLocked ? `Ingår i ${getPlanLabel(plan === 'starter' ? 'professional' : 'business')}` : undefined}>
                  <span className="flex items-center gap-2">
                    {child.label}
                    {childLocked && <Lock className="w-3 h-3 text-primary-300/40" />}
                    {child.dotKey === 'automation_failed' && automationFailed && (
                      <span className="w-2 h-2 rounded-full bg-red-500 inline-block" title="Misslyckad automation" />
                    )}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Role-based filtering ──────────────────────────────────────────
  const isEmployee = currentUser?.role === 'employee'
  const HIDDEN_FOR_EMPLOYEE = new Set(['approvals', 'agent', 'settings', 'leads-outbound'])
  const HIDDEN_CHILDREN_FOR_EMPLOYEE = new Set(['/dashboard/invoices', '/dashboard/settings', '/dashboard/settings/my-prices', '/dashboard/settings/pricelist', '/dashboard/billing', '/dashboard/settings?tab=team', '/dashboard/automations', '/dashboard/settings/quote-templates', '/dashboard/settings/quote-texts', '/dashboard/orders', '/dashboard/campaigns', '/dashboard/website', '/dashboard/analytics'])

  function filterNavForRole(items: NavItem[]): NavItem[] {
    if (!isEmployee) return items
    return items
      .filter(item => !HIDDEN_FOR_EMPLOYEE.has(item.key))
      .map(item => {
        if (item.type === 'group') {
          const filtered = item.children.filter(c => !HIDDEN_CHILDREN_FOR_EMPLOYEE.has(c.href))
          if (filtered.length === 0) return null
          return { ...item, children: filtered }
        }
        return item
      })
      .filter(Boolean) as NavItem[]
  }

  // ── Sidebar content (shared by mobile + desktop) ───────────────────
  const sidebarContent = (
    <>
      {/* Logo + Notification bell */}
      <div className="p-4 sm:p-6 border-b border-white/10">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden">
              <img src="/logo.png" alt="Handymate" className="w-8 h-8 object-contain" />
            </div>
            <span className="text-lg font-bold text-white truncate max-w-[120px]">{businessName || 'Handymate'}</span>
          </Link>
          <div className="relative" ref={notifRef}>
            <button
              onClick={openNotifications}
              className="relative p-2 rounded-lg text-primary-200/70 hover:text-white hover:bg-white/10 transition-all"
              aria-label="Notifikationer"
            >
              <Bell className="w-5 h-5" />
              {notifCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full">
                  {notifCount > 99 ? '99+' : notifCount}
                </span>
              )}
            </button>

            {/* Notification dropdown */}
            {notifOpen && (
              <div className="absolute left-0 top-full mt-2 w-80 bg-sidebar-dark border border-white/10 rounded-xl shadow-2xl z-50 max-h-[70vh] flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <span className="text-sm font-semibold text-white">Notifikationer</span>
                  {notifCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
                    >
                      Markera alla som lästa
                    </button>
                  )}
                </div>
                <div className="overflow-y-auto flex-1">
                  {notifLoading ? (
                    <div className="p-6 text-center text-primary-300/50 text-sm">Laddar...</div>
                  ) : notifications.length === 0 ? (
                    <div className="p-6 text-center text-primary-300/50 text-sm">Inga notifikationer</div>
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
                            <div className="w-2 h-2 rounded-full bg-primary-400 mt-1.5 flex-shrink-0" />
                          )}
                          <div className={`flex-1 min-w-0 ${n.is_read ? 'ml-5' : ''}`}>
                            <p className={`text-sm truncate ${n.is_read ? 'text-primary-200/60' : 'text-white font-medium'}`}>
                              {n.title}
                            </p>
                            {n.message && (
                              <p className="text-xs text-primary-300/40 mt-0.5 truncate">{n.message}</p>
                            )}
                            <p className="text-[10px] text-primary-300/30 mt-1">{timeAgo(n.created_at)}</p>
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

      {/* Main navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {filterNavForRole(NAV).map(item => renderNavItem(item))}
      </nav>

      {/* Bottom section: Inställningar + Bjud in kollega */}
      <div className="p-3 pt-0 space-y-0.5 border-t border-white/10">
        {filterNavForRole(BOTTOM_NAV).map(item => renderNavItem(item))}
      </div>

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
              <p className="text-xs text-primary-300/50 truncate">{currentUser?.email || ''}</p>
            </div>
            <ChevronDown className={`w-4 h-4 text-primary-300/50 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {userMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-sidebar-dark border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
              <Link
                href="/dashboard/profile"
                className="flex items-center gap-2 px-4 py-3 text-sm text-primary-200 hover:bg-white/10 transition-all"
              >
                <User className="w-4 h-4" />
                Min profil
              </Link>
              <div className="border-t border-white/10" />
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-primary-300/50 hover:text-red-400 hover:bg-white/10 transition-all"
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
          <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center text-xs font-bold bg-primary-700 text-white rounded-full">
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
        className={`fixed left-0 top-0 h-screen w-72 bg-sidebar border-r border-white/10 flex flex-col z-50 transition-transform duration-300 md:hidden ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          onClick={() => setIsMobileOpen(false)}
          className="absolute top-4 right-4 p-2 text-primary-200/70 hover:text-white rounded-lg min-w-[40px] min-h-[40px] flex items-center justify-center"
          aria-label="Stäng meny"
        >
          <X className="w-5 h-5" />
        </button>
        {sidebarContent}
      </div>

      {/* Sidebar - Desktop */}
      <div className="hidden md:flex fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-white/10 flex-col z-50">
        {sidebarContent}
      </div>
    </>
  )
}
