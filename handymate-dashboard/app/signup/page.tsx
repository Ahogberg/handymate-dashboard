'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Loader2, ArrowRight, Check } from 'lucide-react'

const BRANCHES = [
  { value: 'electrician', label: 'Elektriker' },
  { value: 'plumber', label: 'Rörmokare' },
  { value: 'carpenter', label: 'Snickare' },
  { value: 'painter', label: 'Målare' },
  { value: 'hvac', label: 'VVS' },
  { value: 'locksmith', label: 'Låssmed' },
  { value: 'cleaning', label: 'Städ' },
  { value: 'other', label: 'Annat' },
]

export default function SignupPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    business_name: '',
    contact_name: '',
    email: '',
    phone: '',
    branch: '',
    password: '',
    password_confirm: '',
  })

  const handleSubmit = async () => {
    setError('')

    // Validering
    if (!form.business_name || !form.contact_name || !form.email || !form.phone || !form.branch || !form.password) {
      setError('Alla fält måste fyllas i')
      return
    }

    if (form.password !== form.password_confirm) {
      setError('Lösenorden matchar inte')
      return
    }

    if (form.password.length < 6) {
      setError('Lösenordet måste vara minst 6 tecken')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_business',
          data: form
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Något gick fel')
      }

      // Gå till steg 3 (success)
      setStep(3)

      // Redirect till dashboard efter 2 sek
      setTimeout(() => {
        router.push('/dashboard')
      }, 2000)

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

      <div className="relative w-full max-w-lg mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-500/25">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Kom igång med Handymate</h1>
          <p className="text-zinc-400 mt-2">Skapa ditt konto på 2 minuter</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= s 
                  ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white' 
                  : 'bg-zinc-800 text-zinc-500'
              }`}>
                {step > s ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 3 && (
                <div className={`w-12 h-1 mx-2 rounded ${step > s ? 'bg-violet-500' : 'bg-zinc-800'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Form Card */}
        <div className="bg-zinc-900/50 backdrop-blur-xl rounded-3xl border border-zinc-800 p-8">
          
          {/* Step 1: Företagsinfo */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white mb-6">Företagsinformation</h2>
              
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Företagsnamn *</label>
                <input
                  type="text"
                  value={form.business_name}
                  onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                  placeholder="T.ex. Elexperten Stockholm AB"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">Bransch *</label>
                <select
                  value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                >
                  <option value="">Välj bransch...</option>
                  {BRANCHES.map(b => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">Kontaktperson *</label>
                <input
                  type="text"
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                  placeholder="Ditt namn"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">Telefon *</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+46 70 123 45 67"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <button
                onClick={() => {
                  if (!form.business_name || !form.branch || !form.contact_name || !form.phone) {
                    setError('Fyll i alla fält')
                    return
                  }
                  setError('')
                  setStep(2)
                }}
                className="w-full mt-6 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity flex items-center justify-center"
              >
                Fortsätt
                <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            </div>
          )}

          {/* Step 2: Kontoinformation */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white mb-6">Skapa ditt konto</h2>
              
              <div>
                <label className="block text-sm text-zinc-400 mb-1">E-post *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="din@epost.se"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">Lösenord *</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Minst 6 tecken"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">Bekräfta lösenord *</label>
                <input
                  type="password"
                  value={form.password_confirm}
                  onChange={(e) => setForm({ ...form, password_confirm: e.target.value })}
                  placeholder="Skriv lösenordet igen"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 bg-zinc-800 border border-zinc-700 rounded-xl font-semibold text-white hover:bg-zinc-700 transition-colors"
                >
                  Tillbaka
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity flex items-center justify-center disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Skapa konto
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Success */}
          {step === 3 && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Välkommen till Handymate!</h2>
              <p className="text-zinc-400 mb-4">Ditt konto har skapats. Du skickas nu till din dashboard...</p>
              <Loader2 className="w-6 h-6 animate-spin text-violet-400 mx-auto" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-zinc-500 mt-6">
          Har du redan ett konto?{' '}
          <a href="/dashboard" className="text-violet-400 hover:text-violet-300">
            Logga in
          </a>
        </p>
      </div>
    </div>
  )
}
