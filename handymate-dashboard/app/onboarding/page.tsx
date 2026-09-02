'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Step1MeetTheTeam from './components/Step1MeetTheTeam'
import Step2Business from './components/Step2Business'
import Step3HowYouWork from './components/Step3HowYouWork'
import Step4PhoneNumber from './components/Step4PhoneNumber'
import Step5Activate from './components/Step5Activate'
import StepImportData from './components/StepImportData'
import StepProductRegister from './components/StepProductRegister'
import Step6LiveTour from './components/Step6LiveTour'
import type { OnboardingFormData } from './types-redesign'
import { hasStep2Draft } from './step2-draft'
import { FirstQuoteLaunch } from '@/components/onboarding/FirstQuoteLaunch'
import { completeFirstQuoteOnboarding } from '@/lib/onboarding/first-quote-handoff'
import { fetchQuoteSetup } from '@/lib/quotes/job-type-start'
import { resolveFirstQuoteSelection, type QuoteSetupData } from '@/lib/quotes/job-type-setup'
import { normalizeStandardHourlyRate } from '@/lib/onboarding/pricing-start'
import { MatteSetupGuide } from '@/components/onboarding/MatteSetupGuide'
import { SetupStudioShell } from '@/components/onboarding/SetupStudioShell'
import {
  readSetupStudioPreference,
  resolveSetupStudioMode,
  writeSetupStudioPreference,
} from '@/lib/onboarding/setup-studio'

const TOTAL_STEPS = 8

/**
 * Onboarding-orchestrator (Claude Design redesign).
 *
 * Step-mappning till business_config.onboarding_step:
 *   0 = Step1MeetTheTeam    (intro, ingen DB)
 *   1 = Step2Business       (account skapas, businessId sätts)
 *   2 = Step3HowYouWork     (specialties + hours + price)
 *   3 = Step4PhoneNumber    (phone reserveras)
 *   4 = Step5Activate       (Stripe payment)
 *   5 = StepImportData      (hämta in kunder + öppna fakturor — Fortnox/CSV)
 *   6 = StepProductRegister (granska det redan seedade produktregistret, 2026-08-16)
 *   7 = Step6LiveTour       (live tour, klar = onboarding_completed_at)
 *
 * Resume-logik: Vid sidvisning hämtas onboarding_step från DB.
 * Användaren landar på rätt steg om de stängt mitt i flödet.
 */
export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [data, setData] = useState<OnboardingFormData>({ fSkatt: true })
  const [loading, setLoading] = useState(true)
  const [launchRequested, setLaunchRequested] = useState(false)
  const [quoteSetup, setQuoteSetup] = useState<QuoteSetupData | null>(null)
  const [quoteSetupError, setQuoteSetupError] = useState(false)
  const [setupRetry, setSetupRetry] = useState(0)
  const [studioMode, setStudioMode] = useState(
    process.env.NEXT_PUBLIC_SETUP_STUDIO_ENABLED === 'true',
  )
  const finalizeLock = useRef(false)

  useEffect(() => {
    setStudioMode(resolveSetupStudioMode(
      process.env.NEXT_PUBLIC_SETUP_STUDIO_ENABLED,
      window.location.search,
      readSetupStudioPreference(),
    ))
  }, [])

  useEffect(() => {
    if (!launchRequested) return
    const controller = new AbortController()
    setQuoteSetup(null); setQuoteSetupError(false)
    fetchQuoteSetup(controller.signal).then(value => {
      if (!controller.signal.aborted) setQuoteSetup(value)
    }).catch(() => { if (!controller.signal.aborted) setQuoteSetupError(true) })
    return () => controller.abort()
  }, [launchRequested, setupRetry])

  // Vid load: kolla om användaren redan börjat onboarding
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/onboarding')
        if (!res.ok) {
          // Ny användare — börja från Step 1 (intro). UNDANTAG (Fynd 3): om
          // ett sparat Step2-utkast finns i sessionStorage (kunden hann
          // fylla i innan en refresh/401 tog bort sessionen) hoppar vi rakt
          // till registreringssteget istället — annars ser det ut som att
          // allt försvann. Step2Business hydrerar sina fält från samma
          // utkast vid mount.
          if (!cancelled) {
            setStep(hasStep2Draft() ? 1 : 0)
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
        let uiStep = Math.max(0, Math.min(dbStep, TOTAL_STEPS - 1))

        // Retur från Stripe Checkout (onboarding-betalning).
        //  ?payment=success → betalningen är genomförd (prenumeration skapad i
        //    trialing). Gå vidare till importsteget (5) — kunden landar på
        //    "hämta in din verksamhet" direkt efter betalning. Telefonnumret
        //    provisioneras av webhooken; Step6 läser assigned_phone_number.
        //  ?payment=cancelled → kunden avbröt. Landa kvar på betalsteget (4)
        //    så de kan försöka igen. Aldrig fastna.
        const params = new URLSearchParams(window.location.search)
        const payment = params.get('payment')
        if (payment === 'success') {
          uiStep = 5
          // Persistera framsteget (best-effort) och städa URL:en.
          if (d.business_id) {
            fetch('/api/onboarding', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ step: 5, data: {}, config: {} }),
            }).catch(() => {})
          }
          window.history.replaceState({}, '', '/onboarding')
        } else if (payment === 'cancelled') {
          uiStep = 4
          window.history.replaceState({}, '', '/onboarding')
        }

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
          // Server-härlett (aldrig från onboarding_data — se GET /api/onboarding).
          // Placerad EFTER spreadet så den aldrig kan skuggas av ett gammalt
          // cachat värde i onboarding_data.
          foundersAvailable: Boolean(d.founders_available),
          // Ett äldre, uttryckligt sparat standardpris får visas igen, men
          // prismodellen väljs fortfarande av ägaren — inget inferred val.
          standardHourlyRate: (d.onboarding_data || {}).standardHourlyRate ?? d.default_hourly_rate ?? null,
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

  // Save progress till DB (bara om vi har businessId).
  // Server-side via /api/onboarding PUT (service-role bypassar RLS).
  // `config`-objektet skriver whitelisted business_config-kolumner direkt.
  const saveProgress = useCallback(
    async (
      s: number,
      extraData?: Record<string, unknown>,
      config?: Record<string, unknown>,
    ) => {
      if (!data.businessId) return
      try {
        await fetch('/api/onboarding', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          // variant: vilken guide kunden faktiskt såg — servern stämplar
          // tratten (lib/onboarding/funnel.ts) så A/B-testet går att läsa av.
          body: JSON.stringify({
            step: s,
            data: extraData || {},
            config: config || {},
            variant: studioMode ? 'studio' : 'classic',
          }),
        })
      } catch {
        // Silent — onboarding fortsätter ändå, kan resume senare
      }
    },
    [data.businessId, studioMode],
  )

  const next = useCallback(async () => {
    const newStep = Math.min(step + 1, TOTAL_STEPS - 1)
    setStep(newStep)

    if (data.businessId && newStep > 0) {
      // Bygg config-payload baserat på vilket steg vi LÄMNAR
      const config: Record<string, unknown> = {}

      if (step === 2) {
        // Lämnar Step3HowYouWork — spara specialiteter + arbetstider + pris
        config.specialties = data.specialties || []
        config.working_hours = buildWorkingHours(data)
        const standardHourlyRate = normalizeStandardHourlyRate(data.standardHourlyRate)
        config.hourly_rate_min = standardHourlyRate
        config.hourly_rate_max = standardHourlyRate
        config.default_hourly_rate = standardHourlyRate
        // Prisslingan V2 (beslut 4): företagets eget materialpåslag — synligt
        // fält i steget (förifyllt 20 som förslag), aldrig en tyst konstant.
        config.material_markup_pct = data.materialMarkup ?? 20

        // Skatterytmen och intern timkostnad frågas inte längre här (Lager 3 /
        // B10, 2026-08-27). Karin ber om momsperiod/arbetsgivare/räkenskapsår
        // när hon behöver dem (bolagskalendern → Bolagsprofil), och Lars om
        // intern timkostnad när ett marginalunderlag ska bedömas
        // (projektekonomin → Inställningar). Steg 2 frågar bara det Lisa
        // behöver för att svara rätt: specialiteter, tider och timdebitering.

        // Årsmål/marginalmål frågas inte längre i onboardingen (Lager 3 / B6,
        // 2026-08-27) — de sätts under Inställningar → Ekonomi. Fokuset
        // ("Vad vill du ha hjälp med först?") följer med i onboarding_data via
        // sanitizeForSave(data) nedan, ingen egen kolumn.
      }

      if (step === 3 && data.lisaNumber) {
        // Lämnar Step4PhoneNumber — spara telefonkoppling
        config.assigned_phone_number = data.lisaNumber.replace(/\s/g, '')
        config.phone_setup_type = data.phoneMode === 'forward' ? 'keep_existing' : 'new_number'
      }

      await saveProgress(newStep, sanitizeForSave(data), config)
    }
  }, [step, data, saveProgress])

  // Aktivera senare (2026-09-02): lämnar betalsteget utan kort. Stämpeln
  // sparas i onboarding_data (ingen kolumn) så tratten kan räkna "sköt
  // upp betalningen" och betalfrågan kan ställas igen efter första
  // värdekvittot. Kontot är redan 'trial' med trial_ends_at sedan
  // registreringen — inget i behörighetslagret ändras här.
  const deferActivation = useCallback(async () => {
    const activationDeferredAt = new Date().toISOString()
    setData(d => ({ ...d, activationDeferredAt }))
    setStep(5)
    if (data.businessId) {
      await saveProgress(5, { ...sanitizeForSave(data), activationDeferredAt })
    }
  }, [data, saveProgress])

  const back = useCallback(() => {
    setStep(s => Math.max(0, s - 1))
  }, [])

  // finish() navigerar bara till dashboarden om finalize-anropet faktiskt
  // lyckades — tidigare sväljde try/catch{} felet tyst och pushade ändå,
  // vilket kunde landa kunden på en dashboard utan seedade defaults
  // (automation_rules, pipeline_stages, etc.) utan att någon märkte det.
  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState(false)

  const finish = useCallback(async () => {
    if (finalizeLock.current) return
    finalizeLock.current = true
    if (!data.businessId) {
      // Inget konto att finalisera (edge case) — inget att fela på.
      finalizeLock.current = false
      router.push('/dashboard')
      return
    }
    setFinishing(true)
    setFinishError(false)
    try {
      // Server-side finalize via /api/onboarding POST (befintlig endpoint
      // sätter onboarding_step + onboarding_completed_at + seedar defaults).
      // Kritiskt anrop — måste lyckas innan vi navigerar.
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error('finalize failed')

      // welcome_tour_seen skrivs INTE här längre (2026-08-13). Den gated
      // tidigare bort Hemturen (components/tour/HemTur.tsx) innan den ens
      // hunnit visas — kolumnen sattes redan när Step6-förhandsvisningen
      // stängdes, så den riktiga touren på /dashboard hade alltid ett
      // redan-satt flagg att läsa. Nu är Hemturen ensam ägare av skrivningen
      // (vid dess avslut/hopp) — se docs/design/FORSTA-30-MINUTERNA.md.
      router.push('/dashboard')
    } catch {
      setFinishing(false)
      setFinishError(true)
    } finally {
      finalizeLock.current = false
    }
  }, [data.businessId, router])

  async function launchFirstQuote() {
    if (finalizeLock.current) return
    if (!data.businessId || !data.firstQuoteSelection) throw new Error('Offertunderlag saknas')
    finalizeLock.current = true
    try {
      const href = await completeFirstQuoteOnboarding(data.firstQuoteSelection, sanitizeForSave(data))
      router.push(href)
    } finally { finalizeLock.current = false }
  }

  const verifiedSelection = quoteSetup ? resolveFirstQuoteSelection(quoteSetup, data.firstQuoteSelection) : null
  const launchJob = quoteSetup?.jobTypes.find(j => j.slug === verifiedSelection?.jobTypeSlug)
  const launchTemplate = quoteSetup?.templates.find(t => t.id === verifiedSelection?.templateId)

  const setDataUpdater = useCallback(
    (updater: (d: OnboardingFormData) => OnboardingFormData) => setData(updater),
    [],
  )

  const useClassicGuide = useCallback(() => {
    writeSetupStudioPreference('classic')
    setStudioMode(false)
  }, [])

  const onboardingStep = (
    <div className="ob-card-wrap" data-wide={step === 0 ? 'true' : undefined}>
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
        <Step5Activate onNext={next} onBack={back} onDefer={deferActivation} data={data} setData={setDataUpdater} />
      )}
      {step === 5 && (
        <StepImportData onNext={next} onBack={back} data={data} setData={setDataUpdater} />
      )}
      {step === 6 && (
        <StepProductRegister onNext={next} onBack={back} data={data} setData={setDataUpdater} />
      )}
      {step === 7 && !launchRequested && <Step6LiveTour onFinish={finish} data={data}
        onFirstQuote={data.firstQuoteSelection ? () => setLaunchRequested(true) : undefined} />}
      {step === 7 && launchRequested && (launchJob && launchTemplate ?
        <FirstQuoteLaunch companyName={data.companyName || 'Ditt företag'} jobName={launchJob.name} templateName={launchTemplate.name}
          onContinue={launchFirstQuote} onSkip={finish} /> :
        <section className="first-quote-launch" aria-label="Din första offert">
          <h2>Vi tar med ditt upplägg</h2>
          {quoteSetupError || quoteSetup ? <>
            <p role="alert">{quoteSetupError ? 'Kunde inte läsa underlaget just nu.' : 'Ditt underlag har ändrats. Välj jobbtyp och mall igen i artikelsteget.'}</p>
            <button type="button" className="first-quote-open" onClick={() => setSetupRetry(n => n + 1)}>Försök igen</button>
            <button type="button" className="first-quote-skip" onClick={() => { setLaunchRequested(false); setStep(6) }}>Till artikelsteget</button>
          </> : <p role="status">Kontrollerar din jobbtyp och mall…</p>}
          <button type="button" className="first-quote-skip" disabled={finishing} onClick={finish}>Till översikten i stället</button>
        </section>)}
    </div>
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
      {/* Teamintrot (steg 0) får ett brett kort på desktop: sex agenter i
          telefonformatets 460px tvingade fram en inre scroll där halva
          teamet var osynligt. Övriga steg är formulär och mår bra i det
          smala kortet — bredden gäller BARA där den behövs. */}
      {studioMode ? (
        <SetupStudioShell step={step} totalSteps={TOTAL_STEPS} data={data} onUseClassic={useClassicGuide}>
          {onboardingStep}
        </SetupStudioShell>
      ) : (
        <div className="ob-stage" data-guided={step > 0 && step < 7 ? 'true' : undefined}>
          {step > 0 && step < 7 && <MatteSetupGuide step={step} data={data} />}
          {onboardingStep}
        </div>
      )}

      {/* Finalize-fel (Fynd 6): navigera ALDRIG till dashboarden på ett
          misslyckat finalize-anrop — visa fel + låt kunden försöka igen. */}
      {step === 7 && finishError && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 24,
            transform: 'translateX(-50%)',
            zIndex: 100,
            background: '#fff',
            border: '1px solid #FECACA',
            borderRadius: 12,
            padding: '14px 18px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            maxWidth: 'calc(100vw - 32px)',
          }}
        >
          <span style={{ fontSize: 13, color: '#B91C1C', fontWeight: 500 }}>
            Något gick fel när vi avslutade — försök igen.
          </span>
          <button
            type="button"
            onClick={finish}
            disabled={finishing}
            style={{
              padding: '8px 14px',
              background: '#0F766E',
              color: '#fff',
              border: 0,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: finishing ? 'default' : 'pointer',
              opacity: finishing ? 0.6 : 1,
              flexShrink: 0,
              fontFamily: 'inherit',
            }}
          >
            {finishing ? 'Försöker…' : 'Försök igen'}
          </button>
        </div>
      )}
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
