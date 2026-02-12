'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Loader2, ArrowRight, Check, Phone, Building2, User, Mail, Lock, Info, MapPin, Clock, PhoneCall, PhoneForwarded, Bot } from 'lucide-react'

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

const DAYS = [
  { key: 'monday', label: 'Måndag', short: 'Mån' },
  { key: 'tuesday', label: 'Tisdag', short: 'Tis' },
  { key: 'wednesday', label: 'Onsdag', short: 'Ons' },
  { key: 'thursday', label: 'Torsdag', short: 'Tor' },
  { key: 'friday', label: 'Fredag', short: 'Fre' },
  { key: 'saturday', label: 'Lördag', short: 'Lör' },
  { key: 'sunday', label: 'Söndag', short: 'Sön' },
]

const TIME_OPTIONS = [
  '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30',
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00',
]

const STEP_LABELS = ['Företag', 'Konto', 'Telefon', 'Tider', 'Klart']

type CallMode = 'human_first' | 'ai_always' | 'ai_after_hours'
type PhoneSetupType = 'keep_existing' | 'new_number' | null

interface WorkingHours {
  [key: string]: {
    active: boolean
    start: string
    end: string
  }
}

const DEFAULT_WORKING_HOURS: WorkingHours = {
  monday: { active: true, start: '08:00', end: '17:00' },
  tuesday: { active: true, start: '08:00', end: '17:00' },
  wednesday: { active: true, start: '08:00', end: '17:00' },
  thursday: { active: true, start: '08:00', end: '17:00' },
  friday: { active: true, start: '08:00', end: '17:00' },
  saturday: { active: false, start: '09:00', end: '14:00' },
  sunday: { active: false, start: '10:00', end: '14:00' },
}

export default function SignupPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Form state
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

  // Onboarding state (after account creation)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [emailConfirmationPending, setEmailConfirmationPending] = useState(false)

  // Step 3: Phone setup state
  const [phoneSetupType, setPhoneSetupType] = useState<PhoneSetupType>(null)
  const [assignedPhoneNumber, setAssignedPhoneNumber] = useState<string | null>(null)
  const [forwardPhoneNumber, setForwardPhoneNumber] = useState('')
  const [callMode, setCallMode] = useState<CallMode>('human_first')
  const [phoneLoading, setPhoneLoading] = useState(false)
  const [forwardingConfirmed, setForwardingConfirmed] = useState(false)

  // Step 4: Working hours state
  const [workingHours, setWorkingHours] = useState<WorkingHours>(DEFAULT_WORKING_HOURS)
  const [hoursLoading, setHoursLoading] = useState(false)

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

  const getCleanPhone = (phone?: string) => {
    return '+' + (phone || form.phone).replace(/\D/g, '')
  }

  // Step 2: Create account
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

      // Save businessId for later steps
      setBusinessId(result.businessId)
      setEmailConfirmationPending(result.emailConfirmationPending || false)
      setForwardPhoneNumber(form.phone) // Pre-fill with their phone number
      setStep(3)

    } catch (err: any) {
      setError(err.message)
    }

    setLoading(false)
  }

  // Step 3: Phone setup
  const handlePhoneSetup = async () => {
    if (!businessId) return

    setPhoneLoading(true)
    setError('')

    try {
      const response = await fetch('/api/onboarding/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          forward_phone_number: getCleanPhone(forwardPhoneNumber),
          call_mode: callMode,
          phone_setup_type: phoneSetupType,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Kunde inte aktivera telefonnummer')
      }

      setAssignedPhoneNumber(result.number)

    } catch (err: any) {
      setError(err.message)
    }

    setPhoneLoading(false)
  }

  // Step 4: Save working hours
  const handleSaveHours = async () => {
    if (!businessId) return

    setHoursLoading(true)
    setError('')

    try {
      const response = await fetch('/api/onboarding/hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          working_hours: workingHours,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Kunde inte spara öppettider')
      }

      setStep(5)

    } catch (err: any) {
      setError(err.message)
    }

    setHoursLoading(false)
  }

  const skipPhoneSetup = () => {
    setStep(4)
  }

  const skipHoursSetup = async () => {
    // Save default hours and move on
    if (businessId) {
      await fetch('/api/onboarding/hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          working_hours: DEFAULT_WORKING_HOURS,
        }),
      }).catch(() => {})
    }
    setStep(5)
  }

  const updateWorkingHours = (day: string, field: 'active' | 'start' | 'end', value: boolean | string) => {
    setWorkingHours(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value
      }
    }))
  }

  const getCallModeLabel = (mode: CallMode) => {
    switch (mode) {
      case 'human_first': return 'Ring dig först, sedan AI'
      case 'ai_always': return 'AI svarar alltid'
      case 'ai_after_hours': return 'AI utanför öppettider'
    }
  }

  const getActiveHoursSummary = () => {
    const activeDays = DAYS.filter(d => workingHours[d.key]?.active)
    if (activeDays.length === 0) return 'Inga öppettider konfigurerade'
    if (activeDays.length === 7) return 'Alla dagar'
    if (activeDays.length >= 5 && DAYS.slice(0, 5).every(d => workingHours[d.key]?.active)) {
      const weekend = DAYS.slice(5).filter(d => workingHours[d.key]?.active)
      if (weekend.length === 0) return 'Mån-Fre'
      return `Mån-Fre + ${weekend.map(d => d.short).join(', ')}`
    }
    return activeDays.map(d => d.short).join(', ')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center relative overflow-hidden py-12">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-100 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-cyan-100 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative w-full max-w-lg mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <a href="https://handymate.se" className="inline-block">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/10">
              <Zap className="w-8 h-8 text-white" />
            </div>
          </a>
          <h1 className="text-3xl font-bold text-gray-900">Kom igång med Handymate</h1>
          <p className="text-gray-500 mt-2">Skapa ditt konto på några minuter</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-6">
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                step >= s
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                  : 'bg-gray-100 text-gray-400'
              }`}>
                {step > s ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 5 && (
                <div className={`w-8 h-1 mx-1 rounded transition-all ${step > s ? 'bg-blue-500' : 'bg-gray-100'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step labels */}
        <div className="flex justify-between mb-8 px-1">
          {STEP_LABELS.map((label, i) => (
            <span key={i} className={`text-xs ${step >= i + 1 ? 'text-blue-600' : 'text-gray-400'}`}>
              {label}
            </span>
          ))}
        </div>

        {/* Email confirmation banner */}
        {emailConfirmationPending && step >= 3 && (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-sm flex items-start gap-2">
            <Mail className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Kolla din e-post för att verifiera kontot. Du kan fortsätta medan du väntar.</span>
          </div>
        )}

        {/* Form Card */}
        <div className="bg-white shadow-sm rounded-3xl border border-gray-200 p-8">
          {/* Step 1: Företagsinfo */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Om ditt företag</h2>
              <p className="text-sm text-gray-400 mb-6">Den här informationen används av AI-assistenten och i SMS till kunder.</p>

              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <Building2 className="w-4 h-4" />
                  Företagsnamn *
                </label>
                <input
                  type="text"
                  value={form.business_name}
                  onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                  placeholder="Elexperten Stockholm AB"
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <Info className="w-4 h-4" />
                  Visningsnamn för SMS
                  <span className="text-gray-400">(valfritt)</span>
                </label>
                <input
                  type="text"
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  placeholder={form.business_name || "T.ex. Elexperten"}
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
                <p className="text-xs text-gray-400 mt-1">Detta namn visas som avsändare i SMS. Max 11 tecken rekommenderas.</p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
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
                          ? 'bg-blue-100 border-blue-500 text-gray-900'
                          : 'bg-gray-100 border-gray-300 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-xl block mb-1">{b.icon}</span>
                      <span className="text-xs">{b.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <User className="w-4 h-4" />
                  Ditt namn *
                </label>
                <input
                  type="text"
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                  placeholder="Förnamn Efternamn"
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <Phone className="w-4 h-4" />
                  Telefonnummer *
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={handlePhoneChange}
                  placeholder="+46 70 123 45 67"
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
                <p className="text-xs text-gray-400 mt-1">Svenskt mobilnummer dit vi kan nå dig.</p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <MapPin className="w-4 h-4" />
                  Tjänsteområde
                  <span className="text-gray-400">(valfritt)</span>
                </label>
                <input
                  type="text"
                  value={form.service_area}
                  onChange={(e) => setForm({ ...form, service_area: e.target.value })}
                  placeholder="T.ex. Stockholm, Solna, Sundbyberg"
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
                <p className="text-xs text-gray-400 mt-1">AI-assistenten berättar för kunder var ni jobbar.</p>
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
                className="w-full mt-6 py-4 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity flex items-center justify-center"
              >
                Fortsätt
                <ArrowRight className="w-5 h-5 ml-2" />
              </button>
            </div>
          )}

          {/* Step 2: Kontoinformation */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Skapa ditt konto</h2>
              <p className="text-sm text-gray-400 mb-6">Använd dessa uppgifter för att logga in i din dashboard.</p>

              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <Mail className="w-4 h-4" />
                  E-postadress *
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="johan@foretag.se"
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <Lock className="w-4 h-4" />
                  Lösenord *
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Minst 6 tecken"
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <Lock className="w-4 h-4" />
                  Bekräfta lösenord *
                </label>
                <input
                  type="password"
                  value={form.password_confirm}
                  onChange={(e) => setForm({ ...form, password_confirm: e.target.value })}
                  placeholder="Upprepa lösenord"
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              {/* Sammanfattning */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-300 mt-6">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Ditt konto</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Företag:</span>
                    <span className="text-gray-900 font-medium">{form.business_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">SMS-avsändare:</span>
                    <span className="text-gray-900 font-medium">{form.display_name || form.business_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Telefon:</span>
                    <span className="text-gray-900 font-medium">{form.phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Provperiod:</span>
                    <span className="text-emerald-600 font-medium">14 dagar gratis</span>
                  </div>
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-4 bg-gray-100 border border-gray-300 rounded-xl font-semibold text-gray-900 hover:bg-gray-200 transition-colors"
                >
                  Tillbaka
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 py-4 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity flex items-center justify-center disabled:opacity-50"
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

          {/* Step 3: Phone Setup */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Hur vill du ta emot samtal?</h2>
              <p className="text-sm text-gray-400 mb-6">Som standard ringer kunden dig först. Om du inte svarar tar AI-assistenten över och bokar jobbet åt dig.</p>

              {/* Phone setup type selection */}
              {!assignedPhoneNumber && (
                <div className="space-y-3">
                  {/* Option A: Keep existing number */}
                  <button
                    onClick={() => setPhoneSetupType('keep_existing')}
                    className={`w-full p-4 rounded-xl border text-left transition-all ${
                      phoneSetupType === 'keep_existing'
                        ? 'bg-blue-100 border-blue-500'
                        : 'bg-gray-100 border-gray-300 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        phoneSetupType === 'keep_existing' ? 'bg-blue-500/30' : 'bg-gray-200'
                      }`}>
                        <PhoneForwarded className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">Behåll mitt nuvarande nummer</span>
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 text-xs rounded-full">Rekommenderat</span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">Dina kunder ringer dig som vanligt. Svarar du inte kopplas samtalet till AI-assistenten.</p>
                      </div>
                    </div>
                  </button>

                  {/* Option B: New number */}
                  <button
                    onClick={() => setPhoneSetupType('new_number')}
                    className={`w-full p-4 rounded-xl border text-left transition-all ${
                      phoneSetupType === 'new_number'
                        ? 'bg-blue-100 border-blue-500'
                        : 'bg-gray-100 border-gray-300 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        phoneSetupType === 'new_number' ? 'bg-blue-500/30' : 'bg-gray-200'
                      }`}>
                        <Phone className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <span className="font-medium text-gray-900">Ge mig ett nytt nummer</span>
                        <p className="text-sm text-gray-500 mt-1">Du får ett eget företagsnummer. AI svarar direkt och kopplar till dig vid behov.</p>
                      </div>
                    </div>
                  </button>
                </div>
              )}

              {/* After selection - show setup UI */}
              {phoneSetupType && !assignedPhoneNumber && (
                <div className="mt-6 space-y-5">
                  {/* Forward phone number input */}
                  <div>
                    <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                      <Phone className="w-4 h-4" />
                      Ditt mobilnummer (dit AI kopplar om kunden vill prata med dig)
                    </label>
                    <input
                      type="tel"
                      value={forwardPhoneNumber}
                      onChange={(e) => setForwardPhoneNumber(formatPhoneNumber(e.target.value))}
                      placeholder="+46 70 123 45 67"
                      className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>

                  {/* Call mode selection */}
                  <div>
                    <label className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                      <PhoneCall className="w-4 h-4" />
                      Hur ska samtal hanteras?
                    </label>
                    <div className="space-y-2">
                      {[
                        { value: 'human_first', label: 'Ring mig först, AI tar över om jag inte svarar', icon: PhoneForwarded },
                        { value: 'ai_always', label: 'AI svarar alltid direkt', icon: Bot },
                        { value: 'ai_after_hours', label: 'AI svarar bara utanför öppettider', icon: Clock },
                      ].map(option => (
                        <button
                          key={option.value}
                          onClick={() => setCallMode(option.value as CallMode)}
                          className={`w-full p-3 rounded-xl border text-left flex items-center gap-3 transition-all ${
                            callMode === option.value
                              ? 'bg-blue-100 border-blue-500'
                              : 'bg-gray-100 border-gray-300 hover:border-gray-300'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            callMode === option.value ? 'border-blue-500' : 'border-gray-300'
                          }`}>
                            {callMode === option.value && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
                          </div>
                          <option.icon className="w-4 h-4 text-gray-500" />
                          <span className="text-sm text-gray-900">{option.label}</span>
                          {option.value === 'human_first' && (
                            <span className="ml-auto text-xs text-gray-400">Standard</span>
                          )}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">Du kan ändra detta när som helst i inställningarna</p>
                  </div>

                  {/* Activate button */}
                  <button
                    onClick={handlePhoneSetup}
                    disabled={phoneLoading}
                    className="w-full py-4 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity flex items-center justify-center disabled:opacity-50"
                  >
                    {phoneLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        Aktiverar...
                      </>
                    ) : (
                      <>
                        Aktivera mitt nummer
                        <ArrowRight className="w-5 h-5 ml-2" />
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* After number is assigned */}
              {assignedPhoneNumber && (
                <div className="space-y-5">
                  {/* Success message */}
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                        <Check className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm text-emerald-600 font-medium">Telefonnummer aktiverat</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">{assignedPhoneNumber}</p>
                      </div>
                    </div>
                  </div>

                  {/* Forwarding instructions for "keep existing" */}
                  {phoneSetupType === 'keep_existing' && !forwardingConfirmed && (
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-300">
                      <p className="text-sm text-gray-500 mb-3">Ställ in vidarekoppling vid inget svar till detta nummer hos din operatör:</p>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Telia:</span>
                          <code className="text-blue-600">**61*{assignedPhoneNumber.replace(/\s/g, '')}#</code>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Tele2:</span>
                          <code className="text-blue-600">**61*{assignedPhoneNumber.replace(/\s/g, '')}#</code>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Tre:</span>
                          <code className="text-blue-600">**61*{assignedPhoneNumber.replace(/\s/g, '')}#</code>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Telenor:</span>
                          <code className="text-blue-600">**61*{assignedPhoneNumber.replace(/\s/g, '')}#</code>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mt-3">Kontakta din operatör om du behöver hjälp.</p>

                      <button
                        onClick={() => setForwardingConfirmed(true)}
                        className="w-full mt-4 py-3 bg-gray-200 border border-gray-300 rounded-xl font-medium text-gray-900 hover:bg-gray-300 transition-colors"
                      >
                        Jag har ställt in vidarekopplingen
                      </button>
                    </div>
                  )}

                  {/* Continue button */}
                  {(phoneSetupType === 'new_number' || forwardingConfirmed) && (
                    <button
                      onClick={() => setStep(4)}
                      className="w-full py-4 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity flex items-center justify-center"
                    >
                      Fortsätt
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </button>
                  )}
                </div>
              )}

              {/* Skip link */}
              <button
                onClick={skipPhoneSetup}
                className="w-full text-center text-sm text-gray-400 hover:text-gray-500 transition-colors mt-4"
              >
                Jag vill konfigurera detta senare
              </button>
            </div>
          )}

          {/* Step 4: Working Hours */}
          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">När är du tillgänglig?</h2>
              <p className="text-sm text-gray-400 mb-6">Under öppettiderna svarar AI-assistenten och bokar jobb. Utanför tar den meddelanden som du får som SMS.</p>

              {/* Days list */}
              <div className="space-y-2">
                {DAYS.map(day => (
                  <div key={day.key} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-300">
                    {/* Toggle */}
                    <button
                      onClick={() => updateWorkingHours(day.key, 'active', !workingHours[day.key].active)}
                      className={`w-12 h-6 rounded-full transition-colors relative ${
                        workingHours[day.key].active ? 'bg-blue-500' : 'bg-gray-300'
                      }`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                        workingHours[day.key].active ? 'left-7' : 'left-1'
                      }`} />
                    </button>

                    {/* Day label */}
                    <span className={`w-20 text-sm font-medium ${
                      workingHours[day.key].active ? 'text-gray-900' : 'text-gray-400'
                    }`}>
                      {day.label}
                    </span>

                    {/* Time selects */}
                    {workingHours[day.key].active ? (
                      <>
                        <select
                          value={workingHours[day.key].start}
                          onChange={(e) => updateWorkingHours(day.key, 'start', e.target.value)}
                          className="flex-1 px-3 py-2 bg-gray-200 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        >
                          {TIME_OPTIONS.map(time => (
                            <option key={time} value={time}>{time}</option>
                          ))}
                        </select>
                        <span className="text-gray-400">–</span>
                        <select
                          value={workingHours[day.key].end}
                          onChange={(e) => updateWorkingHours(day.key, 'end', e.target.value)}
                          className="flex-1 px-3 py-2 bg-gray-200 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        >
                          {TIME_OPTIONS.map(time => (
                            <option key={time} value={time}>{time}</option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <span className="flex-1 text-sm text-gray-400">Stängt</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 py-4 bg-gray-100 border border-gray-300 rounded-xl font-semibold text-gray-900 hover:bg-gray-200 transition-colors"
                >
                  Tillbaka
                </button>
                <button
                  onClick={handleSaveHours}
                  disabled={hoursLoading}
                  className="flex-1 py-4 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity flex items-center justify-center disabled:opacity-50"
                >
                  {hoursLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Fortsätt
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </>
                  )}
                </button>
              </div>

              {/* Skip link */}
              <button
                onClick={skipHoursSetup}
                className="w-full text-center text-sm text-gray-400 hover:text-gray-500 transition-colors"
              >
                Hoppa över (behåll standardtider)
              </button>
            </div>
          )}

          {/* Step 5: Complete */}
          {step === 5 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-10 h-10 text-emerald-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Allt klart! 🎉</h2>
                <p className="text-gray-500">Din Handymate är redo att ta emot samtal och bokningar.</p>
              </div>

              {/* Summary */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-300">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Sammanfattning</p>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Företag:</span>
                    <span className="text-gray-900 font-medium">{form.business_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Telefonnummer:</span>
                    <span className={assignedPhoneNumber ? 'text-emerald-600 font-medium' : 'text-gray-400'}>
                      {assignedPhoneNumber || 'Ej konfigurerat'}
                    </span>
                  </div>
                  {assignedPhoneNumber && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Samtalshantering:</span>
                      <span className="text-gray-900 font-medium">{getCallModeLabel(callMode)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Öppettider:</span>
                    <span className="text-gray-900 font-medium">{getActiveHoursSummary()}</span>
                  </div>
                </div>
              </div>

              {/* Checklist */}
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <Check className="w-5 h-5 text-emerald-600" />
                  <span className="text-sm text-gray-900">Konto skapat</span>
                </div>
                <div className={`flex items-center gap-3 p-3 rounded-xl ${
                  assignedPhoneNumber ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-gray-50 border border-gray-300'
                }`}>
                  {assignedPhoneNumber ? (
                    <Check className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <div className="w-5 h-5 rounded border-2 border-gray-300" />
                  )}
                  <span className={`text-sm ${assignedPhoneNumber ? 'text-gray-900' : 'text-gray-400'}`}>
                    Telefonnummer aktiverat
                  </span>
                </div>
                {phoneSetupType === 'keep_existing' && (
                  <div className={`flex items-center gap-3 p-3 rounded-xl ${
                    forwardingConfirmed ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-gray-50 border border-gray-300'
                  }`}>
                    {forwardingConfirmed ? (
                      <Check className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <div className="w-5 h-5 rounded border-2 border-gray-300" />
                    )}
                    <span className={`text-sm ${forwardingConfirmed ? 'text-gray-900' : 'text-gray-400'}`}>
                      Vidarekoppling konfigurerad
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <Check className="w-5 h-5 text-emerald-600" />
                  <span className="text-sm text-gray-900">Öppettider konfigurerade</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-300">
                  <div className="w-5 h-5 rounded border-2 border-gray-300" />
                  <span className="text-sm text-gray-400">Första testsamtalet</span>
                  <span className="ml-auto text-xs text-blue-600">→ I dashboarden</span>
                </div>
              </div>

              <button
                onClick={() => router.push('/dashboard')}
                className="w-full py-4 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity flex items-center justify-center"
              >
                Gå till Dashboard
                <ArrowRight className="w-5 h-5 ml-2" />
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-600 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        {step < 3 && (
          <p className="text-center text-sm text-gray-400 mt-6">
            Har du redan ett konto?{' '}
            <a href="/login" className="text-blue-600 hover:text-blue-500">
              Logga in
            </a>
          </p>
        )}
      </div>
    </div>
  )
}
