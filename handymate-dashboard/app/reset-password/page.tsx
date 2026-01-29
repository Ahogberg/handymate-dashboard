'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Zap, Loader2, Lock, Check, AlertTriangle } from 'lucide-react'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setError('Ogiltig eller saknad återställningslänk')
    }
  }, [token])

  const handleSubmit = async () => {
    setError('')

    if (!password || !confirmPassword) {
      setError('Fyll i båda fälten')
      return
    }

    if (password !== confirmPassword) {
      setError('Lösenorden matchar inte')
      return
    }

    if (password.length < 6) {
      setError('Lösenordet måste vara minst 6 tecken')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset_password',
          data: { token, password }
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Något gick fel')
      }

      setSuccess(true)

      setTimeout(() => {
        router.push('/login')
      }, 3000)

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
          <h1 className="text-3xl font-bold text-white">Nytt lösenord</h1>
          <p className="text-zinc-400 mt-2">
            {success ? 'Lösenordet har ändrats!' : 'Välj ett nytt lösenord'}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-zinc-900/50 backdrop-blur-xl rounded-3xl border border-zinc-800 p-8">
          {!token ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Ogiltig länk</h2>
              <p className="text-zinc-400 text-sm mb-6">
                Återställningslänken är ogiltig eller har gått ut.
              </p>
              <a 
                href="/forgot-password"
                className="text-violet-400 hover:text-violet-300 text-sm"
              >
                Begär en ny länk →
              </a>
            </div>
          ) : success ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Lösenord ändrat!</h2>
              <p className="text-zinc-400 text-sm mb-4">
                Du kan nu logga in med ditt nya lösenord.
              </p>
              <Loader2 className="w-5 h-5 animate-spin text-violet-400 mx-auto" />
              <p className="text-zinc-500 text-xs mt-2">Omdirigerar till inloggning...</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                  <Lock className="w-4 h-4" />
                  Nytt lösenord
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minst 6 tecken"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                  <Lock className="w-4 h-4" />
                  Bekräfta lösenord
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Skriv lösenordet igen"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                />
              </div>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full py-4 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity flex items-center justify-center disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Spara nytt lösenord'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}
