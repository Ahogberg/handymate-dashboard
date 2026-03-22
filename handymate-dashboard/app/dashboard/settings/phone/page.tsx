'use client'

import { useEffect, useState, useRef } from 'react'
import {
  Phone,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  AlertCircle,
  ChevronRight,
  PhoneForwarded,
  RefreshCw,
  Mic,
  Bot,
  MessageSquare,
  Shield,
  Settings,
  XCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'

interface PhoneConfig {
  assigned_phone_number: string | null
  forward_phone_number: string | null
  call_recording_enabled: boolean
  call_recording_consent_message: string | null
  phone_setup_type: string | null
  forwarding_confirmed: boolean
  elks_number_id: string | null
}

interface CallStats {
  weekCount: number
  lastCall: string | null
}

const OPERATORS = [
  { id: 'telia', name: 'Telia' },
  { id: 'tele2', name: 'Tele2' },
  { id: 'tre', name: 'Tre' },
  { id: 'telenor', name: 'Telenor' },
  { id: 'other', name: 'Annan' },
]

const DEFAULT_CONSENT_MESSAGE = 'Detta samtal kan komma att spelas in för kvalitetssäkring.'
const DEFAULT_MISSED_SMS = 'Hej! Vi såg att du ringde. Vi återkommer så snart vi kan.'

export default function PhoneSettingsPage() {
  const business = useBusiness()
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<PhoneConfig | null>(null)
  const [callStats, setCallStats] = useState<CallStats>({ weekCount: 0, lastCall: null })

  // Wizard state
  const [step, setStep] = useState(0) // 0=method, 1=number, 2=instructions, 3=verify
  const [method, setMethod] = useState<'forwarding' | 'porting' | null>(null)
  const [operator, setOperator] = useState('telia')
  const [forwardNumber, setForwardNumber] = useState('')
  const [provisioning, setProvisioning] = useState(false)
  const [provisionError, setProvisionError] = useState('')

  // Verification
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<any>(null)
  const [verifySeconds, setVerifySeconds] = useState(0)
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Porting form
  const [portOperator, setPortOperator] = useState('')
  const [portPhone, setPortPhone] = useState('')
  const [portDate, setPortDate] = useState('')
  const [portSubmitted, setPortSubmitted] = useState(false)
  const [portSubmitting, setPortSubmitting] = useState(false)

  // Settings
  const [recordingEnabled, setRecordingEnabled] = useState(true)
  const [consentMessage, setConsentMessage] = useState(DEFAULT_CONSENT_MESSAGE)
  const [missedSmsEnabled, setMissedSmsEnabled] = useState(true)
  const [missedSmsText, setMissedSmsText] = useState(DEFAULT_MISSED_SMS)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [smsLogs, setSmsLogs] = useState<any[]>([])
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

  useEffect(() => {
    fetchConfig()
  }, [business.business_id])

  async function fetchConfig() {
    const { data } = await supabase
      .from('business_config')
      .select('assigned_phone_number, forward_phone_number, call_recording_enabled, call_recording_consent_message, phone_setup_type, forwarding_confirmed, elks_number_id')
      .eq('business_id', business.business_id)
      .single()

    if (data) {
      setConfig(data as PhoneConfig)
      setRecordingEnabled(data.call_recording_enabled ?? true)
      setConsentMessage(data.call_recording_consent_message || DEFAULT_CONSENT_MESSAGE)
      if (data.forward_phone_number) setForwardNumber(data.forward_phone_number)
    }

    // Call stats
    if (data?.assigned_phone_number) {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { count } = await supabase
        .from('call_recording')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', business.business_id)
        .gte('created_at', weekAgo)

      const { data: lastCallData } = await supabase
        .from('call_recording')
        .select('created_at')
        .eq('business_id', business.business_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      setCallStats({
        weekCount: count || 0,
        lastCall: lastCallData?.created_at || null,
      })
    }

    setLoading(false)
  }

  // ── Provision number ──────────────────────────────────────────────
  async function provisionNumber() {
    if (!forwardNumber.trim()) {
      setProvisionError('Ange ditt mobilnummer')
      return
    }
    setProvisioning(true)
    setProvisionError('')

    try {
      const res = await fetch('/api/phone/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forward_phone_number: forwardNumber.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setProvisionError(data.error || 'Kunde inte tilldela nummer. Kontakta Handymate-teamet.')
        setProvisioning(false)
        return
      }
      // Refresh config
      await fetchConfig()
      setStep(2)
    } catch {
      setProvisionError('Något gick fel. Kontakta Handymate-teamet.')
    }
    setProvisioning(false)
  }

  // ── Verification polling ──────────────────────────────────────────
  function startVerification() {
    setVerifying(true)
    setVerifyResult(null)
    setVerifySeconds(0)

    const startTime = Date.now()

    // Poll every 5 seconds
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/voice/latest')
        const data = await res.json()
        if (data.found) {
          stopVerification()
          setVerifyResult(data.call)
          // Mark forwarding as confirmed
          await supabase
            .from('business_config')
            .update({ forwarding_confirmed: true, phone_setup_type: 'keep_existing' })
            .eq('business_id', business.business_id)
          await fetchConfig()
        }
      } catch { /* silent */ }

      // Stop after 2 minutes
      if (Date.now() - startTime > 120000) {
        stopVerification()
      }
    }, 5000)

    // Timer
    timerRef.current = setInterval(() => {
      setVerifySeconds(prev => prev + 1)
    }, 1000)
  }

  function stopVerification() {
    if (pollRef.current) clearInterval(pollRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
    setVerifying(false)
  }

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // ── Submit porting request ────────────────────────────────────────
  async function submitPortingRequest() {
    if (!portOperator || !portPhone) return
    setPortSubmitting(true)

    try {
      // Create a notification for admin
      await supabase.from('notification').insert({
        business_id: business.business_id,
        type: 'porting_request',
        title: 'Nummerportering begärd',
        message: `Operatör: ${portOperator}, Nummer: ${portPhone}, Önskat datum: ${portDate || 'Snarast'}`,
        icon: 'phone',
        is_read: false,
      })

      await supabase
        .from('business_config')
        .update({ phone_setup_type: 'porting' })
        .eq('business_id', business.business_id)

      setPortSubmitted(true)
    } catch { /* silent */ }
    setPortSubmitting(false)
  }

  // ── Save settings ─────────────────────────────────────────────────
  async function syncWebhooks() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/phone/settings', { method: 'POST' })
      if (res.ok) {
        setSyncMsg({ text: 'Telefonikoppling uppdaterad!', ok: true })
      } else {
        const data = await res.json()
        setSyncMsg({ text: data.error || 'Synkfel', ok: false })
      }
    } catch {
      setSyncMsg({ text: 'Nätverksfel', ok: false })
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 5000)
    }
  }

  async function sendTestSms() {
    const testPhone = config?.forward_phone_number
    if (!testPhone) {
      setSyncMsg({ text: 'Inget telefonnummer att skicka till', ok: false })
      setTimeout(() => setSyncMsg(null), 5000)
      return
    }
    setSendingTest(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: testPhone,
          message: `Test från Handymate! Om du ser detta fungerar SMS-webhook korrekt. ${new Date().toLocaleTimeString('sv-SE')}`,
        }),
      })
      if (res.ok) {
        setSyncMsg({ text: `Test-SMS skickat till ${testPhone}`, ok: true })
      } else {
        const data = await res.json()
        setSyncMsg({ text: data.error || 'Kunde inte skicka test-SMS', ok: false })
      }
    } catch {
      setSyncMsg({ text: 'Nätverksfel', ok: false })
    } finally {
      setSendingTest(false)
      setTimeout(() => setSyncMsg(null), 8000)
    }
  }

  async function saveSettings() {
    setSaving(true)
    setSaveMsg('')

    try {
      const res = await fetch('/api/phone/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_recording_enabled: recordingEnabled,
          call_recording_consent_message: consentMessage,
        }),
      })
      if (res.ok) {
        setSaveMsg('Sparat!')
        setTimeout(() => setSaveMsg(''), 2000)
      }
    } catch { /* silent */ }
    setSaving(false)
  }

  // ── Helpers ───────────────────────────────────────────────────────
  const formatPhone = (phone: string) => {
    if (!phone) return ''
    // Format Swedish numbers nicely
    const clean = phone.replace(/\D/g, '')
    if (clean.startsWith('46') && clean.length >= 11) {
      return `0${clean.slice(2, 4)}-${clean.slice(4, 7)} ${clean.slice(7, 9)} ${clean.slice(9)}`
    }
    return phone
  }

  const isActive = config?.assigned_phone_number && config?.forwarding_confirmed
  const hasNumber = !!config?.assigned_phone_number
  const isPendingVerify = hasNumber && !config?.forwarding_confirmed

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-2 bg-teal-600 rounded-xl">
              <Phone className="w-6 h-6 text-white" />
            </div>
            Koppla ditt telefonnummer
          </h1>
          <p className="text-gray-500 mt-2">
            Låt Handymate ta hand om dina samtal – automatiskt.
          </p>
        </div>

        {/* Status indicator */}
        <div className={`rounded-xl border p-4 mb-8 ${
          isActive
            ? 'bg-emerald-50 border-emerald-200'
            : isPendingVerify
              ? 'bg-amber-50 border-amber-200'
              : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ${
              isActive ? 'bg-emerald-500' : isPendingVerify ? 'bg-amber-500' : 'bg-red-500'
            }`} />
            <div className="flex-1">
              {isActive ? (
                <>
                  <p className="font-semibold text-emerald-800">Aktivt</p>
                  <p className="text-sm text-emerald-700">Ditt nummer är kopplat! Samtal spelas in och analyseras automatiskt.</p>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm">
                    <div>
                      <span className="text-emerald-600">Handymate-nummer:</span>{' '}
                      <span className="font-mono font-bold text-emerald-800">{formatPhone(config!.assigned_phone_number!)}</span>
                    </div>
                    <div>
                      <span className="text-emerald-600">Samtal denna vecka:</span>{' '}
                      <span className="font-bold text-emerald-800">{callStats.weekCount}</span>
                    </div>
                    {callStats.lastCall && (
                      <div>
                        <span className="text-emerald-600">Senaste samtal:</span>{' '}
                        <span className="font-bold text-emerald-800">
                          {new Date(callStats.lastCall).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                  </div>
                </>
              ) : isPendingVerify ? (
                <>
                  <p className="font-semibold text-amber-800">Väntar på verifiering</p>
                  <p className="text-sm text-amber-700">
                    Ditt nummer <span className="font-mono font-bold">{formatPhone(config!.assigned_phone_number!)}</span> är tilldelat.
                    Slutför steg 3–4 nedan för att verifiera kopplingen.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-red-800">Ej kopplat</p>
                  <p className="text-sm text-red-700">Ditt nummer är inte kopplat ännu. Följ guiden nedan.</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ═══ WIZARD (show when not fully active) ═══ */}
        {!isActive && (
          <div className="space-y-6 mb-10">
            {/* Stepper */}
            {method === 'forwarding' && (
              <div className="flex items-center gap-2 mb-2">
                {['Metod', 'Nummer', 'Koppling', 'Verifiera'].map((label, i) => (
                  <div key={label} className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      step > i ? 'bg-emerald-500 text-white' :
                      step === i ? 'bg-teal-600 text-white' :
                      'bg-gray-200 text-gray-500'
                    }`}>
                      {step > i ? <Check className="w-4 h-4" /> : i + 1}
                    </div>
                    <span className={`text-xs hidden sm:inline ${step === i ? 'text-sky-700 font-medium' : 'text-gray-400'}`}>{label}</span>
                    {i < 3 && <ChevronRight className="w-4 h-4 text-gray-300" />}
                  </div>
                ))}
              </div>
            )}

            {/* Step 0: Choose method */}
            {step === 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Steg 1: Välj kopplingsmetod</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Forwarding card */}
                  <button
                    onClick={() => { setMethod('forwarding'); setStep(1) }}
                    className="text-left p-5 bg-white rounded-xl border-2 border-gray-200 hover:border-teal-400 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <PhoneForwarded className="w-6 h-6 text-teal-600" />
                      <h3 className="font-semibold text-gray-900">Vidarekoppling</h3>
                    </div>
                    <p className="text-xs text-sky-700 font-medium mb-3">Snabbaste – 5 minuter</p>
                    <p className="text-sm text-gray-600 mb-4">
                      Ditt befintliga nummer kopplar vidare samtal till Handymate.
                    </p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-center gap-2 text-gray-700">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        Behåll ditt nummer
                      </div>
                      <div className="flex items-center gap-2 text-gray-700">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        Klart på 5 minuter
                      </div>
                      <div className="flex items-center gap-2 text-gray-700">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        Ingen operatörskontakt
                      </div>
                      <div className="flex items-center gap-2 text-amber-600">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        Liten extra kostnad per samtal
                      </div>
                    </div>
                    <div className="mt-4 text-sky-700 font-medium text-sm flex items-center gap-1 group-hover:gap-2 transition-all">
                      Välj vidarekoppling <ArrowRight className="w-4 h-4" />
                    </div>
                  </button>

                  {/* Porting card */}
                  <button
                    onClick={() => { setMethod('porting'); setStep(1) }}
                    className="text-left p-5 bg-white rounded-xl border-2 border-gray-200 hover:border-purple-400 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <RefreshCw className="w-6 h-6 text-purple-500" />
                      <h3 className="font-semibold text-gray-900">Nummerportering</h3>
                    </div>
                    <p className="text-xs text-purple-600 font-medium mb-3">Bäst – 1-2 veckor</p>
                    <p className="text-sm text-gray-600 mb-4">
                      Ditt nummer flyttas till Handymate. Samma nummer, full kontroll.
                    </p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-center gap-2 text-gray-700">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        Behåll ditt nummer
                      </div>
                      <div className="flex items-center gap-2 text-gray-700">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        Bäst samtalskvalitet
                      </div>
                      <div className="flex items-center gap-2 text-gray-700">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        Inga extra kostnader
                      </div>
                      <div className="flex items-center gap-2 text-amber-600">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        Tar 1-2 veckor
                      </div>
                    </div>
                    <div className="mt-4 text-purple-600 font-medium text-sm flex items-center gap-1 group-hover:gap-2 transition-all">
                      Välj nummerportering <ArrowRight className="w-4 h-4" />
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* ── FORWARDING PATH ── */}

            {/* Step 1: Your number + forward number */}
            {method === 'forwarding' && step === 1 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Steg 2: Ditt Handymate-nummer</h2>

                {hasNumber ? (
                  <div className="mb-6">
                    <p className="text-sm text-gray-600 mb-3">Vi har tilldelat dig numret:</p>
                    <div className="text-2xl font-mono font-bold text-sky-700 bg-teal-50 border border-teal-200 rounded-lg px-4 py-3 inline-block">
                      {formatPhone(config!.assigned_phone_number!)}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">Alla samtal till detta nummer spelas in och analyseras av vår AI.</p>
                    <button onClick={() => setStep(2)} className="mt-4 px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium text-sm">
                      Fortsätt
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-600 mb-4">
                      Ange ditt mobilnummer som Handymate ska vidarekoppla samtal till:
                    </p>
                    <div className="flex gap-3 items-end">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Ditt mobilnummer</label>
                        <input
                          type="tel"
                          value={forwardNumber}
                          onChange={(e) => setForwardNumber(e.target.value)}
                          placeholder="070-123 45 67"
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        />
                      </div>
                      <button
                        onClick={provisionNumber}
                        disabled={provisioning}
                        className="px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium text-sm disabled:opacity-50 flex items-center gap-2"
                      >
                        {provisioning && <Loader2 className="w-4 h-4 animate-spin" />}
                        Tilldela nummer
                      </button>
                    </div>
                    {provisionError && (
                      <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                        <XCircle className="w-4 h-4" /> {provisionError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Forwarding instructions */}
            {method === 'forwarding' && step === 2 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Steg 3: Ställ in vidarekoppling</h2>

                {/* Operator selector */}
                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Välj din operatör:</label>
                  <div className="flex flex-wrap gap-2">
                    {OPERATORS.map(op => (
                      <button
                        key={op.id}
                        onClick={() => setOperator(op.id)}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                          operator === op.id
                            ? 'bg-teal-600 text-white border-teal-500'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-teal-300'
                        }`}
                      >
                        {op.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Instructions */}
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-3">
                    Vidarekoppla alla samtal ({OPERATORS.find(o => o.id === operator)?.name})
                  </h3>
                  <ol className="space-y-3">
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
                      <span className="text-sm text-gray-700">Öppna din telefons uppringare</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
                      <div>
                        <span className="text-sm text-gray-700">Slå: </span>
                        <code className="bg-teal-50 border border-teal-200 rounded px-2 py-0.5 text-teal-800 font-mono font-bold text-base">
                          **21*{config?.assigned_phone_number?.replace('+', '') || 'NUMMER'}#
                        </code>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</span>
                      <span className="text-sm text-gray-700">Tryck ring <Check className="w-4 h-4 text-emerald-500 inline" /></span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">4</span>
                      <span className="text-sm text-gray-700">Du hör en bekräftelseton — klart!</span>
                    </li>
                  </ol>

                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-xs text-gray-500 mb-2">
                      <strong>Vill du stänga av?</strong> Slå <code className="bg-gray-100 rounded px-1.5 py-0.5 font-mono text-gray-700">##21#</code> och tryck ring.
                    </p>
                  </div>
                </div>

                {/* Alternative: only when busy/no answer */}
                <details className="mt-5 group">
                  <summary className="cursor-pointer text-sm font-medium text-sky-700 hover:text-teal-600 flex items-center gap-1">
                    <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
                    Alternativ: Bara vid upptaget eller inget svar
                  </summary>
                  <div className="mt-3 bg-teal-50/50 rounded-lg border border-teal-100 p-4 text-sm text-gray-700">
                    <p className="mb-3">
                      Om du vill svara själv när du kan, och bara låta Handymate ta över när du inte svarar:
                    </p>
                    <div className="space-y-2 font-mono text-sm">
                      <p>
                        <strong>Vid inget svar</strong> (efter 15 sek):{' '}
                        <code className="bg-white border rounded px-1.5 py-0.5 text-teal-800">**61*{config?.assigned_phone_number?.replace('+', '') || 'NUMMER'}#</code>
                      </p>
                      <p>
                        <strong>Vid upptaget:</strong>{' '}
                        <code className="bg-white border rounded px-1.5 py-0.5 text-teal-800">**67*{config?.assigned_phone_number?.replace('+', '') || 'NUMMER'}#</code>
                      </p>
                      <p>
                        <strong>Båda:</strong>{' '}
                        <code className="bg-white border rounded px-1.5 py-0.5 text-teal-800">**62*{config?.assigned_phone_number?.replace('+', '') || 'NUMMER'}#</code>
                      </p>
                    </div>
                    <p className="mt-3 text-gray-500 text-xs">
                      Perfekt om du vill svara på plats men låta AI:n ta hand om samtal du missar.
                    </p>
                  </div>
                </details>

                <button
                  onClick={() => setStep(3)}
                  className="mt-6 px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium text-sm"
                >
                  Jag har slagit koden — verifiera
                </button>
              </div>
            )}

            {/* Step 3: Verify */}
            {method === 'forwarding' && step === 3 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Steg 4: Verifiera</h2>
                <p className="text-sm text-gray-600 mb-5">
                  Ring ditt eget nummer från en annan telefon. Om allt fungerar ser du samtalet dyka upp här inom 30 sekunder.
                </p>

                {verifyResult ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                      <span className="font-semibold text-emerald-800 text-lg">Samtal mottaget!</span>
                    </div>
                    <div className="space-y-1 text-sm text-emerald-700">
                      <p>Från: <span className="font-mono font-bold">{formatPhone(verifyResult.from)}</span></p>
                      <p>Längd: <span className="font-bold">{verifyResult.duration} sekunder</span></p>
                      <p>Status: <span className="font-bold">Inspelat och analyserat</span></p>
                    </div>
                    <p className="mt-4 text-emerald-800 font-semibold">
                      Ditt nummer är nu kopplat till Handymate!
                    </p>
                    <Link
                      href="/dashboard"
                      className="mt-4 inline-block px-6 py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors font-medium text-sm"
                    >
                      Gå till dashboard
                    </Link>
                  </div>
                ) : verifying ? (
                  <div className="bg-teal-50 border border-teal-200 rounded-lg p-5 text-center">
                    <Loader2 className="w-8 h-8 text-teal-600 animate-spin mx-auto mb-3" />
                    <p className="text-teal-800 font-medium">Väntar på testsamtal...</p>
                    <p className="text-sm text-sky-700 mt-1">
                      {verifySeconds < 120
                        ? `${Math.floor((120 - verifySeconds) / 60)}:${String((120 - verifySeconds) % 60).padStart(2, '0')} kvar`
                        : 'Tiden gick ut'
                      }
                    </p>
                    <button
                      onClick={stopVerification}
                      className="mt-3 text-sm text-teal-600 hover:text-teal-700 underline"
                    >
                      Avbryt
                    </button>
                  </div>
                ) : (
                  <div className="text-center">
                    <button
                      onClick={startVerification}
                      className="px-8 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium flex items-center gap-2 mx-auto"
                    >
                      <Phone className="w-5 h-5" />
                      Starta verifiering
                    </button>
                    <p className="text-xs text-gray-400 mt-2">Lyssnar i 2 minuter efter att du startar.</p>
                  </div>
                )}
              </div>
            )}

            {/* ── PORTING PATH ── */}
            {method === 'porting' && step === 1 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Steg 2: Begär nummerportering</h2>
                <p className="text-sm text-gray-600 mb-5">
                  Nummerportering kräver att vi skickar en begäran till din operatör. Vi hjälper dig genom processen.
                </p>

                {portSubmitted ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      <span className="font-semibold text-emerald-800">Begäran skickad!</span>
                    </div>
                    <p className="text-sm text-emerald-700">Vi återkommer inom 1 arbetsdag med nästa steg.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nuvarande operatör</label>
                      <select
                        value={portOperator}
                        onChange={(e) => setPortOperator(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      >
                        <option value="">Välj operatör...</option>
                        {OPERATORS.map(op => (
                          <option key={op.id} value={op.name}>{op.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Telefonnummer att portera</label>
                      <input
                        type="tel"
                        value={portPhone}
                        onChange={(e) => setPortPhone(e.target.value)}
                        placeholder="070-123 45 67"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Önskat startdatum (valfritt)</label>
                      <input
                        type="date"
                        value={portDate}
                        onChange={(e) => setPortDate(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <button
                      onClick={submitPortingRequest}
                      disabled={!portOperator || !portPhone || portSubmitting}
                      className="px-6 py-2.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors font-medium text-sm disabled:opacity-50 flex items-center gap-2"
                    >
                      {portSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                      Skicka begäran
                    </button>
                  </div>
                )}

                <button
                  onClick={() => { setMethod(null); setStep(0) }}
                  className="mt-4 text-sm text-gray-500 hover:text-gray-700 underline"
                >
                  ← Tillbaka till val av metod
                </button>
              </div>
            )}

            {/* Back button for forwarding steps */}
            {method === 'forwarding' && step > 0 && !verifyResult && (
              <button
                onClick={() => setStep(step - 1 < 0 ? 0 : step - 1)}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                ← Tillbaka
              </button>
            )}
          </div>
        )}

        {/* ═══ CALL FLOW EXPLANATION ═══ */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">Vad händer med dina samtal?</h2>

          {/* Visual flow */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-0 mb-6">
            {[
              { icon: Phone, label: 'Kund ringer', color: 'blue' },
              { icon: PhoneForwarded, label: 'Ditt nummer', color: 'cyan' },
              { icon: Mic, label: 'Handymate spelar in', color: 'purple' },
              { icon: Bot, label: 'AI analyserar & agerar', color: 'emerald' },
            ].map((item, i) => (
              <div key={item.label} className="flex items-center gap-0">
                <div className="flex flex-col items-center w-24 sm:w-28">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-${item.color}-100 border border-${item.color}-200`}>
                    <item.icon className={`w-5 h-5 text-${item.color}-600`} />
                  </div>
                  <span className="text-xs text-gray-600 mt-2 text-center leading-tight">{item.label}</span>
                </div>
                {i < 3 && <ArrowRight className="w-4 h-4 text-gray-300 hidden sm:block mt-[-16px]" />}
              </div>
            ))}
          </div>

          <p className="text-sm text-gray-600 mb-4">
            Dina kunder märker ingen skillnad. Du svarar som vanligt. Men i bakgrunden:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              'Samtalet spelas in (med meddelande till uppringaren)',
              'AI transkriberar och analyserar samtalet',
              'Bokningsförslag, offertförslag och uppföljningar skapas automatiskt',
              'Missade samtal loggas och kunden får SMS',
              'Nya leads skapas automatiskt i din pipeline',
            ].map(text => (
              <div key={text} className="flex items-start gap-2 text-sm text-gray-700">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                {text}
              </div>
            ))}
          </div>
        </div>

        {/* ═══ SETTINGS (shown when phone is configured) ═══ */}
        {hasNumber && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
              <Settings className="w-5 h-5 text-gray-400" />
              Samtalsinställningar
            </h2>

            <div className="space-y-6">
              {/* Recording message */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Inspelningsmeddelande</label>
                  <button
                    onClick={() => setRecordingEnabled(!recordingEnabled)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${recordingEnabled ? 'bg-teal-600' : 'bg-gray-300'}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${recordingEnabled ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
                {recordingEnabled && (
                  <textarea
                    value={consentMessage}
                    onChange={(e) => setConsentMessage(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                )}
              </div>

              {/* Missed call SMS */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">SMS vid missat samtal</label>
                  <button
                    onClick={() => setMissedSmsEnabled(!missedSmsEnabled)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${missedSmsEnabled ? 'bg-teal-600' : 'bg-gray-300'}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${missedSmsEnabled ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
                {missedSmsEnabled && (
                  <textarea
                    value={missedSmsText}
                    onChange={(e) => setMissedSmsText(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                )}
              </div>

              {/* Forward number / kill switch */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  <Shield className="w-4 h-4 inline text-gray-400 mr-1" />
                  Vidarekoppling vid problem
                </label>
                <p className="text-xs text-gray-400 mb-2">Om Handymate är nere kopplas samtal direkt till detta nummer.</p>
                <input
                  type="tel"
                  value={forwardNumber}
                  onChange={(e) => setForwardNumber(e.target.value)}
                  placeholder="070-123 45 67"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>

              {/* Save */}
              <div className="flex items-center gap-3">
                <button
                  onClick={saveSettings}
                  disabled={saving}
                  className="px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium text-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Spara inställningar
                </button>
                {saveMsg && <span className="text-sm text-emerald-600 font-medium">{saveMsg}</span>}
              </div>

              {/* SMS-webhook & Synk */}
              {config?.elks_number_id && (
                <div className="border-t border-gray-100 pt-5 mt-2 space-y-4">
                  <h4 className="text-sm font-semibold text-gray-700">SMS-webhook</h4>

                  <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-400 w-24">Webhook-URL:</span>
                      <code className="text-gray-600 bg-white px-2 py-0.5 rounded border text-[11px]">
                        {APP_URL}/api/sms/incoming
                      </code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-400 w-24">Nummer:</span>
                      <span className="text-gray-700 font-medium">{config.assigned_phone_number || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-400 w-24">Status:</span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-emerald-600 font-medium">Aktiv</span>
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-gray-400">
                    Kopplingar uppdateras automatiskt varje dag. Använd knapparna nedan bara om SMS eller samtal slutat fungera.
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={syncWebhooks}
                      disabled={syncing}
                      className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors text-sm disabled:opacity-50 flex items-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                      Synka webhook
                    </button>
                    <button
                      onClick={sendTestSms}
                      disabled={sendingTest}
                      className="px-4 py-2 border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50 transition-colors text-sm disabled:opacity-50 flex items-center gap-2"
                    >
                      {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                      Skicka test-SMS
                    </button>
                    {syncMsg && (
                      <span className={`text-sm font-medium ${syncMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                        {syncMsg.text}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SMS-logg */}
        <div className="mt-8 border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">SMS-logg</h3>
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/sms/log?limit=30')
                  const data = await res.json()
                  setSmsLogs(data.logs || [])
                } catch { setSmsLogs([]) }
              }}
              className="text-sm text-teal-600 hover:text-teal-700"
            >
              Uppdatera
            </button>
          </div>
          {smsLogs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              Inga SMS-loggar ännu.{' '}
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/sms/log?limit=30')
                    const data = await res.json()
                    setSmsLogs(data.logs || [])
                  } catch { setSmsLogs([]) }
                }}
                className="text-teal-600 hover:underline"
              >
                Ladda
              </button>
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {smsLogs.map((log: any) => (
                <div key={log.sms_id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 bg-white">
                  <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${log.status === 'sent' ? 'bg-emerald-500' : log.status === 'failed' ? 'bg-red-500' : 'bg-gray-300'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span>{log.direction === 'inbound' ? '← Inkommande' : '→ Utgående'}</span>
                      <span>·</span>
                      <span>{log.phone_to || log.phone_from}</span>
                      <span>·</span>
                      <span>{new Date(log.created_at).toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-sm text-gray-700 mt-0.5 truncate">{log.message}</p>
                    {log.status === 'failed' && log.error_message && (
                      <p className="text-xs text-red-500 mt-0.5">Fel: {log.error_message}</p>
                    )}
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${log.status === 'sent' ? 'bg-emerald-50 text-emerald-700' : log.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-500'}`}>
                    {log.status === 'sent' ? 'Skickat' : log.status === 'failed' ? 'Misslyckat' : log.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
