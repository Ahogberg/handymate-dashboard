'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Zap, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react'

export default function PartnerRegisterPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/partners/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, company: company || null, email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Registrering misslyckades')
        return
      }

      setSuccess(true)
    } catch {
      setError('Något gick fel. Försök igen.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-primary-700" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Ansökan skickad!</h1>
          <p className="text-gray-600 mb-6">
            Vi granskar din ansökan och återkommer inom 24 timmar.
            Du får ett mail till <strong>{email}</strong> när kontot är godkänt.
          </p>
          <Link
            href="https://handymate.se/partners"
            className="text-primary-700 hover:text-primary-800 font-medium text-sm"
          >
            Tillbaka till startsidan
          </Link>
        </div>
      </div>
    )
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
            <h1 className="text-2xl font-bold text-gray-900">Bli Handymate-partner</h1>
            <p className="text-gray-500 mt-2">Fyll i formuläret nedan. Godkänd inom 24 timmar.</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Namn *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-primary-600"
                placeholder="Ditt fullständiga namn"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Företag</label>
              <input
                type="text"
                value={company}
                onChange={e => setCompany(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-primary-600"
                placeholder="Företagsnamn (valfritt)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-post *</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Lösenord *</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-primary-600"
                placeholder="Minst 8 tecken"
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
                  Skickar...
                </>
              ) : (
                'Skicka ansökan'
              )}
            </button>

            <p className="text-center text-sm text-gray-500">
              Har du redan ett konto?{' '}
              <Link href="/partners/login" className="text-primary-700 hover:text-primary-800 font-medium">
                Logga in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
