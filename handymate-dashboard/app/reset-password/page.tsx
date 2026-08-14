'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Loader2, Lock, Check, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

function ResetPasswordForm() {
  const router = useRouter()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionValid, setSessionValid] = useState<boolean | null>(null)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  /**
   * Kritisk bugg fixad 2026-08-14: återställningsmejlet levererar tokens
   * som URL-HASH (#access_token=...&refresh_token=...&type=recovery,
   * Supabases implicit-flow-format) — men den koden här ropade tidigare
   * BARA /api/auth {action:'check'} rakt av, som bara läser en befintlig
   * cookie-session. Hashen bytes aldrig in i en session först, så
   * kontrollen misslyckades ALLTID, oavsett om länken faktiskt var giltig
   * — "Ogiltig länk" visades på varenda återställning, för alla konton.
   * Samma rotorsaksfamilj som magic link-buggen (ingen kod i den här
   * kodbasen hanterade hash-fragment-tokens någonstans). Fixen: byt in
   * tokens via klientens supabase.auth.setSession() (samma
   * createClientComponentClient som resten av appen redan litar på för
   * att skriva cookien i rätt format, se lib/supabase.ts) INNAN
   * /api/auth-kontrollen frågas.
   */
  useEffect(() => {
    async function checkSession() {
      try {
        const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
        const params = new URLSearchParams(hash)
        const access_token = params.get('access_token')
        const refresh_token = params.get('refresh_token')
        if (access_token && refresh_token) {
          const { error: setSessionError } = await supabase.auth.setSession({ access_token, refresh_token })
          if (setSessionError) {
            setSessionValid(false)
            setError('Återställningslänken är ogiltig eller har gått ut. Begär en ny.')
            return
          }
          // Tokens ska inte ligga kvar synliga i URL:en (kan kopieras/delas av misstag).
          window.history.replaceState(null, '', window.location.pathname)
        }

        const response = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check' }),
        })
        setSessionValid(response.ok)
        if (!response.ok) {
          setError('Återställningslänken är ogiltig eller har gått ut. Begär en ny.')
        }
      } catch {
        setSessionValid(false)
        setError('Återställningslänken är ogiltig eller har gått ut. Begär en ny.')
      }
    }
    checkSession()
  }, [])

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
          data: { password }
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
            <div className="w-16 h-16 bg-primary-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-600/10">
              <Zap className="w-8 h-8 text-white" />
            </div>
          </a>
          <h1 className="text-3xl font-bold text-gray-900">Nytt lösenord</h1>
          <p className="text-gray-500 mt-2">
            {success ? 'Lösenordet har ändrats!' : 'Välj ett nytt lösenord'}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white shadow-sm rounded-3xl border border-gray-200 p-8">
          {sessionValid === null ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary-700" />
            </div>
          ) : sessionValid === false ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Ogiltig länk</h2>
              <p className="text-gray-500 text-sm mb-6">
                Återställningslänken är ogiltig eller har gått ut.
              </p>
              <a
                href="/forgot-password"
                className="text-primary-700 hover:text-primary-700 text-sm"
              >
                Begär en ny länk
              </a>
            </div>
          ) : success ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Lösenord ändrat!</h2>
              <p className="text-gray-500 text-sm mb-4">
                Du kan nu logga in med ditt nya lösenord.
              </p>
              <Loader2 className="w-5 h-5 animate-spin text-primary-700 mx-auto" />
              <p className="text-gray-400 text-xs mt-2">Omdirigerar till inloggning...</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <Lock className="w-4 h-4" />
                  Nytt lösenord
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minst 6 tecken"
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/50"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <Lock className="w-4 h-4" />
                  Bekräfta lösenord
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Skriv lösenordet igen"
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/50"
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                />
              </div>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-600 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full py-4 bg-primary-700 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity flex items-center justify-center disabled:opacity-50"
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
  return <ResetPasswordForm />
}
