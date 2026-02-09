'use client'

import { useState, useEffect } from 'react'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import { User, Mail, Phone, Save, Loader2, Calendar, Clock, Shield } from 'lucide-react'

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
        'bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-violet-300 border-violet-500/30',
    }
  if (role === 'admin')
    return {
      label: 'Admin',
      className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    }
  return {
    label: 'Anst\u00e4lld',
    className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
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
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-zinc-400">Kunde inte ladda anv\u00e4ndare.</p>
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
      <div className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute -top-16 -right-32 w-80 h-80 bg-fuchsia-500/10 rounded-full blur-3xl" />

      {/* Header */}
      <div className="relative mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Min profil</h1>
        <p className="text-zinc-400 mt-1">Hantera dina personuppgifter och kontoinformation</p>
      </div>

      {/* Profile card */}
      <div className="relative bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          {/* Avatar */}
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl font-bold text-white"
            style={{ backgroundColor: user.color || '#7c3aed' }}
          >
            {getInitials(user.name)}
          </div>

          {/* Info */}
          <div className="text-center sm:text-left">
            <h2 className="text-xl font-semibold text-white">{user.name}</h2>
            <p className="text-zinc-400 flex items-center justify-center sm:justify-start gap-1.5 mt-1">
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
                <span className="text-sm text-zinc-400">{user.title}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit form card */}
      <div className="relative bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-5 flex items-center gap-2">
          <User className="w-5 h-5 text-violet-400" />
          Redigera profil
        </h3>

        <div className="space-y-4">
          {/* Namn */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Namn
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 outline-none transition-colors"
              placeholder="Ditt namn"
            />
          </div>

          {/* Telefon */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Telefon
            </label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 outline-none transition-colors"
              placeholder="070-123 45 67"
            />
          </div>

          {/* Avatar URL */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Avatar URL
            </label>
            <input
              type="text"
              value={form.avatar_url}
              onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
              className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 outline-none transition-colors"
              placeholder="https://..."
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <label className="block text-sm font-medium text-zinc-500 mb-1.5">
              E-post (kan inte \u00e4ndras)
            </label>
            <p className="px-4 py-2.5 text-zinc-500 text-sm">{user.email}</p>
          </div>
        </div>

        {/* Save button */}
        <div className="mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
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
      <div className="relative bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-5 flex items-center gap-2">
          <Shield className="w-5 h-5 text-violet-400" />
          Kontoinformation
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Roll */}
          <div className="p-4 bg-zinc-800/50 rounded-xl">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Roll</p>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${roleBadge.className}`}
            >
              <Shield className="w-3 h-3" />
              {roleBadge.label}
            </span>
          </div>

          {/* Titel */}
          <div className="p-4 bg-zinc-800/50 rounded-xl">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Titel</p>
            <p className="text-white text-sm font-medium">
              {user.title || '\u2014'}
            </p>
          </div>

          {/* Timpris */}
          <div className="p-4 bg-zinc-800/50 rounded-xl">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Timpris</p>
            <p className="text-white text-sm font-medium">
              {user.hourly_rate ? `${user.hourly_rate} kr/h` : '\u2014'}
            </p>
          </div>

          {/* Medlem sedan */}
          <div className="p-4 bg-zinc-800/50 rounded-xl">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Medlem sedan
            </p>
            <p className="text-white text-sm font-medium">{formatDate(acceptedAt)}</p>
          </div>

          {/* Senast inloggad */}
          <div className="p-4 bg-zinc-800/50 rounded-xl sm:col-span-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Senast inloggad
            </p>
            <p className="text-white text-sm font-medium">{formatDate(lastLoginAt)}</p>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast.show && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'bg-red-500/20 text-red-300 border border-red-500/30'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
