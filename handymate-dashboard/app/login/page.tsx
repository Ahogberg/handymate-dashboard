'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Loader2, ArrowRight, Mail, Lock } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ email: '', password: '' })

  const handleLogin = async () => {
    setError('')

    if (!form.email || !form.password) {
      setError('Fyll i e-post och lösenord')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'login',
          data: form
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Fel e-post eller lösenord')
      }

      router.push('/dashboard')

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-violet-500/20 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-fuchsia-500/15 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative w-full max-w-md mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <a href="https://handymate.se" className="inline-block">
            <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-500/25">
              <Zap className="w-8 h-8 text-white" />
            </div>
          </a>
          <h1 className="text-3xl font-bold text-white">Logga in</h1>
          <p className="text-zinc-400 mt-2">Välkommen tillbaka!</p>
        </div>

        {/* Form Card */}
        <div className="bg-zinc-900/50 backdrop-blur-xl rounded-3xl border border-zinc-800 p-8">
          <div className="space-y-5">
            <div>
              <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                <Mail className="w-4 h-4" />
                E-postadress
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="din@epost.se"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                <Lock className="w-4 h-4" />
                Lösenord
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Ditt lösenord"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity flex items-center justify-center disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Logga in
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-zinc-500 mt-6">
          Har du inget konto?{' '}
          <a href="/signup" className="text-violet-400 hover:text-violet-300">
            Skapa konto
          </a>
        </p>
      </div>
    </div>
  )
}
