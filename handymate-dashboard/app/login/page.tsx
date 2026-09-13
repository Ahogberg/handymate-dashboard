'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Loader2, ArrowRight, Mail, Lock } from 'lucide-react'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
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

      // Serverns redirect vinner över ?redirect= när den finns. Den sätts
      // bara för adminkonton utan företag, och just för dem är den sparade
      // adressen nästan alltid /dashboard — en sida de inte kan visa, som
      // skickar tillbaka hit igen. Undantaget är en adminsida de faktiskt
      // var på väg till: den respekteras.
      const requested = searchParams?.get('redirect') || ''
      const serverRedirect: string = result.redirect || ''
      const redirect = serverRedirect
        ? (requested.startsWith('/admin') ? requested : serverRedirect)
        : (requested || '/dashboard')
      router.push(redirect)

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary-100 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-primary-600/15 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative w-full max-w-md mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <a href="https://handymate.se" className="inline-block">
            <Image src="/logo.png" alt="Handymate" width={112} height={112} priority className="mx-auto mb-2 object-contain" />
          </a>
          <h1 className="text-3xl font-bold text-gray-900">Logga in</h1>
          <p className="text-gray-500 mt-2">Välkommen tillbaka!</p>
        </div>

        {/* Form Card */}
        <div className="bg-white shadow-sm rounded-3xl border border-gray-200 p-8">
          <div className="space-y-5">
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <Mail className="w-4 h-4" />
                E-postadress
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="din@epost.se"
                className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/50"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <Lock className="w-4 h-4" />
                Lösenord
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Ditt lösenord"
                className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/50"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>

<div className="text-right">
  <a href="/forgot-password" className="text-sm text-primary-700 hover:text-primary-700">
    Glömt lösenordet?
  </a>
</div>
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-600 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-4 bg-primary-700 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity flex items-center justify-center disabled:opacity-50"
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
        <p className="text-center text-sm text-gray-400 mt-6">
          Har du inget konto?{' '}
          <a href="/signup" className="text-primary-700 hover:text-primary-700">
            Skapa konto
          </a>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
