'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Loader2, ArrowRight, Check, Phone, Building2, User, Mail, Lock, Info, MapPin } from 'lucide-react'

const BRANCHES = [
  { value: 'electrician', label: 'Elektriker', icon: '⚡' },
  { value: 'plumber', label: 'Rörmokare', icon: '🔧' },
  { value: 'carpenter', label: 'Snickare', icon: '🪚' },
  { value: 'painter', label: 'Målare', icon: '🎨' },
  { value: 'hvac', label: 'VVS', icon: '🌡️' },
  { value: 'locksmith', label: 'Låssmed', icon: '🔐' },
  { value: 'cleaning', label: 'Städ', icon: '🧹' },
  { value: 'other', label: 'Annat', icon: '🛠️' },
]

export default function SignupPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    business_name: '',
    display_name: '',
    contact_name: '',
    email: '',
    phone: '',
    branch: '',
    password: '',
    password_confirm: '',
    service_area: '',
  })

  const formatPhoneNumber = (value: string) => {
    let digits = value.replace(/\D/g, '')
    
    if (digits.startsWith('0')) {
      digits = '46' + digits.substring(1)
    }
    
    if (!digits.startsWith('46') && digits.length > 0) {
      digits = '46' + digits
    }
    
    if (digits.length === 0) return ''
    if (digits.length <= 2) return '+' + digits
    if (digits.length <= 4) return '+' + digits.substring(0, 2) + ' ' + digits.substring(2)
    if (digits.length <= 7) return '+' + digits.substring(0, 2) + ' ' + digits.substring(2, 4) + ' ' + digits.substring(4)
    return '+' + digits.substring(0, 2) + ' ' + digits.substring(2, 4) + ' ' + digits.substring(4, 7) + ' ' + digits.substring(7, 9) + ' ' + digits.substring(9, 11)
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value)
    setForm({ ...form, phone: formatted })
  }

  const getCleanPhone = () => {
    return '+' + form.phone.replace(/\D/g, '')
  }

  const handleSubmit = async () => {
    setError('')

    if (!form.business_name || !form.contact_name || !form.email || !form.phone || !form.branch || !form.password) {
      setError('Alla obligatoriska fält måste fyllas i')
      return
    }

    if (form.password.length < 6) {
      setError('Lösenordet måste vara minst 6 tecken')
      return
    }

    if (form.password !== form.password_confirm) {
      setError('Lösenorden matchar inte')
      return
    }

    const cleanPhone = getCleanPhone()
    if (cleanPhone.length < 12) {
      setError('Ange ett giltigt telefonnummer')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          data: {
            email: form.email,
            password: form.password,
            businessName: form.business_name,
            displayName: form.display_name || form.business_name,
            contactName: form.contact_name,
            phone: cleanPhone,
            branch: form.branch,
            serviceArea: form.service_area,
          }
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Något gick fel')
      }

      setStep(3)
      setTimeout(() => {
        router.push('/dashboard')
      }, 2000)

    } catch (err: any) {
      setError(err.message)
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center relative overflow-hidden py-12">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-violet-500/20 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-fuchsia-500/20 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative w-full max-w-lg mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <a href="https://handymate.se" className="inline-block">
            <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-500/25">
              <Zap className="w-8 h-8 text-white" />
            </div>
          </a>
          <h1 className="text-3xl font-bold text-white">Kom igång med Handymate</h1>
          <p className="text-zinc-400 mt-2">Skapa ditt konto på 2 minuter</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                step >= s
                  ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                  : 'bg-zinc-800 text-zinc-500'
              }`}>
                {step > s ? <Check className="w-5 h-5" /> : s}
              </div>
              {s < 3 && (
                <div className={`w-16 h-1 mx-2 rounded transition-all ${step > s ? 'bg-violet-500' : 'bg-zinc-800'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step labels */}
        <div className="flex justify-between mb-8 px-2">
          <span className={`text-xs ${step >= 1 ? 'text-violet-400' : 'text-zinc-600'}`}>Företag</span>
          <span className={`text-xs ${step >= 2 ? 'text-violet-400' : 'text-zinc-600'}`}>Konto</span>
          <span className={`text-xs ${step >= 3 ? 'text-violet-400' : 'text-zinc-600'}`}>Klart!</span>
        </div>

        {/* Form Card */}
        <div className="bg-zinc-900/50 backdrop-blur-xl rounded-3xl border border-zinc-800 p-8">
          {/* Step 1: Företagsinfo */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold text-white mb-2">Om ditt företag</h2>
              <p className="text-sm text-zinc-500 mb-6">Den här informationen används av AI-assistenten och i SMS till kunder.</p>

              <div>
                <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                  <Building2 className="w-4 h-4" />
                  Företagsnamn *
                </label>
                <input
                  type="text"
                  value={form.business_name}
                  onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                  placeholder="Elexperten Stockholm AB"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                  <Info className="w-4 h-4" />
                  Visningsnamn för SMS
                  <span className="text-zinc-600">(valfritt)</span>
                </label>
                <input
                  type="text"
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  placeholder={form.business_name || "T.ex. Elexperten"}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
                <p className="text-xs text-zinc-600 mt-1">Detta namn visas som avsändare i SMS. Max 11 tecken rekommenderas.</p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                  Bransch *
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {BRANCHES.map(b => (
                    <button
                      key={b.value}
                      type="button"
                      onClick={() => setForm({ ...form, branch: b.value })}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        form.branch === b.value
                          ? 'bg-violet-500/20 border-violet-500 text-white'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                      }`}
                    >
                      <span className="text-xl block mb-1">{b.icon}</span>
                      <span className="text-xs">{b.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                  <User className="w-4 h-4" />
                  Ditt namn *
                </label>
                <input
                  type="text"
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                  placeholder="Förnamn Efternamn"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                  <Phone className="w-4 h-4" />
                  Telefonnummer *
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={handlePhoneChange}
                  placeholder="+46 70 123 45 67"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
                <p className="text-xs text-zinc-600 mt-1">Svenskt mobilnummer dit vi kan nå dig.</p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                  <MapPin className="w-4 h-4" />
                  Tjänsteområde
                  <span className="text-zinc-600">(valfritt)</span>
                </label>
                <input
                  type="text"
                  value={form.service_area}
                  onChange={(e) => setForm({ ...form, service_area: e.target.value })}
                  placeholder="T.ex. Stockholm, Solna, Sundbyberg"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
                <p className="text-xs text-zinc-600 mt-1">AI-assistenten berättar för kunder var ni jobbar.</p>
              </div>

              <button
                onClick={() => {
                  if (!form.business_name || !form.branch || !form.contact_name || !form.phone) {
                    setError('Fyll i alla obligatoriska fält')
                    return
                  }
                  if (getCleanPhone().length < 12) {
                    setError('Ange ett giltigt telefonnummer')
                    return
                  }
                  setError('')
                  setStep(2)
                }}
                className="w-full mt-6 py-4 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity flex items-center justify-center"
              >
                Fortsätt
                <ArrowRight className="w-5 h-5 ml-2" />
              </button>
            </div>
          )}

          {/* Step 2: Kontoinformation */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold text-white mb-2">Skapa ditt konto</h2>
              <p className="text-sm text-zinc-500 mb-6">Använd dessa uppgifter för att logga in i din dashboard.</p>

              <div>
                <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                  <Mail className="w-4 h-4" />
                  E-postadress *
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="johan@foretag.se"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                  <Lock className="w-4 h-4" />
                  Lösenord *
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Minst 6 tecken"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                  <Lock className="w-4 h-4" />
                  Bekräfta lösenord *
                </label>
                <input
                  type="password"
                  value={form.password_confirm}
                  onChange={(e) => setForm({ ...form, password_confirm: e.target.value })}
                  placeholder="Upprepa lösenord"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              {/* Sammanfattning */}
              <div className="p-4 bg-zinc-800/50 rounded-xl border border-zinc-700 mt-6">
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Ditt konto</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Företag:</span>
                    <span className="text-white font-medium">{form.business_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">SMS-avsändare:</span>
                    <span className="text-white font-medium">{form.display_name || form.business_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Telefon:</span>
                    <span className="text-white font-medium">{form.phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Provperiod:</span>
                    <span className="text-emerald-400 font-medium">14 dagar gratis</span>
                  </div>
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-4 bg-zinc-800 border border-zinc-700 rounded-xl font-semibold text-white hover:bg-zinc-700 transition-colors"
                >
                  Tillbaka
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 py-4 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity flex items-center justify-center disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Skapa konto
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Success */}
          {step === 3 && (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-10 h-10 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Välkommen till Handymate!</h2>
              <p className="text-zinc-400 mb-6">Ditt konto har skapats. Du skickas nu till din dashboard...</p>
              <Loader2 className="w-6 h-6 animate-spin text-violet-400 mx-auto" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-zinc-500 mt-6">
          Har du redan ett konto?{' '}
          <a href="/login" className="text-violet-400 hover:text-violet-300">
            Logga in
          </a>
        </p>
      </div>
    </div>
  )
}
