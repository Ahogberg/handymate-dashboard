'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import StepProgress from './components/StepProgress'
import Step1BusinessAccount from './components/Step1BusinessAccount'
import Step2ServicesAndPricing from './components/Step2ServicesAndPricing'
import Step3Phone from './components/Step3Phone'
import Step4Connections from './components/Step4Connections'
import Step5LeadSources from './components/Step5LeadSources'
import Step6Automations from './components/Step6Automations'
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

  // Load onboarding data for existing (authenticated) users
  useEffect(() => {
    async function loadOnboarding() {
      try {
        const res = await fetch('/api/onboarding')
        if (!res.ok) {
          // Not authenticated = new user, start at step 1
          setIsNewUser(true)
          setLoading(false)
          return
        }

        const d: OnboardingData = await res.json()
        setData(d)

        // If already completed, go to dashboard
        if (d.onboarding_step >= 8 || d.onboarding_completed_at) {
          router.push('/dashboard')
          return
        }

        // Resume at step 2+ (step 1 is only for new users)
        if (d.onboarding_step > 1) {
          setCurrentStep(Math.min(d.onboarding_step, 7))
        } else {
          setCurrentStep(2) // Skip step 1, already registered
        }
      } catch {
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
    const nextStep = Math.min(currentStep + 1, 7)
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
  const handleStep1Complete = useCallback(async (businessId: string, _emailPending: boolean) => {
    // Reload data from server now that user is registered
    try {
      const res = await fetch('/api/onboarding')
      if (res.ok) {
        const d: OnboardingData = await res.json()
        setData(d)
        setIsNewUser(false)
      }
    } catch {
      // Construct minimal data
      setData({
        business_id: businessId,
        business_name: '',
        display_name: '',
        contact_name: '',
        contact_email: '',
        phone_number: '',
        branch: '',
        service_area: '',
        org_number: '',
        address: '',
        services_offered: [],
        default_hourly_rate: 0,
        callout_fee: 0,
        rot_enabled: false,
        rut_enabled: false,
        assigned_phone_number: null,
        forward_phone_number: null,
        call_mode: null,
        phone_setup_type: null,
        lead_sources: [],
        lead_email_address: null,
        knowledge_base: null,
        onboarding_step: 1,
        onboarding_data: {},
        onboarding_completed_at: null,
        working_hours: null,
        industry: null,
        google_connected: false,
        gmail_enabled: false,
      })
    }

    await saveProgress(2)
    setCurrentStep(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [saveProgress])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
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

        {currentStep === 4 && stepProps && (
          <Step4Connections {...stepProps} />
        )}

        {currentStep === 5 && stepProps && (
          <Step5LeadSources {...stepProps} />
        )}

        {currentStep === 6 && stepProps && (
          <Step6Automations {...stepProps} />
        )}

        {currentStep === 7 && data && (
          <Step7Complete data={data} />
        )}
      </div>

      {/* AI Chatbot */}
      <OnboardingChatbot />
    </div>
  )
}
