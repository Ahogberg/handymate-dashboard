'use client'

import { useState, useEffect } from 'react'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import { User, Mail, Phone, Save, Loader2, Calendar, Clock, Shield, CalendarDays, ExternalLink, XCircle } from 'lucide-react'

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '\u2014'
  return new Date(dateStr).toLocaleDateString('sv-SE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function getRoleBadge(role: string) {
  if (role === 'owner')
    return {
      label: '\u00c4gare',
      className:
        'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-500 border-blue-300',
    }
  if (role === 'admin')
    return {
      label: 'Admin',
      className: 'bg-blue-100 text-blue-400 border-blue-500/30',
    }
  return {
    label: 'Anst\u00e4lld',
    className: 'bg-gray-100 text-gray-500 border-gray-300',
  }
}

export default function ProfilePage() {
  const { user, loading, refetch } = useCurrentUser()

  const [form, setForm] = useState({ name: '', phone: '', avatar_url: '' })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{
    show: boolean
    message: string
    type: 'success' | 'error'
  }>({ show: false, message: '', type: 'success' })
  const [initialized, setInitialized] = useState(false)
  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; email: string | null; syncDirection: string; lastSyncAt: string | null } | null>(null)

  useEffect(() => {
    if (user && !initialized) {
      setForm({
        name: user.name || '',
        phone: user.phone || '',
        avatar_url: user.avatar_url || '',
      })
      setInitialized(true)
    }
  }, [user, initialized])

  useEffect(() => {
    fetch('/api/google/status').then(r => r.json()).then(d => setGoogleStatus(d)).catch(() => {})
  }, [])

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone || null,
          avatar_url: form.avatar_url || null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await refetch()
      showToast('Profil uppdaterad', 'success')
    } catch (err: any) {
      showToast(err.message || 'Kunde inte spara', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-500">Kunde inte ladda anv\u00e4ndare.</p>
      </div>
    )
  }

  const roleBadge = getRoleBadge(user.role)

  // These fields exist on the DB row but are not in the typed interface
  const userAny = user as any
  const acceptedAt: string | null = userAny.accepted_at ?? userAny.created_at ?? null
  const lastLoginAt: string | null = userAny.last_login_at ?? null

  return (
    <div className="relative p-4 sm:p-8 max-w-3xl mx-auto">
      {/* Background gradient blobs */}
      <div className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 bg-blue-50 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute -top-16 -right-32 w-80 h-80 bg-cyan-50 rounded-full blur-3xl" />

      {/* Header */}
      <div className="relative mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Min profil</h1>
        <p className="text-gray-500 mt-1">Hantera dina personuppgifter och kontoinformation</p>
      </div>

      {/* Profile card */}
      <div className="relative bg-white shadow-sm rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          {/* Avatar */}
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl font-bold text-gray-900"
            style={{ backgroundColor: user.color || '#7c3aed' }}
          >
            {getInitials(user.name)}
          </div>

          {/* Info */}
          <div className="text-center sm:text-left">
            <h2 className="text-xl font-semibold text-gray-900">{user.name}</h2>
            <p className="text-gray-500 flex items-center justify-center sm:justify-start gap-1.5 mt-1">
              <Mail className="w-4 h-4" />
              {user.email}
            </p>
            <div className="flex items-center justify-center sm:justify-start gap-2 mt-3">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${roleBadge.className}`}
              >
                <Shield className="w-3 h-3" />
                {roleBadge.label}
              </span>
              {user.title && (
                <span className="text-sm text-gray-500">{user.title}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit form card */}
      <div className="relative bg-white shadow-sm rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
          <User className="w-5 h-5 text-blue-600" />
          Redigera profil
        </h3>

        <div className="space-y-4">
          {/* Namn */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Namn
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none transition-colors"
              placeholder="Ditt namn"
            />
          </div>

          {/* Telefon */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Telefon
            </label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none transition-colors"
              placeholder="070-123 45 67"
            />
          </div>

          {/* Avatar URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Avatar URL
            </label>
            <input
              type="text"
              value={form.avatar_url}
              onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none transition-colors"
              placeholder="https://..."
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">
              E-post (kan inte \u00e4ndras)
            </label>
            <p className="px-4 py-2.5 text-gray-400 text-sm">{user.email}</p>
          </div>
        </div>

        {/* Save button */}
        <div className="mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Spara \u00e4ndringar
          </button>
        </div>
      </div>

      {/* Info card */}
      <div className="relative bg-white shadow-sm rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-600" />
          Kontoinformation
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Roll */}
          <div className="p-4 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Roll</p>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${roleBadge.className}`}
            >
              <Shield className="w-3 h-3" />
              {roleBadge.label}
            </span>
          </div>

          {/* Titel */}
          <div className="p-4 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Titel</p>
            <p className="text-gray-900 text-sm font-medium">
              {user.title || '\u2014'}
            </p>
          </div>

          {/* Timpris */}
          <div className="p-4 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Timpris</p>
            <p className="text-gray-900 text-sm font-medium">
              {user.hourly_rate ? `${user.hourly_rate} kr/h` : '\u2014'}
            </p>
          </div>

          {/* Medlem sedan */}
          <div className="p-4 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Medlem sedan
            </p>
            <p className="text-gray-900 text-sm font-medium">{formatDate(acceptedAt)}</p>
          </div>

          {/* Senast inloggad */}
          <div className="p-4 bg-gray-50 rounded-xl sm:col-span-2">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Senast inloggad
            </p>
            <p className="text-gray-900 text-sm font-medium">{formatDate(lastLoginAt)}</p>
          </div>
        </div>
      </div>

      {/* Connected Calendars */}
      <div className="relative bg-white shadow-sm rounded-xl border border-gray-200 p-6 mt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-blue-600" />
          Anslutna kalendrar
        </h3>

        <div className="space-y-3">
          {/* Google Calendar */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <CalendarDays className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Google Calendar</p>
                <p className="text-xs text-gray-400">
                  {googleStatus?.connected ? googleStatus.email : 'Ej ansluten'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {googleStatus?.connected ? (
                <span className="px-2 py-1 text-xs rounded-full bg-emerald-100 text-emerald-600 border border-emerald-200">
                  Ansluten
                </span>
              ) : (
                <a
                  href="/api/google/connect"
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-100 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/30"
                >
                  <ExternalLink className="w-3 h-3" /> Anslut
                </a>
              )}
            </div>
          </div>

          {/* Outlook placeholder */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl opacity-60">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-600/20">
                <CalendarDays className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Microsoft Outlook</p>
                <p className="text-xs text-gray-400">Kommer snart</p>
              </div>
            </div>
            <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-500 border border-gray-300">
              Kommande
            </span>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast.show && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              : 'bg-red-100 text-red-700 border border-red-200'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
