'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2, Mail, Building2, Phone, Users, Sparkles, Upload,
  Check, ChevronRight, Shield, ArrowLeft, MessageSquare, Send
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BRANCH_HOURLY_RATE, ROT_BRANCHES, RUT_BRANCHES } from './constants'
import Step1BusinessAccount from './components/Step1BusinessAccount'
import Step3Phone from './components/Step3Phone'
import type { OnboardingData } from './types'
import AddressAutocomplete from '@/components/AddressAutocomplete'

// ── Steps ─────────────────────────────────────────────────────────────
const STEPS = [
  { label: 'Betalning', icon: Shield },
  { label: 'Företag', icon: Building2 },
  { label: 'Telefon', icon: Phone },
  { label: 'Kunder', icon: Users },
  { label: 'Aktivera', icon: Sparkles },
]

// ── Pricing plans ─────────────────────────────────────────────────────
const PLANS = [
  { id: 'starter', name: 'Bas', price: '2 495', monthly: 2495, features: ['AI-telefonassistent', 'Offerter & Fakturor', 'Kundhantering', 'Pipeline', '1 användare'] },
  { id: 'professional', name: 'Pro', price: '5 995', monthly: 5995, popular: true, features: ['Allt i Bas +', 'Automationer & Nurture', 'Lead-generering', 'Offertmallar (obegränsat)', '5 användare', 'Fortnox-integration'] },
  { id: 'business', name: 'Business', price: '11 995', monthly: 11995, features: ['Allt i Pro +', 'Obegränsade användare', 'Egen AI-röst', 'Dedikerad support', 'Egen domän'] },
]

// ── Branch SMS templates ──────────────────────────────────────────────
function getSmsTemplate(branch: string, businessName: string): string {
  const templates: Record<string, string> = {
    electrician: `Hej! Det är ${businessName}. Vi har lediga tider just nu — behöver du hjälp med något el-arbete? Svara JA så ringer vi upp dig!`,
    plumber: `Hej! ${businessName} här. Har du funderat på att se över ditt värmesystem? Vi har lediga tider nu. Svara JA!`,
    painter: `Hej! ${businessName} här. Dags att fräscha upp hemmet? Vi erbjuder kostnadsfri offert. Svara JA så hör vi av oss!`,
    construction: `Hej! ${businessName} här. Planerar du en renovering? Vi har kapacitet nu — svara JA för en kostnadsfri konsultation!`,
  }
  return templates[branch] || `Hej! Det är ${businessName}. Vi har lediga tider just nu — behöver du hjälp med något? Svara JA så ringer vi!`
}

export default function OnboardingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState(0) // 0=payment, 1=company, 2=phone, 3=customers, 4=sms wow
  const [data, setData] = useState<OnboardingData | null>(null)
  const [isNewUser, setIsNewUser] = useState(false)
  const [emailPending, setEmailPending] = useState(false)
  const [pendingEmail, setPendingEmail] = useState('')
  const [selectedPlan, setSelectedPlan] = useState('professional')

  // Step 1 state
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [orgNumber, setOrgNumber] = useState('')
  const [fSkatt, setFSkatt] = useState(true)
  const [serviceArea, setServiceArea] = useState('')

  // Step 3 state
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [importedCustomers, setImportedCustomers] = useState<Array<{ name: string; phone: string; email?: string }>>([])
  const [manualName, setManualName] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [importing, setImporting] = useState(false)

  // Step 4 state
  const [smsText, setSmsText] = useState('')
  const [smsCount, setSmsCount] = useState(0)
  const [sendingSms, setSendingSms] = useState(false)
  const [smsSent, setSmsSent] = useState(0)
  const [smsDone, setSmsDone] = useState(false)

  useEffect(() => {
    async function loadOnboarding() {
      try {
        const res = await fetch('/api/onboarding')
        if (!res.ok) {
          setIsNewUser(true)
          setStep(0)
          setLoading(false)
          return
        }
        const d: OnboardingData = await res.json()
        setData(d)
        if (d.onboarding_step >= 5 || d.onboarding_completed_at) {
          router.push('/dashboard')
          return
        }
        // Resume: map old steps
        if (d.onboarding_step >= 4) setStep(4)
        else if (d.onboarding_step >= 1) setStep(Math.min(d.onboarding_step, 4))
        else setStep(1)
      } catch {
        setIsNewUser(true)
        setStep(0)
      } finally {
        setLoading(false)
      }
    }
    loadOnboarding()
  }, [router])

  const saveProgress = useCallback(async (s: number) => {
    try {
      await fetch('/api/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: s }),
      })
    } catch { /* silent */ }
  }, [])

  const goNext = useCallback(async () => {
    const next = Math.min(step + 1, 4)
    setSaving(true)
    await saveProgress(next)
    setStep(next)
    setSaving(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step, saveProgress])

  const handleUpdate = useCallback((updates: Partial<OnboardingData>) => {
    setData(prev => prev ? { ...prev, ...updates } : null)
  }, [])

  const handleStep1Complete = useCallback(async (
    businessId: string,
    isEmailPending: boolean,
    formData: { business_name: string; branch: string; contact_name: string; contact_email: string; phone_number: string }
  ) => {
    const baseData: OnboardingData = {
      business_id: businessId,
      business_name: formData.business_name,
      display_name: formData.business_name,
      contact_name: formData.contact_name,
      contact_email: formData.contact_email,
      phone_number: formData.phone_number,
      branch: formData.branch,
      service_area: serviceArea,
      org_number: orgNumber,
      address: '',
      services_offered: [],
      default_hourly_rate: BRANCH_HOURLY_RATE[formData.branch] || 450,
      callout_fee: 0,
      rot_enabled: ROT_BRANCHES.includes(formData.branch),
      rut_enabled: RUT_BRANCHES.includes(formData.branch),
      assigned_phone_number: null,
      forward_phone_number: null,
      call_mode: null,
      phone_setup_type: null,
      lead_sources: [],
      lead_email_address: null,
      knowledge_base: null,
      onboarding_step: 2,
      onboarding_data: {},
      onboarding_completed_at: null,
      working_hours: null,
      industry: null,
      google_connected: false,
      gmail_enabled: false,
    }
    setData(baseData)
    setIsNewUser(false)

    if (isEmailPending) {
      setPendingEmail(formData.contact_email)
      setEmailPending(true)
      return
    }

    // Save logo + extra fields
    if (logoUrl || orgNumber) {
      try {
        await fetch('/api/onboarding', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: { logo_url: logoUrl, org_number: orgNumber, f_skatt: fSkatt, service_area: serviceArea }
          }),
        })
      } catch { /* silent */ }
    }

    // Generate SMS template
    setSmsText(getSmsTemplate(formData.branch, formData.business_name))
    setStep(2)
    saveProgress(2).catch(() => {})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [logoUrl, orgNumber, fSkatt, serviceArea, saveProgress])

  async function handleLogoUpload(file: File) {
    if (file.size > 2 * 1024 * 1024) { alert('Max 2 MB'); return }
    setUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/business/logo', { method: 'POST', body: formData })
      const d = await res.json()
      if (res.ok && d.logo_url) setLogoUrl(d.logo_url)
    } catch { /* silent */ }
    setUploadingLogo(false)
  }

  function addManualCustomer() {
    if (!manualName.trim() || !manualPhone.trim()) return
    setImportedCustomers(prev => [...prev, { name: manualName.trim(), phone: manualPhone.trim() }])
    setManualName('')
    setManualPhone('')
  }

  async function handleSendSms() {
    if (importedCustomers.length === 0 || !smsText.trim()) return
    setSendingSms(true)
    const toSend = importedCustomers.slice(0, smsCount || importedCustomers.length)
    let sent = 0
    for (const customer of toSend) {
      try {
        await fetch('/api/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: customer.phone,
            message: smsText.replace('[namn]', customer.name).replace('[name]', customer.name),
          }),
        })
        sent++
        setSmsSent(sent)
      } catch { /* continue */ }
    }
    setSmsDone(true)
    setSendingSms(false)
    // Complete onboarding
    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 5 }),
      })
    } catch { /* silent */ }
  }

  async function completeOnboarding() {
    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 5 }),
      })
    } catch { /* silent */ }
    router.push('/dashboard')
  }

  // ── Loading ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    )
  }

  // ── Email pending ───────────────────────────────────────────────────
  if (emailPending) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto">
            <Mail className="w-8 h-8 text-teal-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Bekräfta din e-post</h1>
          <p className="text-gray-500">
            Vi har skickat ett mail till <span className="text-gray-900 font-medium">{pendingEmail}</span>.
            Klicka på länken för att aktivera ditt konto.
          </p>
          <a href="/login" className="block w-full py-3 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700">
            Gå till inloggning
          </a>
        </div>
      </div>
    )
  }

  const totalSteps = STEPS.length
  const progress = ((step + 1) / totalSteps) * 100

  const stepProps = data ? {
    data,
    onNext: goNext,
    onBack: step > 1 ? () => setStep(step - 1) : undefined,
    onUpdate: handleUpdate,
    saving,
  } : null

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">H</span>
            </div>
            <span className="text-gray-900 font-semibold text-lg">Handymate</span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-teal-600 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between mt-2">
            {STEPS.map((s, i) => (
              <span key={s.label} className={`text-[10px] font-medium ${i <= step ? 'text-teal-600' : 'text-gray-300'}`}>
                {i < step ? '✓' : ''} {s.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* ── STEP 0: Payment ─────────────────────────────────── */}
        {step === 0 && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Välj din plan</h1>
              <p className="text-gray-500">Alla planer inkluderar AI-telefonassistent och 30 dagars pengarna-tillbaka-garanti</p>
            </div>

            <div className="grid gap-4">
              {PLANS.map(plan => (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`relative text-left p-5 rounded-2xl border-2 transition-all ${
                    selectedPlan === plan.id
                      ? 'border-teal-600 bg-teal-50/50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  {plan.popular && (
                    <span className="absolute -top-2.5 right-4 bg-teal-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                      Populärast
                    </span>
                  )}
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                    <div className="text-right">
                      <span className="text-2xl font-bold text-gray-900">{plan.price}</span>
                      <span className="text-sm text-gray-400"> kr/mån</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {plan.features.map(f => (
                      <span key={f} className="text-xs text-gray-500 flex items-center gap-1">
                        <Check className="w-3 h-3 text-teal-600" />{f}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>

            {/* Guarantee */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <p className="text-sm font-semibold text-emerald-700">
                💚 30 dagars pengarna-tillbaka-garanti
              </p>
              <p className="text-xs text-emerald-600 mt-1">
                Sparar du inte tid inom 30 dagar — få pengarna tillbaka, inga frågor
              </p>
            </div>

            <button
              onClick={() => {
                // In production: redirect to Stripe checkout
                // For now: proceed to step 1
                setStep(1)
              }}
              className="w-full py-4 bg-teal-600 text-white text-lg font-semibold rounded-xl hover:bg-teal-700 transition-colors flex items-center justify-center gap-2"
            >
              Kom igång <ChevronRight className="w-5 h-5" />
            </button>
            <p className="text-center text-xs text-gray-400">
              30 dagars pengarna-tillbaka-garanti — inga frågor
            </p>
          </div>
        )}

        {/* ── STEP 1: Company Info ────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Företagsinfo</h1>
              <p className="text-gray-500 text-sm">Steg 1 av 4 — tar ca 2 minuter</p>
            </div>

            {/* Logo upload */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <label className="block text-sm font-medium text-gray-700 mb-3">Företagslogga</label>
              <div className="flex items-center gap-4">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logga" className="w-16 h-16 object-contain rounded-xl border border-gray-200" />
                ) : (
                  <div className="w-16 h-16 bg-gray-100 rounded-xl border border-dashed border-gray-300 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-gray-300" />
                  </div>
                )}
                <div>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 text-teal-700 text-sm font-medium rounded-lg hover:bg-teal-100">
                    <Upload className="w-3.5 h-3.5" />
                    {logoUrl ? 'Byt logga' : 'Ladda upp'}
                    <input type="file" className="hidden" accept=".png,.jpg,.jpeg,.svg,.webp"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = '' }}
                    />
                  </label>
                  {uploadingLogo && <Loader2 className="w-4 h-4 text-teal-500 animate-spin inline ml-2" />}
                  <p className="text-xs text-gray-400 mt-1">Syns på offerter, fakturor och brev. PNG/JPG/SVG, max 2MB</p>
                </div>
              </div>
            </div>

            {/* Org number + F-skatt */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Org-nummer</label>
                  <input type="text" value={orgNumber} onChange={e => setOrgNumber(e.target.value)}
                    placeholder="XXXXXX-XXXX"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Tjänsteområde</label>
                  <input type="text" value={serviceArea} onChange={e => setServiceArea(e.target.value)}
                    placeholder="Postnummer eller stad"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={fSkatt} onChange={e => setFSkatt(e.target.checked)}
                  className="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700">F-skattsedel innehas</span>
              </label>
            </div>

            {/* Step1 registration form (business name, branch, contact, email, phone) */}
            <Step1BusinessAccount onComplete={handleStep1Complete} />
          </div>
        )}

        {/* ── STEP 2: Phone ───────────────────────────────────── */}
        {step === 2 && stepProps && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Ditt företagsnummer</h1>
              <p className="text-gray-500 text-sm">Steg 2 av 4</p>
            </div>
            <Step3Phone {...stepProps} />
          </div>
        )}

        {/* ── STEP 3: Import Customers ────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Lägg till dina kunder</h1>
              <p className="text-gray-500 text-sm">Steg 3 av 4 — importera befintliga kunder</p>
            </div>

            {/* Manual add */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Lägg till manuellt</h3>
              <div className="flex gap-2">
                <input type="text" value={manualName} onChange={e => setManualName(e.target.value)}
                  placeholder="Namn" className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                />
                <input type="tel" value={manualPhone} onChange={e => setManualPhone(e.target.value)}
                  placeholder="Telefon" className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                />
                <button onClick={addManualCustomer} disabled={!manualName.trim() || !manualPhone.trim()}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  Lägg till
                </button>
              </div>
            </div>

            {/* CSV upload */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Eller ladda upp CSV</h3>
              <label className="flex items-center justify-center gap-2 py-4 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-teal-400 hover:text-teal-600 cursor-pointer transition-colors">
                <Upload className="w-4 h-4" />
                Välj CSV-fil med kunder
                <input type="file" className="hidden" accept=".csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) setCsvFile(f)
                    // TODO: Parse CSV and populate importedCustomers
                  }}
                />
              </label>
              {csvFile && <p className="text-xs text-teal-600 mt-2">Vald fil: {csvFile.name}</p>}
            </div>

            {/* Imported list */}
            {importedCustomers.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-900 mb-2">{importedCustomers.length} kunder tillagda</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {importedCustomers.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
                      <span className="text-gray-700">{c.name}</span>
                      <span className="text-gray-400">{c.phone}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="px-4 py-3 border border-gray-200 rounded-xl text-gray-600 text-sm">
                <ArrowLeft className="w-4 h-4 inline mr-1" />Tillbaka
              </button>
              <button onClick={async () => { await saveProgress(4); setStep(4) }}
                className="flex-1 py-3 bg-teal-600 text-white rounded-xl font-medium text-sm hover:bg-teal-700">
                {importedCustomers.length > 0 ? 'Fortsätt' : 'Hoppa över — lägg till senare'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: SMS Reactivation Wow ────────────────────── */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Nå dina kunder direkt 🚀</h1>
              <p className="text-gray-500 text-sm">Steg 4 av 4 — din första kampanj</p>
            </div>

            {importedCustomers.length > 0 && !smsDone ? (
              <>
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                  <p className="text-sm text-gray-700 mb-4">
                    Du har precis lagt till <strong>{importedCustomers.length}</strong> kunder.
                    Skicka ett meddelande och se vem som är intresserad!
                  </p>

                  <label className="block text-sm font-medium text-gray-700 mb-2">SMS-text</label>
                  <textarea
                    value={smsText}
                    onChange={e => setSmsText(e.target.value)}
                    rows={3}
                    maxLength={320}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 resize-y"
                  />
                  <p className="text-xs text-gray-400 mt-1">{smsText.length}/320 tecken</p>

                  {/* SMS preview */}
                  <div className="mt-4 bg-gray-50 rounded-xl p-4">
                    <p className="text-xs text-gray-400 mb-2">Förhandsvisning:</p>
                    <div className="bg-teal-600 text-white rounded-2xl rounded-bl-md px-4 py-2.5 text-sm max-w-[85%]">
                      {smsText.replace('[namn]', importedCustomers[0]?.name || 'Kund').replace('[name]', importedCustomers[0]?.name || 'Kund')}
                    </div>
                  </div>

                  {/* Count slider */}
                  <div className="mt-4">
                    <label className="text-sm text-gray-700">
                      Skicka till: <strong>{smsCount || importedCustomers.length}</strong> av {importedCustomers.length}
                    </label>
                    <input type="range" min={1} max={importedCustomers.length}
                      value={smsCount || importedCustomers.length}
                      onChange={e => setSmsCount(parseInt(e.target.value))}
                      className="w-full mt-1 accent-teal-600"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Uppskattad kostnad: {smsCount || importedCustomers.length} × 0,89 kr = {((smsCount || importedCustomers.length) * 0.89).toFixed(0)} kr
                    </p>
                  </div>
                </div>

                {sendingSms && (
                  <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-center">
                    <Loader2 className="w-5 h-5 text-teal-600 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-teal-700">Skickar... {smsSent}/{smsCount || importedCustomers.length}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={completeOnboarding}
                    className="px-4 py-3 border border-gray-200 rounded-xl text-gray-500 text-sm">
                    Hoppa över
                  </button>
                  <button onClick={handleSendSms} disabled={sendingSms || !smsText.trim()}
                    className="flex-1 py-3 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    <Send className="w-4 h-4" />
                    Skicka nu
                  </button>
                </div>
              </>
            ) : smsDone ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm text-center space-y-4">
                <div className="text-5xl">🎉</div>
                <h2 className="text-xl font-bold text-gray-900">{smsSent} SMS skickade!</h2>
                <p className="text-sm text-gray-500">Du får en notis när någon svarar.</p>
                <button onClick={() => router.push('/dashboard')}
                  className="w-full py-3 bg-teal-600 text-white rounded-xl font-semibold hover:bg-teal-700">
                  Gå till Dashboard
                </button>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm text-center space-y-4">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto" />
                <h2 className="text-lg font-semibold text-gray-900">SMS-reaktivering</h2>
                <p className="text-sm text-gray-500">
                  Lägg till kunder och skicka din första kampanj från Marknadsföring → SMS-kampanjer
                </p>
                <button onClick={completeOnboarding}
                  className="w-full py-3 bg-teal-600 text-white rounded-xl font-semibold hover:bg-teal-700">
                  Gå till Dashboard
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
