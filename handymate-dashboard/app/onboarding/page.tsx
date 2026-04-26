'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Step1MeetTheTeam from './components/Step1MeetTheTeam'
import Step2Business from './components/Step2Business'
import Step3HowYouWork from './components/Step3HowYouWork'
import Step4PhoneNumber from './components/Step4PhoneNumber'
import Step5Activate from './components/Step5Activate'
import Step6LiveTour from './components/Step6LiveTour'
import type { OnboardingFormData } from './types-redesign'

const TOTAL_STEPS = 6

/**
 * Onboarding-orchestrator (Claude Design redesign).
 *
 * Step-mappning till business_config.onboarding_step:
 *   0 = Step1MeetTheTeam (intro, ingen DB)
 *   1 = Step2Business    (account skapas, businessId sätts)
 *   2 = Step3HowYouWork  (specialties + hours + price)
 *   3 = Step4PhoneNumber (phone reserveras)
 *   4 = Step5Activate    (Stripe payment)
 *   5 = Step6LiveTour    (live tour, klar = onboarding_completed_at)
 *
 * Resume-logik: Vid sidvisning hämtas onboarding_step från DB.
 * Användaren landar på rätt steg om de stängt mitt i flödet.
 */
export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [data, setData] = useState<OnboardingFormData>({ fSkatt: true })
  const [loading, setLoading] = useState(true)

  // Vid load: kolla om användaren redan börjat onboarding
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/onboarding')
        if (!res.ok) {
          // Ny användare — börja från Step 1 (intro)
          if (!cancelled) {
            setStep(0)
            setLoading(false)
          }
          return
        }
        const d = await res.json()
        if (cancelled) return

        // Klar — redirecta direkt till dashboard
        if (d.onboarding_completed_at) {
          router.push('/dashboard')
          return
        }

        // Resume: mappa DB-step till UI-step
        const dbStep = d.onboarding_step || 0
        const uiStep = Math.max(0, Math.min(dbStep, TOTAL_STEPS - 1))

        // Återställ form-data från DB om finns
        const restored: OnboardingFormData = {
          businessId: d.business_id,
          companyName: d.business_name,
          trade: d.branch,
          orgNumber: d.org_number,
          area: d.service_area,
          contactName: d.contact_name,
          email: d.contact_email,
          phone: d.phone_number,
          fSkatt: true,
          ...(d.onboarding_data || {}),
        }

        setData(restored)
        setStep(uiStep)
        setLoading(false)
      } catch {
        if (!cancelled) {
          setStep(0)
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [router])

  // Save progress till DB (bara om vi har businessId)
  const saveProgress = useCallback(
    async (s: number, extraData?: Record<string, unknown>) => {
      if (!data.businessId) return
      try {
        await fetch('/api/onboarding', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: s, data: extraData || {} }),
        })
      } catch {
        // Silent — onboarding fortsätter ändå, kan resume senare
      }
    },
    [data.businessId],
  )

  const next = useCallback(async () => {
    const newStep = Math.min(step + 1, TOTAL_STEPS - 1)
    setStep(newStep)

    // Spara form-data till business_config + onboarding_step
    if (data.businessId && newStep > 0) {
      await saveProgress(newStep, sanitizeForSave(data))

      // För step 3 (specialties + hours + price) — skriv DIREKT till business_config-kolumner
      if (step === 2 && data.businessId) {
        try {
          const { createClientComponentClient } = await import('@supabase/auth-helpers-nextjs')
          const supabase = createClientComponentClient()
          const workingHours = buildWorkingHours(data)
          await supabase
            .from('business_config')
            .update({
              specialties: data.specialties || [],
              working_hours: workingHours,
              hourly_rate_min: data.priceMin ?? null,
              hourly_rate_max: data.priceMax ?? null,
              default_hourly_rate: data.priceMax
                ? Math.round((data.priceMin! + data.priceMax) / 2)
                : null,
            })
            .eq('business_id', data.businessId)
        } catch {
          // silent
        }
      }

      // Step 4 (phone) — skriv assigned_phone_number
      if (step === 3 && data.businessId && data.lisaNumber) {
        try {
          const { createClientComponentClient } = await import('@supabase/auth-helpers-nextjs')
          const supabase = createClientComponentClient()
          await supabase
            .from('business_config')
            .update({
              assigned_phone_number: data.lisaNumber.replace(/\s/g, ''),
              phone_setup_type: data.phoneMode === 'forward' ? 'keep_existing' : 'new_number',
            })
            .eq('business_id', data.businessId)
        } catch {
          // silent
        }
      }
    }
  }, [step, data, saveProgress])

  const back = useCallback(() => {
    setStep(s => Math.max(0, s - 1))
  }, [])

  const finish = useCallback(async () => {
    if (data.businessId) {
      try {
        const { createClientComponentClient } = await import('@supabase/auth-helpers-nextjs')
        const supabase = createClientComponentClient()
        await supabase
          .from('business_config')
          .update({
            onboarding_step: 10, // Compat med befintlig "klar"-konvention
            onboarding_completed_at: new Date().toISOString(),
            welcome_tour_seen: new Date().toISOString(),
          })
          .eq('business_id', data.businessId)
      } catch {
        // silent
      }
    }
    router.push('/dashboard')
  }, [data.businessId, router])

  const setDataUpdater = useCallback(
    (updater: (d: OnboardingFormData) => OnboardingFormData) => setData(updater),
    [],
  )

  if (loading) {
    return (
      <div className="ob-page">
        <div className="ob-card-wrap">
          <div
            className="ob-screen"
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                border: '3px solid var(--ob-primary-100)',
                borderTopColor: 'var(--ob-primary-700)',
                borderRadius: '50%',
                animation: 'ob-spin 0.9s linear infinite',
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="ob-page">
      <div className="ob-card-wrap">
        {step === 0 && <Step1MeetTheTeam onNext={next} />}
        {step === 1 && (
          <Step2Business onNext={next} onBack={back} data={data} setData={setDataUpdater} />
        )}
        {step === 2 && (
          <Step3HowYouWork onNext={next} onBack={back} data={data} setData={setDataUpdater} />
        )}
        {step === 3 && (
          <Step4PhoneNumber onNext={next} onBack={back} data={data} setData={setDataUpdater} />
        )}
        {step === 4 && (
          <Step5Activate onNext={next} onBack={back} data={data} setData={setDataUpdater} />
        )}
        {step === 5 && <Step6LiveTour onFinish={finish} data={data} />}
      </div>
    </div>
  )
}

/**
 * Tar bara med fält som ska persisteras i onboarding_data JSONB.
 * Strippar bort businessId, password, etc.
 */
function sanitizeForSave(d: OnboardingFormData): Record<string, unknown> {
  const {
    businessId: _bid,
    password: _p,
    emailPending: _e,
    logoDataUrl: _l,
    ...rest
  } = d
  return rest
}

/**
 * Konverterar Step3-formdata till business_config.working_hours JSONB-format.
 * DAYS-array är [mån, tis, ons, tor, fre, lör, sön] — booleans.
 */
function buildWorkingHours(d: OnboardingFormData): Record<string, { active: boolean; start: string; end: string }> {
  const days = d.days || [true, true, true, true, true, false, false]
  const start = `${String(d.startHour ?? 7).padStart(2, '0')}:00`
  const end = `${String(d.endHour ?? 17).padStart(2, '0')}:00`
  const keys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const result: Record<string, { active: boolean; start: string; end: string }> = {}
  keys.forEach((k, i) => {
    result[k] = { active: !!days[i], start, end }
  })
  return result
}
