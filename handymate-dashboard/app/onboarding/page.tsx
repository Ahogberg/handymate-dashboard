'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Mail } from 'lucide-react'
import { BRANCH_HOURLY_RATE, ROT_BRANCHES, RUT_BRANCHES } from './constants'
import StepProgress from './components/StepProgress'
import Step1BusinessAccount from './components/Step1BusinessAccount'
import Step2ServicesAndPricing from './components/Step2ServicesAndPricing'
import Step3Phone from './components/Step3Phone'
import Step7Complete from './components/Step7Complete'
import OnboardingChatbot from './components/OnboardingChatbot'
import type { OnboardingData } from './types'

export default function OnboardingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [data, setData] = useState<OnboardingData | null>(null)
  const [isNewUser, setIsNewUser] = useState(false)
  const [emailPending, setEmailPending] = useState(false)
  const [pendingEmail, setPendingEmail] = useState('')

  // Load onboarding data for existing (authenticated) users
  useEffect(() => {
    async function loadOnboarding() {
      try {
        const res = await fetch('/api/onboarding')
        if (!res.ok) {
          console.log('[Onboarding] API returned', res.status, '— treating as new user')
          setIsNewUser(true)
          setLoading(false)
          return
        }

        const d: OnboardingData = await res.json()
        console.log('[Onboarding] Loaded data, step:', d.onboarding_step, 'branch:', d.branch, 'business_id:', d.business_id)
        setData(d)

        // If already completed, go to dashboard
        // step >= 5 (new V2 flow) or step >= 10 (legacy) or completed_at set
        if (d.onboarding_step >= 5 || d.onboarding_step >= 10 || d.onboarding_completed_at) {
          router.push('/dashboard')
          return
        }

        // Resume at step 2+ (step 1 is only for new users)
        if (d.onboarding_step > 1) {
          // Map legacy steps to new flow: steps 4-9 → step 4 (Klart!)
          const mapped = Math.min(d.onboarding_step, 4)
          setCurrentStep(mapped)
        } else {
          setCurrentStep(2) // Skip step 1, already registered
        }
      } catch (err) {
        console.error('[Onboarding] Load error:', err)
        setIsNewUser(true)
      } finally {
        setLoading(false)
      }
    }

    loadOnboarding()
  }, [router])

  // Save step progress
  const saveProgress = useCallback(async (step: number) => {
    try {
      await fetch('/api/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step }),
      })
    } catch {
      // Silent fail
    }
  }, [])

  const goNext = useCallback(async () => {
    const nextStep = Math.min(currentStep + 1, 4)
    setSaving(true)
    await saveProgress(nextStep)
    setCurrentStep(nextStep)
    setSaving(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [currentStep, saveProgress])

  const goBack = useCallback(() => {
    const prevStep = Math.max(currentStep - 1, isNewUser ? 1 : 2)
    setCurrentStep(prevStep)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [currentStep, isNewUser])

  const handleUpdate = useCallback((updates: Partial<OnboardingData>) => {
    setData(prev => prev ? { ...prev, ...updates } : null)
  }, [])

  // Step 1 completion (new user just registered)
  const handleStep1Complete = useCallback(async (
    businessId: string,
    isEmailPending: boolean,
    formData: { business_name: string; branch: string; contact_name: string; contact_email: string; phone_number: string }
  ) => {
    // Always build minimal data from form fields so step 2 can render regardless of API status
    const baseData: OnboardingData = {
      business_id: businessId,
      business_name: formData.business_name,
      display_name: formData.business_name,
      contact_name: formData.contact_name,
      contact_email: formData.contact_email,
      phone_number: formData.phone_number,
      branch: formData.branch,
      service_area: '',
      org_number: '',
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

    // Set data + advance to step 2 SYNCHRONOUSLY before any await
    setData(baseData)
    setIsNewUser(false)
    setCurrentStep(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })

    // If email confirmation is required, show confirmation screen
    if (isEmailPending) {
      setPendingEmail(formData.contact_email)
      setEmailPending(true)
      return
    }

    // Background: try to load richer data from server + save progress
    saveProgress(2).catch(() => {})
    fetch('/api/onboarding')
      .then(res => res.ok ? res.json() : null)
      .then(d => { if (d) setData(d) })
      .catch(() => {})
  }, [saveProgress])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
      </div>
    )
  }

  if (emailPending) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-teal-500/20 rounded-full flex items-center justify-center mx-auto">
            <Mail className="w-8 h-8 text-teal-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">Bekräfta din e-post</h1>
            <p className="text-zinc-400">
              Vi har skickat ett bekräftelsemail till <span className="text-white font-medium">{pendingEmail}</span>.
              Klicka på länken i mailet för att aktivera ditt konto och fortsätta onboardingen.
            </p>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-400">
            Inget mail? Kolla skräppostmappen eller kontakta <a href="mailto:support@handymate.se" className="text-teal-400 hover:underline">support@handymate.se</a>.
          </div>
          <a href="/login" className="block w-full py-3 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-xl hover:bg-zinc-700 transition-colors">
            Gå till inloggning
          </a>
        </div>
      </div>
    )
  }

  const stepProps = data ? {
    data,
    onNext: goNext,
    onBack: currentStep > (isNewUser ? 1 : 2) ? goBack : undefined,
    onUpdate: handleUpdate,
    saving,
  } : null

  return (
    <div className="min-h-screen bg-[#09090b]">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-8 bg-teal-600 hover:bg-teal-700 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">H</span>
            </div>
            <span className="text-white font-semibold text-lg">Handymate</span>
          </div>
          <StepProgress currentStep={currentStep} />
        </div>
      </div>

      {/* Step Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {currentStep === 1 && isNewUser && (
          <Step1BusinessAccount onComplete={handleStep1Complete} />
        )}

        {currentStep === 2 && stepProps && (
          <Step2ServicesAndPricing {...stepProps} />
        )}

        {currentStep === 3 && stepProps && (
          <Step3Phone {...stepProps} />
        )}

        {currentStep === 4 && data && (
          <Step7Complete data={data} />
        )}

        {/* Fallback: om inget steg renderas (data saknas), visa felmeddelande */}
        {currentStep >= 2 && currentStep <= 3 && !stepProps && (
          <div className="text-center py-16 space-y-4">
            <Loader2 className="w-8 h-8 text-teal-400 animate-spin mx-auto" />
            <p className="text-zinc-400">Laddar steg {currentStep}...</p>
            <button
              onClick={() => {
                setLoading(true)
                fetch('/api/onboarding')
                  .then(res => res.ok ? res.json() : null)
                  .then(d => {
                    if (d) {
                      setData(d)
                    } else {
                      setIsNewUser(true)
                      setCurrentStep(1)
                    }
                  })
                  .catch(() => {
                    setIsNewUser(true)
                    setCurrentStep(1)
                  })
                  .finally(() => setLoading(false))
              }}
              className="px-4 py-2 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-700 text-sm"
            >
              Ladda om
            </button>
          </div>
        )}
        {currentStep === 4 && !data && (
          <div className="text-center py-16 space-y-4">
            <Loader2 className="w-8 h-8 text-teal-400 animate-spin mx-auto" />
            <p className="text-zinc-400">Laddar...</p>
          </div>
        )}
      </div>

      {/* AI Chatbot */}
      <OnboardingChatbot />
    </div>
  )
}
