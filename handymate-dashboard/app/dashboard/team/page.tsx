'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Users,
  Plus,
  Search,
  X,
  Loader2,
  Mail,
  Phone,
  Shield,
  ChevronDown,
  ChevronUp,
  Clock,
  UserPlus,
  Send,
  AlertTriangle
} from 'lucide-react'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import { useBusiness } from '@/lib/BusinessContext'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeamMember {
  id: string
  business_id: string
  user_id: string | null
  role: 'owner' | 'admin' | 'employee'
  name: string
  email: string
  phone: string | null
  title: string | null
  hourly_cost: number | null
  hourly_rate: number | null
  color: string
  avatar_url: string | null
  is_active: boolean
  can_see_all_projects: boolean
  can_see_financials: boolean
  can_manage_users: boolean
  can_approve_time: boolean
  can_create_invoices: boolean
  invite_token: string | null
  invite_expires_at: string | null
  invited_at: string | null
  accepted_at: string | null
  last_login_at: string | null
  created_at: string
}

type Filter = 'all' | 'active' | 'invited' | 'inactive'

interface InviteForm {
  email: string
  name: string
  role: 'admin' | 'employee'
  title: string
  phone: string
  hourly_rate: string
  can_see_all_projects: boolean
  can_see_financials: boolean
  can_manage_users: boolean
  can_approve_time: boolean
  can_create_invoices: boolean
}

const DEFAULT_INVITE_FORM: InviteForm = {
  email: '',
  name: '',
  role: 'employee',
  title: '',
  phone: '',
  hourly_rate: '',
  can_see_all_projects: false,
  can_see_financials: false,
  can_manage_users: false,
  can_approve_time: false,
  can_create_invoices: false,
}

const ADMIN_PERMISSIONS: Pick<InviteForm, 'can_see_all_projects' | 'can_see_financials' | 'can_manage_users' | 'can_approve_time' | 'can_create_invoices'> = {
  can_see_all_projects: true,
  can_see_financials: true,
  can_manage_users: true,
  can_approve_time: true,
  can_create_invoices: true,
}

const EMPLOYEE_PERMISSIONS: Pick<InviteForm, 'can_see_all_projects' | 'can_see_financials' | 'can_manage_users' | 'can_approve_time' | 'can_create_invoices'> = {
  can_see_all_projects: false,
  can_see_financials: false,
  can_manage_users: false,
  can_approve_time: false,
  can_create_invoices: false,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

function getStatusInfo(member: TeamMember): { label: string; className: string } {
  if (!member.is_active) return { label: 'Inaktiv', className: 'bg-red-500/20 text-red-400 border-red-500/30' }
  if (member.invite_token && !member.accepted_at) return { label: 'Inbjuden', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' }
  return { label: 'Aktiv', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' }
}

function getRoleBadge(role: string): { label: string; className: string } {
  if (role === 'owner') return { label: 'Agare', className: 'bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-violet-300 border-violet-500/30' }
  if (role === 'admin') return { label: 'Admin', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' }
  return { label: 'Anstalld', className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' }
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just nu'
  if (diffMins < 60) return `${diffMins} min sedan`
  if (diffHours < 24) return `${diffHours} tim sedan`
  if (diffDays < 7) return `${diffDays} dagar sedan`
  return date.toLocaleDateString('sv-SE')
}

// ---------------------------------------------------------------------------
// Toggle switch component
// ---------------------------------------------------------------------------

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (val: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:ring-offset-2 focus:ring-offset-zinc-900 ${
        checked ? 'bg-violet-500' : 'bg-zinc-700'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function TeamPage() {
  const { can, user: currentUser } = useCurrentUser()
  const business = useBusiness()

  // Data state
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)

  // UI state
  const [filter, setFilter] = useState<Filter>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [showPermissions, setShowPermissions] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  // Invite form
  const [inviteForm, setInviteForm] = useState<InviteForm>({ ...DEFAULT_INVITE_FORM })

  // Edit form
  const [editForm, setEditForm] = useState<InviteForm>({ ...DEFAULT_INVITE_FORM })

  // Toast
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }, [])

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/team')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setMembers(data.members || [])
    } catch {
      showToast('Kunde inte ladda teammedlemmar', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    if (business.business_id) {
      fetchMembers()
    }
  }, [business.business_id, fetchMembers])

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  const filteredMembers = useMemo(() => {
    let result = members
    if (filter === 'active') result = result.filter(m => m.is_active && m.accepted_at)
    else if (filter === 'invited') result = result.filter(m => m.invite_token && !m.accepted_at)
    else if (filter === 'inactive') result = result.filter(m => !m.is_active)
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      result = result.filter(m => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
    }
    return result
  }, [members, filter, searchTerm])

  // Filter counts
  const counts = useMemo(() => ({
    all: members.length,
    active: members.filter(m => m.is_active && m.accepted_at).length,
    invited: members.filter(m => m.invite_token && !m.accepted_at).length,
    inactive: members.filter(m => !m.is_active).length,
  }), [members])

  // ---------------------------------------------------------------------------
  // Invite handlers
  // ---------------------------------------------------------------------------

  const openInviteModal = () => {
    setInviteForm({ ...DEFAULT_INVITE_FORM })
    setShowPermissions(false)
    setInviteModalOpen(true)
  }

  const handleInviteRoleChange = (role: 'admin' | 'employee') => {
    const perms = role === 'admin' ? ADMIN_PERMISSIONS : EMPLOYEE_PERMISSIONS
    setInviteForm(prev => ({ ...prev, role, ...perms }))
  }

  const handleInviteSubmit = async () => {
    if (!inviteForm.email || !inviteForm.name) {
      showToast('E-post och namn krävs', 'error')
      return
    }

    setActionLoading(true)
    try {
      const body = {
        email: inviteForm.email,
        name: inviteForm.name,
        role: inviteForm.role,
        title: inviteForm.title || null,
        phone: inviteForm.phone || null,
        hourly_rate: inviteForm.hourly_rate ? parseFloat(inviteForm.hourly_rate) : null,
        can_see_all_projects: inviteForm.can_see_all_projects,
        can_see_financials: inviteForm.can_see_financials,
        can_manage_users: inviteForm.can_manage_users,
        can_approve_time: inviteForm.can_approve_time,
        can_create_invoices: inviteForm.can_create_invoices,
      }

      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Kunde inte skicka inbjudan')
      }

      showToast('Inbjudan skickad!', 'success')
      setInviteModalOpen(false)
      fetchMembers()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Något gick fel'
      showToast(message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Edit handlers
  // ---------------------------------------------------------------------------

  const openEditModal = (member: TeamMember) => {
    if (!can('manage_users') && currentUser?.id !== member.id) return
    setEditingMember(member)
    setEditForm({
      email: member.email,
      name: member.name,
      role: member.role === 'owner' ? 'admin' : member.role,
      title: member.title || '',
      phone: member.phone || '',
      hourly_rate: member.hourly_rate?.toString() || '',
      can_see_all_projects: member.can_see_all_projects,
      can_see_financials: member.can_see_financials,
      can_manage_users: member.can_manage_users,
      can_approve_time: member.can_approve_time,
      can_create_invoices: member.can_create_invoices,
    })
    setShowPermissions(false)
    setConfirmDeactivate(false)
    setEditModalOpen(true)
  }

  const handleEditRoleChange = (role: 'admin' | 'employee') => {
    const perms = role === 'admin' ? ADMIN_PERMISSIONS : EMPLOYEE_PERMISSIONS
    setEditForm(prev => ({ ...prev, role, ...perms }))
  }

  const handleEditSubmit = async () => {
    if (!editingMember) return

    setActionLoading(true)
    try {
      const body = {
        id: editingMember.id,
        name: editForm.name,
        role: editingMember.role === 'owner' ? 'owner' : editForm.role,
        title: editForm.title || null,
        phone: editForm.phone || null,
        hourly_rate: editForm.hourly_rate ? parseFloat(editForm.hourly_rate) : null,
        can_see_all_projects: editForm.can_see_all_projects,
        can_see_financials: editForm.can_see_financials,
        can_manage_users: editForm.can_manage_users,
        can_approve_time: editForm.can_approve_time,
        can_create_invoices: editForm.can_create_invoices,
      }

      const res = await fetch('/api/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error('Kunde inte spara')

      showToast('Ändringar sparade!', 'success')
      setEditModalOpen(false)
      fetchMembers()
    } catch {
      showToast('Kunde inte spara ändringar', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleResendInvite = async () => {
    if (!editingMember) return

    setActionLoading(true)
    try {
      const res = await fetch(`/api/team/${editingMember.id}/resend-invite`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Kunde inte skicka ny inbjudan')

      showToast('Ny inbjudan skickad!', 'success')
    } catch {
      showToast('Kunde inte skicka ny inbjudan', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeactivate = async () => {
    if (!editingMember) return

    if (!confirmDeactivate) {
      setConfirmDeactivate(true)
      return
    }

    setActionLoading(true)
    try {
      const res = await fetch(`/api/team?id=${editingMember.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Kunde inte inaktivera')

      showToast('Användare inaktiverad', 'success')
      setEditModalOpen(false)
      fetchMembers()
    } catch {
      showToast('Kunde inte inaktivera användare', 'error')
    } finally {
      setActionLoading(false)
      setConfirmDeactivate(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Filter tab config
  // ---------------------------------------------------------------------------

  const filterTabs: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'Alla', count: counts.all },
    { key: 'active', label: 'Aktiva', count: counts.active },
    { key: 'invited', label: 'Inbjudna', count: counts.invited },
    { key: 'inactive', label: 'Inaktiva', count: counts.inactive },
  ]

  // ---------------------------------------------------------------------------
  // Permission labels
  // ---------------------------------------------------------------------------

  const permissionLabels: { key: keyof Pick<InviteForm, 'can_see_all_projects' | 'can_see_financials' | 'can_manage_users' | 'can_approve_time' | 'can_create_invoices'>; label: string }[] = [
    { key: 'can_see_all_projects', label: 'Kan se alla projekt' },
    { key: 'can_see_financials', label: 'Kan se ekonomi' },
    { key: 'can_manage_users', label: 'Kan hantera användare' },
    { key: 'can_approve_time', label: 'Kan godkänna tid' },
    { key: 'can_create_invoices', label: 'Kan skapa fakturor' },
  ]

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <div className="text-zinc-400 flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Laddar...
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Check if only owner (empty state)
  // ---------------------------------------------------------------------------

  const showEmptyState = members.length <= 1 && members.every(m => m.role === 'owner')

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen pt-16 sm:pt-8">
      {/* Background gradient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]"></div>
      </div>

      {/* Toast notification */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-red-500/20 border-red-500/30 text-red-400'
        }`}>
          {toast.message}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Invite Modal                                                      */}
      {/* ----------------------------------------------------------------- */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-violet-400" />
                Bjud in teammedlem
              </h3>
              <button onClick={() => setInviteModalOpen(false)} className="text-zinc-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">E-post *</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={e => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="namn@foretag.se"
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Namn *</label>
                <input
                  type="text"
                  value={inviteForm.name}
                  onChange={e => setInviteForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Förnamn Efternamn"
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Roll</label>
                <select
                  value={inviteForm.role}
                  onChange={e => handleInviteRoleChange(e.target.value as 'admin' | 'employee')}
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
                >
                  <option value="admin">Admin</option>
                  <option value="employee">Anstalld</option>
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Titel</label>
                <input
                  type="text"
                  value={inviteForm.title}
                  onChange={e => setInviteForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="T.ex. Elektriker, Snickare"
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Telefon</label>
                <input
                  type="tel"
                  value={inviteForm.phone}
                  onChange={e => setInviteForm(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+46..."
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
                />
              </div>

              {/* Hourly rate */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Timpris (kr/h)</label>
                <input
                  type="number"
                  value={inviteForm.hourly_rate}
                  onChange={e => setInviteForm(prev => ({ ...prev, hourly_rate: e.target.value }))}
                  placeholder="0"
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
                />
              </div>

              {/* Permissions toggle section */}
              <div className="border border-zinc-800 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowPermissions(!showPermissions)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Behörigheter
                  </span>
                  {showPermissions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showPermissions && (
                  <div className="px-4 pb-4 space-y-3">
                    {permissionLabels.map(perm => (
                      <div key={perm.key} className="flex items-center justify-between">
                        <span className="text-sm text-zinc-300">{perm.label}</span>
                        <Toggle
                          checked={inviteForm[perm.key]}
                          onChange={val => setInviteForm(prev => ({ ...prev, [perm.key]: val }))}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit button */}
              <button
                onClick={handleInviteSubmit}
                disabled={actionLoading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Skicka inbjudan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Edit Modal                                                        */}
      {/* ----------------------------------------------------------------- */}
      {editModalOpen && editingMember && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Redigera teammedlem</h3>
              <button onClick={() => setEditModalOpen(false)} className="text-zinc-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Member avatar and name header */}
            <div className="flex items-center gap-3 mb-6 p-3 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                style={{ backgroundColor: editingMember.color }}
              >
                {getInitials(editingMember.name)}
              </div>
              <div className="min-w-0">
                <p className="text-white font-medium truncate">{editingMember.name}</p>
                <p className="text-zinc-500 text-sm truncate">{editingMember.email}</p>
              </div>
              <div className="ml-auto">
                <span className={`text-xs px-2 py-1 rounded-full border ${getStatusInfo(editingMember).className}`}>
                  {getStatusInfo(editingMember).label}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {/* Email (read-only) */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">E-post</label>
                <input
                  type="email"
                  value={editForm.email}
                  disabled
                  className="w-full px-4 py-2.5 bg-zinc-800/50 border border-zinc-700/50 rounded-xl text-zinc-500 cursor-not-allowed"
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Namn</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Roll</label>
                <select
                  value={editingMember.role === 'owner' ? 'owner' : editForm.role}
                  onChange={e => handleEditRoleChange(e.target.value as 'admin' | 'employee')}
                  disabled={editingMember.role === 'owner'}
                  className={`w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 ${
                    editingMember.role === 'owner' ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {editingMember.role === 'owner' && <option value="owner">Agare</option>}
                  <option value="admin">Admin</option>
                  <option value="employee">Anstalld</option>
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Titel</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={e => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="T.ex. Elektriker, Snickare"
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Telefon</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+46..."
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
                />
              </div>

              {/* Hourly rate */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Timpris (kr/h)</label>
                <input
                  type="number"
                  value={editForm.hourly_rate}
                  onChange={e => setEditForm(prev => ({ ...prev, hourly_rate: e.target.value }))}
                  placeholder="0"
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
                />
              </div>

              {/* Permissions toggle section */}
              {editingMember.role !== 'owner' && (
                <div className="border border-zinc-800 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowPermissions(!showPermissions)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-zinc-400 hover:text-white transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Behörigheter
                    </span>
                    {showPermissions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showPermissions && (
                    <div className="px-4 pb-4 space-y-3">
                      {permissionLabels.map(perm => (
                        <div key={perm.key} className="flex items-center justify-between">
                          <span className="text-sm text-zinc-300">{perm.label}</span>
                          <Toggle
                            checked={editForm[perm.key]}
                            onChange={val => setEditForm(prev => ({ ...prev, [perm.key]: val }))}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Save button */}
              <button
                onClick={handleEditSubmit}
                disabled={actionLoading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Spara ändringar
              </button>

              {/* Resend invite button (if invited but not accepted) */}
              {editingMember.invite_token && !editingMember.accepted_at && (
                <button
                  onClick={handleResendInvite}
                  disabled={actionLoading}
                  className="w-full py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-medium hover:bg-zinc-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Skicka ny inbjudan
                </button>
              )}

              {/* Deactivate button (not for owner, not for self) */}
              {editingMember.role !== 'owner' && currentUser?.id !== editingMember.id && (
                <div className="pt-2 border-t border-zinc-800">
                  {confirmDeactivate ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-amber-400 text-sm">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Är du säker? Användaren förlorar åtkomst.</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleDeactivate}
                          disabled={actionLoading}
                          className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                          Ja, inaktivera
                        </button>
                        <button
                          onClick={() => setConfirmDeactivate(false)}
                          className="flex-1 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 font-medium hover:text-white transition-colors"
                        >
                          Avbryt
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeactivate(true)}
                      className="w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors"
                    >
                      Inaktivera användare
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Page content                                                      */}
      {/* ----------------------------------------------------------------- */}
      <div className="relative z-10 max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Team</h1>
            <p className="text-zinc-400 text-sm mt-1">
              {members.length} {members.length === 1 ? 'medlem' : 'medlemmar'}
            </p>
          </div>
          {can('manage_users') && (
            <button
              onClick={openInviteModal}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-medium hover:opacity-90 transition-opacity text-sm"
            >
              <Plus className="w-4 h-4" />
              Bjud in
            </button>
          )}
        </div>

        {/* Empty state */}
        {showEmptyState ? (
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-12 sm:p-16 text-center">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center border border-violet-500/30">
                <Users className="w-10 h-10 text-violet-400" />
              </div>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Du arbetar ensam just nu</h2>
            <p className="text-zinc-400 mb-8 max-w-sm mx-auto">
              Bjud in ditt team för att komma igång med samarbete, tidrapportering och projekthantering.
            </p>
            {can('manage_users') && (
              <button
                onClick={openInviteModal}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-medium hover:opacity-90 transition-opacity"
              >
                <UserPlus className="w-5 h-5" />
                Bjud in teammedlem
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Filter tabs */}
            <div className="flex flex-wrap gap-2">
              {filterTabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    filter === tab.key
                      ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                      : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                  }`}
                >
                  {tab.label}
                  <span className={`ml-1.5 ${filter === tab.key ? 'text-white/70' : 'text-zinc-600'}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Sök på namn eller e-post..."
                className="w-full pl-11 pr-4 py-3 bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Members list */}
            {filteredMembers.length === 0 ? (
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-12 text-center">
                <p className="text-zinc-400">Inga teammedlemmar matchar din sökning.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredMembers.map(member => {
                  const status = getStatusInfo(member)
                  const roleBadge = getRoleBadge(member.role)
                  const canClick = can('manage_users') || currentUser?.id === member.id

                  return (
                    <div
                      key={member.id}
                      onClick={() => canClick && openEditModal(member)}
                      className={`bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4 sm:p-5 transition-colors ${
                        canClick ? 'cursor-pointer hover:border-zinc-700 hover:bg-zinc-900/80' : ''
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        {/* Avatar */}
                        <div
                          className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                          style={{ backgroundColor: member.color }}
                        >
                          {getInitials(member.name)}
                        </div>

                        {/* Name, title, role */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-medium truncate">{member.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${roleBadge.className}`}>
                              {roleBadge.label}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${status.className}`}>
                              {status.label}
                            </span>
                          </div>
                          {member.title && (
                            <p className="text-zinc-500 text-sm mt-0.5 truncate">{member.title}</p>
                          )}
                        </div>

                        {/* Contact + last activity (desktop) */}
                        <div className="hidden md:flex items-center gap-6 shrink-0">
                          <div className="flex items-center gap-4 text-sm text-zinc-400">
                            <span className="flex items-center gap-1.5 truncate max-w-[200px]">
                              <Mail className="w-3.5 h-3.5 shrink-0" />
                              {member.email}
                            </span>
                            {member.phone && (
                              <span className="flex items-center gap-1.5">
                                <Phone className="w-3.5 h-3.5 shrink-0" />
                                {member.phone}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-zinc-500 whitespace-nowrap">
                            <Clock className="w-3.5 h-3.5" />
                            {formatRelativeDate(member.last_login_at || member.accepted_at)}
                          </div>
                        </div>
                      </div>

                      {/* Mobile secondary info */}
                      <div className="mt-3 flex items-center gap-4 text-xs text-zinc-500 md:hidden">
                        <span className="flex items-center gap-1 truncate">
                          <Mail className="w-3 h-3 shrink-0" />
                          {member.email}
                        </span>
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <Clock className="w-3 h-3" />
                          {formatRelativeDate(member.last_login_at || member.accepted_at)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
