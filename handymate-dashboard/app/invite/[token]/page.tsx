'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, CheckCircle, AlertTriangle, Zap, Eye, EyeOff, Lock, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface InviteData {
  valid: boolean
  email: string
  name: string
  role: string
  title: string
  business_name: string
  error?: string
}

const roleLabels: Record<string, string> = {
  owner: '\u00c4gare',
  admin: 'Admin',
  technician: 'Tekniker',
  office: 'Kontor',
}

export default function InviteAcceptPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [invite, setInvite] = useState<InviteData | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', password: '', confirmPassword: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    async function validateInvite() {
      try {
        const res = await fetch(`/api/invite/${token}`)
        const data = await res.json()

        if (!res.ok || !data.valid) {
          setInvite({ ...data, valid: false })
        } else {
          setInvite(data)
          setForm((prev) => ({ ...prev, name: data.name || '' }))
        }
      } catch {
        setInvite({
          valid: false,
          email: '',
          name: '',
          role: '',
          title: '',
          business_name: '',
          error: 'Kunde inte validera inbjudan',
        })
      } finally {
        setLoading(false)
      }
    }

    validateInvite()
  }, [token])

  async function handleAccept(e: FormEvent) {
    e.preventDefault()

    if (form.password.length < 6) {
      setError('L\u00f6senord m\u00e5ste vara minst 6 tecken')
      return
    }

    if (form.password !== form.confirmPassword) {
      setError('L\u00f6senorden matchar inte')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const res = await fetch(`/api/invite/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: form.password, name: form.name }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'N\u00e5got gick fel')
        setSubmitting(false)
        return
      }

      if (data.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        })
      }

      setSuccess(true)
      setTimeout(() => router.push('/dashboard'), 1500)
    } catch {
      setError('N\u00e5got gick fel. F\u00f6rs\u00f6k igen.')
      setSubmitting(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    )
  }

  // Error state (invalid/expired token)
  if (!invite?.valid) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center relative overflow-hidden">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-50 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-fuchsia-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative w-full max-w-md mx-4">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/10">
              <Zap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Handymate</h1>
          </div>

          <div className="bg-white shadow-sm rounded-3xl border border-gray-200 p-8 text-center">
            <div className="w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Ogiltig inbjudan</h2>
            <p className="text-gray-500 mb-1">
              {invite?.error || 'Inbjudan har g\u00e5tt ut eller \u00e4r ogiltig.'}
            </p>
            <p className="text-gray-400 text-sm mb-6">
              Kontakta din arbetsgivare f\u00f6r en ny inbjudan.
            </p>
            <a
              href="/login"
              className="inline-block px-6 py-3 text-sm font-medium text-blue-600 hover:text-blue-500 transition-colors"
            >
              Tillbaka till inloggning
            </a>
          </div>
        </div>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center relative overflow-hidden">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-50 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-fuchsia-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative w-full max-w-md mx-4">
          <div className="bg-white shadow-sm rounded-3xl border border-gray-200 p-8 text-center">
            <div className="w-14 h-14 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-7 h-7 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">V\u00e4lkommen!</h2>
            <p className="text-gray-500 mb-4">Ditt konto har skapats. Omdirigerar...</p>
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin mx-auto" />
          </div>
        </div>
      </div>
    )
  }

  // Valid invite - acceptance form
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center relative overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-50 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-fuchsia-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md mx-4 py-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/10">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Handymate</h1>
        </div>

        {/* Form Card */}
        <div className="bg-white shadow-sm rounded-3xl border border-gray-200 p-8">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Du har blivit inbjuden till{' '}
              <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                {invite.business_name}
              </span>
            </h2>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-600 border border-blue-500/20">
              {roleLabels[invite.role] || invite.role}
              {invite.title ? ` \u2013 ${invite.title}` : ''}
            </span>
          </div>

          <form onSubmit={handleAccept} className="space-y-5">
            {/* Name */}
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <User className="w-4 h-4" />
                Namn
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ditt namn"
                required
                className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>

            {/* Email (read-only display) */}
            <div>
              <label className="text-sm text-gray-500 mb-2 block">E-post</label>
              <p className="px-4 py-3 bg-gray-50 border border-gray-300/50 rounded-xl text-gray-700 text-sm">
                {invite.email}
              </p>
            </div>

            {/* Password */}
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <Lock className="w-4 h-4" />
                L\u00f6senord
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Minst 6 tecken"
                  required
                  minLength={6}
                  className="w-full px-4 py-3 pr-12 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <Lock className="w-4 h-4" />
                Bekr\u00e4fta l\u00f6senord
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                placeholder="Upprepa l\u00f6senord"
                required
                minLength={6}
                className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-600 text-sm">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity flex items-center justify-center disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Skapa konto och g\u00e5 med'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-400 mt-6">
          Har du redan ett konto?{' '}
          <a href="/login" className="text-blue-600 hover:text-blue-500">
            Logga in
          </a>
        </p>
      </div>
    </div>
  )
}
