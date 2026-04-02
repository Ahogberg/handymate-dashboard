'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Zap, ArrowLeft, Loader2 } from 'lucide-react'

export default function PartnerLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/partners/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Inloggning misslyckades')
        return
      }

      router.push('/partners/dashboard')
    } catch {
      setError('Något gick fel. Försök igen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <nav className="border-b border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex items-center gap-4">
          <Link href="https://handymate.se/partners" className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Tillbaka</span>
          </Link>
        </div>
      </nav>

      <div className="flex items-center justify-center py-12 sm:py-20 px-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-primary-800 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Partnerportal</h1>
            <p className="text-gray-500 mt-2">Logga in för att se dina leads och provision</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-post</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-primary-600"
                placeholder="din@epost.se"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lösenord</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-primary-600"
                placeholder="Ditt lösenord"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary-800 text-white font-medium rounded-lg hover:bg-primary-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loggar in...
                </>
              ) : (
                'Logga in'
              )}
            </button>

            <p className="text-center text-sm text-gray-500">
              Inget konto?{' '}
              <Link href="/partners/register" className="text-primary-700 hover:text-primary-800 font-medium">
                Bli partner
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
