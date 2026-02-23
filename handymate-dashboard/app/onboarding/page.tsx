'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2,
  Briefcase,
  Phone,
  Calendar,
  Users,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Plus,
  X,
  MapPin,
  Globe,
  Mail,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react'

// ─── Constants ───────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Företag', icon: Building2 },
  { id: 2, label: 'Tjänster', icon: Briefcase },
  { id: 3, label: 'Telefon', icon: Phone },
  { id: 4, label: 'Google', icon: Calendar },
  { id: 5, label: 'Leads', icon: Users },
  { id: 6, label: 'Klar!', icon: CheckCircle2 },
]

const BRANCHES = [
  { value: 'construction', label: 'Bygg' },
  { value: 'electrician', label: 'El' },
  { value: 'plumber', label: 'VVS' },
  { value: 'painter', label: 'Måleri' },
  { value: 'roofing', label: 'Tak' },
  { value: 'flooring', label: 'Golvläggning' },
  { value: 'carpenter', label: 'Snickeri' },
  { value: 'gardening', label: 'Trädgård' },
  { value: 'cleaning', label: 'Städ' },
  { value: 'moving', label: 'Flytt' },
  { value: 'hvac', label: 'Ventilation' },
  { value: 'locksmith', label: 'Låssmed' },
  { value: 'other', label: 'Övrigt' },
]

const BRANCH_SERVICES: Record<string, string[]> = {
  construction: ['Nybyggnation', 'Tillbyggnad', 'Renovering', 'Badrum', 'Kök', 'Fasad', 'Grund', 'Betong'],
  electrician: ['Installation', 'Felsökning', 'Elcentral', 'Belysning', 'Elbilsladdare', 'Jordfelsbrytare', 'Solceller', 'Larm'],
  plumber: ['Vattenledning', 'Avlopp', 'Värmepump', 'Golvvärme', 'Badrumsrenovering', 'Köksrenovering', 'Varmvattenberedare'],
  painter: ['Invändig målning', 'Utvändig målning', 'Tapetsering', 'Fasad', 'Spackling', 'Lackering'],
  roofing: ['Takbyte', 'Takläggning', 'Plåttak', 'Tegelpannor', 'Takfönster', 'Takavvattning'],
  flooring: ['Parkettläggning', 'Laminat', 'Kakel & klinker', 'Vinyl/Plastgolv', 'Golvslipning'],
  carpenter: ['Nybyggnation', 'Tillbyggnad', 'Altan/Trädäck', 'Kök', 'Inredning', 'Möbelsnickeri'],
  gardening: ['Trädgårdsskötsel', 'Häckklippning', 'Gräsklippning', 'Trädfällning', 'Stenläggning', 'Plantering'],
  cleaning: ['Hemstädning', 'Kontorsstädning', 'Flyttstädning', 'Storstädning', 'Fönsterputs', 'Trappstädning'],
  moving: ['Flyttjänst', 'Packning', 'Magasinering', 'Kontorsflytt', 'Pianoflytt'],
  hvac: ['Ventilation', 'Värmepump', 'Golvvärme', 'AC-installation', 'Filterbyte', 'Injustering'],
  locksmith: ['Låsbyte', 'Låsöppning', 'Nyckelkopiering', 'Kodlås', 'Säkerhetsdörr', 'Inbrottsskydd'],
  other: ['Konsultation', 'Reparation', 'Installation', 'Service', 'Underhåll'],
}

const BRANCH_HOURLY_RATE: Record<string, number> = {
  construction: 500, electrician: 550, plumber: 550, painter: 450, roofing: 500,
  flooring: 500, carpenter: 500, gardening: 400, cleaning: 350, moving: 450,
  hvac: 550, locksmith: 600, other: 450,
}

const ROT_BRANCHES = ['construction', 'electrician', 'plumber', 'painter', 'roofing', 'flooring', 'carpenter', 'hvac', 'locksmith']
const RUT_BRANCHES = ['cleaning', 'gardening', 'moving']

const LEAD_PLATFORMS = [
  { id: 'offerta', label: 'Offerta', url: 'offerta.se' },
  { id: 'servicefinder', label: 'ServiceFinder', url: 'servicefinder.se' },
  { id: 'byggahus', label: 'Byggahus.se', url: 'byggahus.se' },
  { id: 'website', label: 'Min hemsida', url: '' },
  { id: 'phone_wom', label: 'Telefon/mun-till-mun', url: '' },
  { id: 'other', label: 'Annat', url: '' },
]

const FORWARDING_INSTRUCTIONS: Record<string, { name: string; activate: string; deactivate: string }> = {
  telia: { name: 'Telia', activate: '**21*{nummer}#', deactivate: '##21#' },
  tele2: { name: 'Tele2', activate: '**21*{nummer}#', deactivate: '##21#' },
  tre: { name: 'Tre/3', activate: '**21*{nummer}#', deactivate: '##21#' },
  telenor: { name: 'Telenor', activate: '**21*{nummer}#', deactivate: '##21#' },
}

// ─── Types ───────────────────────────────────────────────────────────

interface OnboardingData {
  business_id: string
  business_name: string
  contact_name: string
  contact_email: string
  phone_number: string
  branch: string
  service_area: string
  org_number: string
  address: string
  services_offered: string[]
  default_hourly_rate: number
  callout_fee: number
  rot_enabled: boolean
  rut_enabled: boolean
  assigned_phone_number: string | null
  forward_phone_number: string | null
  call_mode: string | null
  phone_setup_type: string | null
  lead_sources: string[]
  lead_email_address: string | null
  knowledge_base: Record<string, unknown> | null
  onboarding_step: number
  onboarding_data: Record<string, unknown>
  onboarding_completed_at: string | null
  working_hours: Record<string, unknown> | null
  industry: string | null
  google_connected: boolean
  gmail_enabled: boolean
}

// ─── Main Component ──────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [data, setData] = useState<OnboardingData | null>(null)

  // Step 1 form
  const [businessName, setBusinessName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [branch, setBranch] = useState('')
  const [orgNumber, setOrgNumber] = useState('')
  const [address, setAddress] = useState('')
  const [serviceArea, setServiceArea] = useState('')

  // Step 2 form
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [customService, setCustomService] = useState('')
  const [hourlyRate, setHourlyRate] = useState(0)
  const [calloutFee, setCalloutFee] = useState(0)
  const [rotEnabled, setRotEnabled] = useState(false)
  const [rutEnabled, setRutEnabled] = useState(false)

  // Step 3 form
  const [phoneSetupType, setPhoneSetupType] = useState<'forwarding' | 'porting' | 'later'>('forwarding')
  const [forwardNumber, setForwardNumber] = useState('')
  const [selectedOperator, setSelectedOperator] = useState('telia')
  const [phoneConnected, setPhoneConnected] = useState(false)

  // Step 4 state
  const [googleConnected, setGoogleConnected] = useState(false)
  const [gmailEnabled, setGmailEnabled] = useState(false)

  // Step 5 form
  const [selectedLeadSources, setSelectedLeadSources] = useState<string[]>([])
  const [leadEmailCopied, setLeadEmailCopied] = useState(false)

  // Step 6 state
  const [completionData, setCompletionData] = useState<Record<string, boolean>>({})

  // Toast
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ show: true, message, type })
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000)
  }

  // ─── Load data ──────────────────────────────────────────────────
  useEffect(() => {
    async function loadOnboarding() {
      try {
        const res = await fetch('/api/onboarding')
        if (!res.ok) {
          router.push('/login')
          return
        }
        const d: OnboardingData = await res.json()
        setData(d)

        // If already completed, go to dashboard
        if (d.onboarding_step >= 7 || d.onboarding_completed_at) {
          router.push('/dashboard')
          return
        }

        // Resume at saved step
        if (d.onboarding_step > 1) {
          setCurrentStep(d.onboarding_step)
        }

        // Pre-fill step 1
        setBusinessName(d.business_name || '')
        setContactName(d.contact_name || '')
        setContactEmail(d.contact_email || '')
        setPhoneNumber(d.phone_number || '')
        setBranch(d.branch || d.industry || '')
        setOrgNumber(d.org_number || '')
        setAddress(d.address || '')
        setServiceArea(d.service_area || '')

        // Pre-fill step 2
        setSelectedServices(d.services_offered || [])
        setHourlyRate(d.default_hourly_rate || 0)
        setCalloutFee(d.callout_fee || 0)
        setRotEnabled(d.rot_enabled || false)
        setRutEnabled(d.rut_enabled || false)

        // Pre-fill step 3
        if (d.assigned_phone_number) {
          setPhoneConnected(true)
          setForwardNumber(d.forward_phone_number || '')
        }

        // Pre-fill step 4
        setGoogleConnected(d.google_connected || false)
        setGmailEnabled(d.gmail_enabled || false)

        // Pre-fill step 5
        setSelectedLeadSources(d.lead_sources || [])
      } catch {
        router.push('/login')
      } finally {
        setLoading(false)
      }
    }
    loadOnboarding()
  }, [router])

  // ─── Save progress ──────────────────────────────────────────────
  const saveProgress = useCallback(async (step: number, stepData?: Record<string, unknown>) => {
    try {
      await fetch('/api/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step, data: stepData }),
      })
    } catch {
      // Silent fail for progress save
    }
  }, [])

  // ─── Step navigation ───────────────────────────────────────────
  async function goToStep(step: number) {
    if (step < 1 || step > 6) return
    setSaving(true)

    // Save current step data before moving
    if (currentStep === 1) {
      await saveStep1()
    } else if (currentStep === 2) {
      await saveStep2()
    }

    await saveProgress(step)
    setCurrentStep(step)
    setSaving(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveStep1() {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: businessName,
          contact_name: contactName,
          contact_email: contactEmail,
          phone_number: phoneNumber,
          branch,
          org_number: orgNumber,
          address,
          service_area: serviceArea,
        }),
      })
      if (!res.ok) {
        // Fallback: use onboarding endpoint
        await saveProgress(2, {
          step1: { businessName, contactName, contactEmail, phoneNumber, branch, orgNumber, address, serviceArea }
        })
      }
    } catch {
      await saveProgress(2, {
        step1: { businessName, contactName, contactEmail, phoneNumber, branch, orgNumber, address, serviceArea }
      })
    }
  }

  async function saveStep2() {
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          services_offered: selectedServices,
          default_hourly_rate: hourlyRate,
          callout_fee: calloutFee,
          rot_enabled: rotEnabled,
          rut_enabled: rutEnabled,
        }),
      })
    } catch {
      // silent
    }
  }

  async function handleFinishOnboarding() {
    setSaving(true)
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: businessName,
          contact_name: contactName,
          contact_email: contactEmail,
          phone_number: phoneNumber,
          branch,
          org_number: orgNumber,
          address,
          service_area: serviceArea,
          services_offered: selectedServices,
          default_hourly_rate: hourlyRate,
          callout_fee: calloutFee,
          rot_enabled: rotEnabled,
          rut_enabled: rutEnabled,
          lead_sources: selectedLeadSources,
        }),
      })
      if (res.ok) {
        router.push('/dashboard')
      } else {
        showToast('Kunde inte slutföra onboarding', 'error')
      }
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Step validation
  function isStep1Valid() {
    return businessName.trim() && contactName.trim() && contactEmail.trim() && phoneNumber.trim()
  }

  // ─── Loading screen ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-100 border-emerald-200 text-emerald-600' : 'bg-red-100 border-red-200 text-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]" />
      </div>

      {/* Header */}
      <div className="relative border-b border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-gray-900">Kom igång med Handymate</h1>
            <span className="text-sm text-gray-400">Steg {currentStep} av 6</span>
          </div>
          {/* Progress bar */}
          <div className="flex gap-1.5">
            {STEPS.map((step) => (
              <div
                key={step.id}
                className={`flex-1 h-2 rounded-full transition-all ${
                  step.id < currentStep
                    ? 'bg-emerald-400'
                    : step.id === currentStep
                    ? 'bg-blue-500'
                    : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
          {/* Step labels */}
          <div className="flex gap-1.5 mt-1.5">
            {STEPS.map((step) => (
              <button
                key={step.id}
                onClick={() => step.id < currentStep && goToStep(step.id)}
                className={`flex-1 text-center text-xs transition-colors ${
                  step.id < currentStep
                    ? 'text-emerald-500 cursor-pointer hover:text-emerald-600'
                    : step.id === currentStep
                    ? 'text-blue-600 font-medium'
                    : 'text-gray-400'
                }`}
              >
                {step.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="relative max-w-3xl mx-auto px-4 py-8">

        {/* ═══════════════ STEG 1: FÖRETAG ═══════════════ */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Ditt företag</h2>
              <p className="text-gray-500 mt-1">Grundläggande information om ditt företag</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
              {/* Företagsnamn */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Företagsnamn *</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ex: Johanssons El AB"
                />
              </div>

              {/* Kontaktperson */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kontaktperson *</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ex: Erik Johansson"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-post *</label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={e => setContactEmail(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="erik@johanssons-el.se"
                  />
                </div>
                {/* Telefon */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefonnummer *</label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="070 123 45 67"
                  />
                </div>
              </div>

              {/* Bransch */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bransch *</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {BRANCHES.map(b => (
                    <button
                      key={b.value}
                      onClick={() => {
                        setBranch(b.value)
                        // Auto-set ROT/RUT
                        setRotEnabled(ROT_BRANCHES.includes(b.value))
                        setRutEnabled(RUT_BRANCHES.includes(b.value))
                        // Auto-set hourly rate if not already set
                        if (!hourlyRate) {
                          setHourlyRate(BRANCH_HOURLY_RATE[b.value] || 450)
                        }
                      }}
                      className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                        branch === b.value
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Org-nummer */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Org.nummer</label>
                  <input
                    type="text"
                    value={orgNumber}
                    onChange={e => setOrgNumber(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="556677-8899"
                  />
                </div>
                {/* Adress */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Adress</label>
                  <input
                    type="text"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Storgatan 1, 123 45 Stad"
                  />
                </div>
              </div>

              {/* Serviceområde */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Serviceområde</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={serviceArea}
                    onChange={e => setServiceArea(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ex: Stockholm, Södertälje, Norrtälje"
                  />
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-end">
              <button
                onClick={() => isStep1Valid() && goToStep(2)}
                disabled={!isStep1Valid() || saving}
                className="flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
                Nästa
                <ChevronRight className="w-5 h-5 ml-1" />
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════ STEG 2: TJÄNSTER & PRISER ═══════════════ */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Vad erbjuder du?</h2>
              <p className="text-gray-500 mt-1">Välj tjänster och ange priser så att AI:n kan ge exakta svar</p>
            </div>

            {/* Tjänster */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <h3 className="font-semibold text-gray-900">Tjänster</h3>
              <p className="text-sm text-gray-500">Välj de tjänster du erbjuder</p>

              <div className="flex flex-wrap gap-2">
                {(BRANCH_SERVICES[branch] || BRANCH_SERVICES.other).map(service => (
                  <button
                    key={service}
                    onClick={() => {
                      setSelectedServices(prev =>
                        prev.includes(service) ? prev.filter(s => s !== service) : [...prev, service]
                      )
                    }}
                    className={`px-3 py-2 rounded-xl text-sm border transition-all ${
                      selectedServices.includes(service)
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {selectedServices.includes(service) && <Check className="w-3.5 h-3.5 inline mr-1" />}
                    {service}
                  </button>
                ))}
              </div>

              {/* Custom service */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customService}
                  onChange={e => setCustomService(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && customService.trim()) {
                      setSelectedServices(prev => [...prev, customService.trim()])
                      setCustomService('')
                    }
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Lägg till egen tjänst..."
                />
                <button
                  onClick={() => {
                    if (customService.trim()) {
                      setSelectedServices(prev => [...prev, customService.trim()])
                      setCustomService('')
                    }
                  }}
                  className="px-3 py-2.5 bg-gray-100 rounded-xl text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Selected list */}
              {selectedServices.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                  {selectedServices.map(s => (
                    <span key={s} className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm">
                      {s}
                      <button onClick={() => setSelectedServices(prev => prev.filter(x => x !== s))}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Priser */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <h3 className="font-semibold text-gray-900">Priser</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timpris (kr/timme)</label>
                  <input
                    type="number"
                    value={hourlyRate || ''}
                    onChange={e => setHourlyRate(Number(e.target.value))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={`Branschsnitt: ${BRANCH_HOURLY_RATE[branch] || 450} kr`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Utryckningsavgift (kr)</label>
                  <input
                    type="number"
                    value={calloutFee || ''}
                    onChange={e => setCalloutFee(Number(e.target.value))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* ROT/RUT */}
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rotEnabled}
                    onChange={e => setRotEnabled(e.target.checked)}
                    className="w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">ROT-avdrag</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rutEnabled}
                    onChange={e => setRutEnabled(e.target.checked)}
                    className="w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">RUT-avdrag</span>
                </label>
              </div>
            </div>

            {/* Serviceområde reminder */}
            {!serviceArea && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <MapPin className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-amber-800 font-medium">Tips: Ange serviceområde</p>
                  <p className="text-sm text-amber-600">AI:n kan då berätta för kunder om du arbetar i deras område.</p>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between">
              <button
                onClick={() => goToStep(1)}
                className="flex items-center px-5 py-3 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                Tillbaka
              </button>
              <button
                onClick={() => goToStep(3)}
                disabled={saving}
                className="flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
                Nästa
                <ChevronRight className="w-5 h-5 ml-1" />
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════ STEG 3: TELEFON ═══════════════ */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Missa aldrig ett samtal</h2>
              <p className="text-gray-500 mt-1">Med Handymate svarar AI:n på dina samtal, bokar tid och tar emot förfrågningar – även när du står på en stege.</p>
            </div>

            {phoneConnected ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  <div>
                    <p className="font-semibold text-emerald-700">Telefonnummer kopplat!</p>
                    <p className="text-sm text-emerald-600">
                      {data?.assigned_phone_number} → vidarebefordras till {data?.forward_phone_number || forwardNumber}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Setup options */}
                <div className="grid gap-3">
                  <button
                    onClick={() => setPhoneSetupType('forwarding')}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                      phoneSetupType === 'forwarding'
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        phoneSetupType === 'forwarding' ? 'bg-blue-100' : 'bg-gray-100'
                      }`}>
                        <Phone className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Vidarekoppling (5 min)</p>
                        <p className="text-sm text-gray-500">Behåll ditt nummer – kopiera samtalen till Handymate</p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setPhoneSetupType('porting')}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                      phoneSetupType === 'porting'
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        phoneSetupType === 'porting' ? 'bg-blue-100' : 'bg-gray-100'
                      }`}>
                        <Phone className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Nummerportering (1-2 veckor)</p>
                        <p className="text-sm text-gray-500">Flytta ditt nummer helt till Handymate</p>
                      </div>
                    </div>
                  </button>
                </div>

                {/* Forwarding setup */}
                {phoneSetupType === 'forwarding' && (
                  <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Ditt mobilnummer</label>
                      <input
                        type="tel"
                        value={forwardNumber}
                        onChange={e => setForwardNumber(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="070 123 45 67"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Din operatör</label>
                      <div className="flex gap-2 flex-wrap">
                        {Object.entries(FORWARDING_INSTRUCTIONS).map(([key, op]) => (
                          <button
                            key={key}
                            onClick={() => setSelectedOperator(key)}
                            className={`px-4 py-2 rounded-xl text-sm border transition-all ${
                              selectedOperator === key
                                ? 'bg-blue-50 border-blue-300 text-blue-700'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                          >
                            {op.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {data?.assigned_phone_number ? (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                        <p className="font-medium text-blue-900">Aktivera vidarekoppling</p>
                        <p className="text-sm text-blue-700">
                          Ring följande kod från din mobiltelefon:
                        </p>
                        <div className="bg-white rounded-lg px-4 py-3 font-mono text-lg text-center border border-blue-200">
                          {FORWARDING_INSTRUCTIONS[selectedOperator]?.activate.replace('{nummer}', data.assigned_phone_number)}
                        </div>
                        <p className="text-xs text-blue-600">
                          För att avaktivera: {FORWARDING_INSTRUCTIONS[selectedOperator]?.deactivate}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">
                        Vi tilldelar dig ett Handymate-nummer i nästa steg. Du kan alltid ställa in vidarekoppling senare under Inställningar → Telefoni.
                      </p>
                    )}
                  </div>
                )}

                {/* Porting info */}
                {phoneSetupType === 'porting' && (
                  <div className="bg-white rounded-2xl border border-gray-200 p-6">
                    <p className="text-gray-600 text-sm">
                      Nummerportering tar 1-2 veckor att genomföra. Vi kontaktar dig när det är klart.
                      Under tiden kan du fortsätta med vidarekoppling.
                    </p>
                    <p className="text-gray-500 text-sm mt-2">
                      Du kan påbörja portering senare under Inställningar → Telefoni.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Navigation */}
            <div className="flex justify-between">
              <button
                onClick={() => goToStep(2)}
                className="flex items-center px-5 py-3 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                Tillbaka
              </button>
              <div className="flex gap-3">
                {!phoneConnected && (
                  <button
                    onClick={() => goToStep(4)}
                    className="flex items-center px-5 py-3 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
                  >
                    Hoppa över
                  </button>
                )}
                <button
                  onClick={() => goToStep(4)}
                  disabled={saving}
                  className="flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
                  Nästa
                  <ChevronRight className="w-5 h-5 ml-1" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════ STEG 4: GOOGLE ═══════════════ */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Synka kalender & email</h2>
              <p className="text-gray-500 mt-1">Koppla Google för att hålla allt synkroniserat</p>
            </div>

            {/* Google Calendar */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-red-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Google Calendar</h3>
                  <p className="text-sm text-gray-500">Synka dina bokningar med Google Calendar</p>
                </div>
                {googleConnected && (
                  <span className="flex items-center gap-1 text-sm text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
                    <CheckCircle2 className="w-4 h-4" /> Kopplad
                  </span>
                )}
              </div>

              {!googleConnected && (
                <a
                  href="/api/google/connect"
                  className="inline-flex items-center px-5 py-3 bg-white border-2 border-gray-200 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Koppla Google Calendar
                </a>
              )}
            </div>

            {/* Gmail */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-blue-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Gmail</h3>
                  <p className="text-sm text-gray-500">Se all email-historik med dina kunder direkt i Handymate</p>
                </div>
                {gmailEnabled && (
                  <span className="flex items-center gap-1 text-sm text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
                    <CheckCircle2 className="w-4 h-4" /> Aktiverad
                  </span>
                )}
              </div>

              {!gmailEnabled && googleConnected && (
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/google/gmail-toggle', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ enabled: true }),
                      })
                      if (res.ok) {
                        setGmailEnabled(true)
                        showToast('Gmail aktiverad!')
                      }
                    } catch {
                      showToast('Kunde inte aktivera Gmail', 'error')
                    }
                  }}
                  className="inline-flex items-center px-5 py-3 bg-blue-50 border border-blue-200 rounded-xl font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  Aktivera Gmail-synk
                </button>
              )}

              {!googleConnected && (
                <p className="text-sm text-gray-500">Koppla Google Calendar först för att aktivera Gmail-synk.</p>
              )}
            </div>

            {!googleConnected && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm text-amber-800">
                  Utan Google-koppling kan vi inte synka bokningar eller visa email-historik. Du kan alltid koppla senare under Inställningar → Integrationer.
                </p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between">
              <button
                onClick={() => goToStep(3)}
                className="flex items-center px-5 py-3 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                Tillbaka
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => goToStep(5)}
                  className="flex items-center px-5 py-3 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  Hoppa över
                </button>
                <button
                  onClick={() => goToStep(5)}
                  disabled={saving}
                  className="flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
                  Nästa
                  <ChevronRight className="w-5 h-5 ml-1" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════ STEG 5: LEAD-KÄLLOR ═══════════════ */}
        {currentStep === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Få in fler kunder automatiskt</h2>
              <p className="text-gray-500 mt-1">Handymate kan automatiskt ta emot förfrågningar från plattformar du redan använder.</p>
            </div>

            {/* Platform selection */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <h3 className="font-semibold text-gray-900">Var får du kunder ifrån idag?</h3>

              <div className="grid gap-2">
                {LEAD_PLATFORMS.map(platform => (
                  <button
                    key={platform.id}
                    onClick={() => {
                      setSelectedLeadSources(prev =>
                        prev.includes(platform.id) ? prev.filter(s => s !== platform.id) : [...prev, platform.id]
                      )
                    }}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                      selectedLeadSources.includes(platform.id)
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedLeadSources.includes(platform.id) ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                    }`}>
                      {selectedLeadSources.includes(platform.id) && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{platform.label}</p>
                      {platform.url && <p className="text-xs text-gray-500">{platform.url}</p>}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Setup instructions for selected platforms */}
            {selectedLeadSources.some(s => ['offerta', 'servicefinder', 'byggahus'].includes(s)) && data?.lead_email_address && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
                <h3 className="font-semibold text-gray-900">Koppla dina lead-plattformar</h3>
                <p className="text-sm text-gray-500">
                  Lägg till denna email-adress i dina valda plattformar för att automatiskt ta emot förfrågningar:
                </p>
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-3">
                  <code className="flex-1 text-sm font-mono text-gray-700">{data.lead_email_address}</code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(data.lead_email_address || '')
                      setLeadEmailCopied(true)
                      setTimeout(() => setLeadEmailCopied(false), 2000)
                    }}
                    className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    {leadEmailCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                {selectedLeadSources.includes('offerta') && (
                  <div className="border-t border-gray-100 pt-3">
                    <p className="text-sm font-medium text-gray-700 mb-1">Offerta.se</p>
                    <ol className="text-sm text-gray-500 space-y-1 list-decimal list-inside">
                      <li>Logga in på offerta.se</li>
                      <li>Gå till Inställningar → Notifikationer</li>
                      <li>Lägg till email-adressen ovan som mottagare</li>
                    </ol>
                  </div>
                )}

                {selectedLeadSources.includes('servicefinder') && (
                  <div className="border-t border-gray-100 pt-3">
                    <p className="text-sm font-medium text-gray-700 mb-1">ServiceFinder.se</p>
                    <ol className="text-sm text-gray-500 space-y-1 list-decimal list-inside">
                      <li>Logga in på servicefinder.se</li>
                      <li>Gå till Mitt konto → E-postinställningar</li>
                      <li>Lägg till email-adressen ovan</li>
                    </ol>
                  </div>
                )}
              </div>
            )}

            {/* Website widget */}
            {selectedLeadSources.includes('website') && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-blue-500" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Hemsida-widget</h3>
                    <p className="text-sm text-gray-500">Lägg till en AI-chatbot på din hemsida som svarar på frågor och samlar leads</p>
                  </div>
                </div>
                <a
                  href="/dashboard/settings/website-widget"
                  target="_blank"
                  className="inline-flex items-center px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  Aktivera widget
                  <ExternalLink className="w-4 h-4 ml-1.5" />
                </a>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between">
              <button
                onClick={() => goToStep(4)}
                className="flex items-center px-5 py-3 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                Tillbaka
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => goToStep(6)}
                  className="flex items-center px-5 py-3 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  Hoppa över
                </button>
                <button
                  onClick={() => goToStep(6)}
                  disabled={saving}
                  className="flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
                  Nästa
                  <ChevronRight className="w-5 h-5 ml-1" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════ STEG 6: KLAR! ═══════════════ */}
        {currentStep === 6 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Du är redo!</h2>
              <p className="text-gray-500 mt-1">Här är en sammanfattning av din konfiguration</p>
            </div>

            {/* Summary */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3">
              <SummaryItem done={true} label="Företagsprofil klar" detail={businessName} />
              <SummaryItem
                done={selectedServices.length > 0}
                label={selectedServices.length > 0 ? `${selectedServices.length} tjänster konfigurerade` : 'Tjänster ej konfigurerade'}
                action={selectedServices.length === 0 ? () => goToStep(2) : undefined}
              />
              <SummaryItem
                done={phoneConnected}
                label={phoneConnected ? 'Telefon kopplad' : 'Telefon – ej kopplad'}
                detail={phoneConnected ? (data?.assigned_phone_number || '') : undefined}
                action={!phoneConnected ? () => goToStep(3) : undefined}
              />
              <SummaryItem
                done={googleConnected}
                label={googleConnected ? 'Google Calendar synkad' : 'Google Calendar – ej kopplad'}
                action={!googleConnected ? () => goToStep(4) : undefined}
              />
              <SummaryItem
                done={gmailEnabled}
                label={gmailEnabled ? 'Gmail aktiverad' : 'Gmail – ej aktiverad'}
                action={!gmailEnabled ? () => goToStep(4) : undefined}
              />
              <SummaryItem
                done={selectedLeadSources.length > 0}
                label={selectedLeadSources.length > 0 ? `${selectedLeadSources.length} lead-källa aktiv` : 'Lead-källor – ej konfigurerade'}
                action={selectedLeadSources.length === 0 ? () => goToStep(5) : undefined}
              />
            </div>

            {/* Next steps */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Nästa steg</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <NextStepCard
                  icon={Phone}
                  title="Testa AI:n"
                  description="Ring ditt nummer och prata med AI:n"
                  href={data?.assigned_phone_number ? `tel:${data.assigned_phone_number}` : undefined}
                  cta="Testa nu"
                />
                <NextStepCard
                  icon={Users}
                  title="Lägg till kund"
                  description="Skapa din första kund och deal"
                  href="/dashboard/customers"
                  cta="Skapa kund"
                />
                <NextStepCard
                  icon={Building2}
                  title="Se din pipeline"
                  description="Se hur leads flödar in"
                  href="/dashboard/pipeline"
                  cta="Gå till"
                />
              </div>
            </div>

            {/* Final button */}
            <div className="flex justify-center pt-4">
              <button
                onClick={handleFinishOnboarding}
                disabled={saving}
                className="flex items-center px-8 py-4 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-semibold text-white text-lg hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-blue-500/25"
              >
                {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
                Gå till dashboard
                <ChevronRight className="w-5 h-5 ml-1" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────

function SummaryItem({ done, label, detail, action }: {
  done: boolean
  label: string
  detail?: string
  action?: () => void
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      {done ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
      ) : (
        <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
      )}
      <div className="flex-1">
        <span className={done ? 'text-gray-900' : 'text-gray-500'}>{label}</span>
        {detail && <span className="text-sm text-gray-400 ml-2">{detail}</span>}
      </div>
      {action && (
        <button
          onClick={action}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          Aktivera
        </button>
      )}
    </div>
  )
}

function NextStepCard({ icon: Icon, title, description, href, cta }: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  href?: string
  cta: string
}) {
  const content = (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-blue-200 hover:shadow-sm transition-all h-full flex flex-col">
      <Icon className="w-6 h-6 text-blue-500 mb-3" />
      <h4 className="font-semibold text-gray-900 mb-1">{title}</h4>
      <p className="text-sm text-gray-500 flex-1">{description}</p>
      <span className="text-sm text-blue-600 font-medium mt-3 flex items-center">
        {cta} <ChevronRight className="w-4 h-4 ml-0.5" />
      </span>
    </div>
  )

  if (href) {
    return <a href={href} target={href.startsWith('tel:') ? undefined : '_blank'}>{content}</a>
  }
  return content
}
