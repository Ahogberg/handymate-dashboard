'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Step1MeetTheTeam from './components/Step1MeetTheTeam'
import Step2Business from './components/Step2Business'
import Step3HowYouWork from './components/Step3HowYouWork'
import Step4PhoneNumber from './components/Step4PhoneNumber'
import Step5Activate from './components/Step5Activate'
import StepImportData from './components/StepImportData'
import StepGenomgang from './components/StepGenomgang'
import StepProductRegister from './components/StepProductRegister'
import Step6LiveTour from './components/Step6LiveTour'
import type { OnboardingFormData } from './types-redesign'
import { hasStep2Draft } from './step2-draft'
import { harForetagsskannernUnderlag } from '@/lib/foretagsskannern/skanna'
import { FirstQuoteLaunch } from '@/components/onboarding/FirstQuoteLaunch'
import { completeFirstQuoteOnboarding } from '@/lib/onboarding/first-quote-handoff'
import { fetchQuoteSetup } from '@/lib/quotes/job-type-start'
import { resolveFirstQuoteSelection, type QuoteSetupData } from '@/lib/quotes/job-type-setup'
import { normalizeStandardHourlyRate } from '@/lib/onboarding/pricing-start'
import { MatteSetupGuide } from '@/components/onboarding/MatteSetupGuide'
import { isDemoBusinessId } from '@/lib/demo/is-demo-client'
import { SetupStudioShell } from '@/components/onboarding/SetupStudioShell'
import {
  readSetupStudioPreference,
  resolveSetupStudioMode,
  writeSetupStudioPreference,
} from '@/lib/onboarding/setup-studio'

const TOTAL_STEPS = 9

/**
 * Verifierar en genomförd Stripe Checkout mot servern (2026-09-02).
 *
 * Två steg, båda server-härledda — klienten avgör aldrig själv om något är
 * betalt:
 *   1. POST .../verify med session_id — Stripe är sanningen och statusen
 *      skrivs direkt, så vi inte behöver vänta in webhooken.
 *   2. Svarar den "pending" (3DS/SCA, eller webhooken hann före men vår
 *      skrivning inte klar) pollas GET /api/onboarding fem gånger med två
 *      sekunders mellanrum. Tio sekunder är så länge det är rimligt att låta
 *      kunden se en spinner; därefter tar betalstegets "Kontrollera igen"
 *      vid — aldrig en tyst låsning, och aldrig en tyst väntan.
 */
async function verifieraBetalning(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch('/api/billing/onboarding-checkout/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
    const svar = await res.json().catch(() => ({}))
    if (svar?.paid) return true
    if (!svar?.pending) return false
  } catch {
    // Nätverksfel — fall igenom till pollingen nedan
  }

  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 2000))
    try {
      const res = await fetch('/api/onboarding')
      if (!res.ok) continue
      const d = await res.json()
      if (d?.paid) return true
    } catch {
      // fortsätt försöka
    }
  }
  return false
}

/**
 * Onboarding-orchestrator (Claude Design redesign).
 *
 * Step-mappning till business_config.onboarding_step (2026-09-02, tasks/
 * plan-genomgang-fore-betalning.md — betalningen flyttades EFTER importen
 * och en genomgång av kundens egen firma, ingen prova-på före betalning):
 *   0 = Step1MeetTheTeam    (intro, ingen DB)
 *   1 = Step2Business       (account skapas, businessId sätts)
 *   2 = Step3HowYouWork     (specialties + hours + price)
 *   3 = Step4PhoneNumber    (phone reserveras)
 *   4 = StepImportData      (hämta in kunder + öppna fakturor — Fortnox/CSV)
 *   5 = StepGenomgang       (räknefrågor mot kundens egen firma, ingen AI)
 *   6 = Step5Activate       (Stripe payment)
 *   7 = StepProductRegister (granska det redan seedade produktregistret, 2026-08-16)
 *   8 = Step6LiveTour       (live tour, klar = onboarding_completed_at)
 *
 * Resume-logik: Vid sidvisning hämtas onboarding_step från DB.
 * Användaren landar på rätt steg om de stängt mitt i flödet. Konton sparade
 * FÖRE 2026-09-02 kan ha ett onboarding_step 5–7 som följde den GAMLA
 * ordningen (4 = betalning) — de landar då ett steg "för tidigt" i den nya
 * ordningen. Ingen omräkning görs (medveten oskärpa, samma hållning som
 * lib/onboarding/funnel.ts); redan betalande konton låses ändå aldrig ute av
 * detta eftersom paid-guarden i Step5Activate hoppar vidare direkt.
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
  // Företagsskannern-handoff (2026-09-02, tasks/plan-foretagsskannern.md):
  // varianten i tratten (lib/onboarding/funnel.ts) ska bli 'skanner' när
  // besökaren kom via ?via=skanner ELLER redan hade ett underlag liggande
  // (icke-förstörande koll — StepImportData konsumerar det faktiska
  // underlaget senare via lasOchRensaUnderlag).
  const [viaSkanner, setViaSkanner] = useState(false)

  useEffect(() => {
    setStudioMode(resolveSetupStudioMode(
      process.env.NEXT_PUBLIC_SETUP_STUDIO_ENABLED,
      window.location.search,
      readSetupStudioPreference(),
    ))
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('via') === 'skanner' || harForetagsskannernUnderlag()) setViaSkanner(true)
    } catch { /* ignorera — då stämplas den vanliga varianten i stället */ }
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

        // Retur från Stripe Checkout (onboarding-betalning). Importen och
        // genomgången ligger nu FÖRE betalningen (steg 4–5) — kunden har
        // redan sett dem, så en lyckad betalning går direkt vidare till
        // artikelsteget i stället för att backa igenom dem igen.
        //  ?payment=success → VERIFIERAS mot Stripe (2026-09-02). Tidigare
        //    räckte query-strängen för att hoppa till steg 7; nu frågar vi
        //    /verify med session_id och går bara vidare om Stripe säger
        //    betald. Telefonnumret provisioneras av webhooken; Step6 läser
        //    assigned_phone_number.
        //  ?payment=cancelled → kunden avbröt. Landa kvar på betalsteget (6)
        //    så de kan försöka igen. Aldrig fastna.
        const params = new URLSearchParams(window.location.search)
        const payment = params.get('payment')
        const sessionId = params.get('session_id')
        let betald = Boolean(d.paid)
        if (payment === 'success') {
          if (!betald && sessionId) {
            betald = await verifieraBetalning(sessionId)
          }
          if (betald) {
            uiStep = 7
            // Persistera framsteget (best-effort) och städa URL:en.
            if (d.business_id) {
              fetch('/api/onboarding', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ step: 7, data: {}, config: {} }),
              }).catch(() => {})
            }
          } else {
            // Betalningen är inte bekräftad — stanna på betalsteget.
            // Step5Activate visar "registreras just nu" och en knapp att
            // kontrollera igen, i stället för att låsa kunden ute.
            uiStep = 6
          }
          window.history.replaceState({}, '', '/onboarding')
        } else if (payment === 'cancelled') {
          uiStep = 6
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
          // Redan betalande konton ska ALDRIG se betalsteget igen — Step5Activate
          // hoppar vidare direkt när paid är sant (samma server-härledda fält,
          // aldrig en klientsidan-gissning).
          paid: betald,
          paymentPending: payment === 'success' && !betald,
          // Ett äldre, uttryckligt sparat standardpris får visas igen, men
          // prismodellen väljs fortfarande av ägaren — inget inferred val.
          standardHourlyRate: (d.onboarding_data || {}).standardHourlyRate ?? d.default_hourly_rate ?? null,
        }

        // Demokontot har subscription_status='active' (det ÄR ett aktivt
        // konto) — men "Visa onboardingen"-replayen ska visa betalsteget i
        // simulerat läge, inte hoppa över det via paid-guarden. Demo är
        // aldrig en riktig resume-mitt-i-betalning, så undantaget är säkert.
        // (Återinfört 2026-09-04: 6ea39c3 skrev in undantaget från en gammal
        // kopia av filen och tappade Stripe-verifieringen och skannervarianten.)
        if (isDemoBusinessId(d.business_id)) restored.paid = false

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
          // 'skanner' vinner över studio/classic — det säger VARIFRÅN kunden
          // kom, inte vilken guide-UI som visades.
          body: JSON.stringify({
            step: s,
            data: extraData || {},
            config: config || {},
            variant: viaSkanner ? 'skanner' : (studioMode ? 'studio' : 'classic'),
          }),
        })
      } catch {
        // Silent — onboarding fortsätter ändå, kan resume senare
      }
    },
    [data.businessId, studioMode, viaSkanner],
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
        <StepImportData onNext={next} onBack={back} data={data} setData={setDataUpdater} />
      )}
      {step === 5 && (
        <StepGenomgang onNext={next} onBack={back} data={data} setData={setDataUpdater} />
      )}
      {step === 6 && (
        <Step5Activate onNext={next} onBack={back} data={data} setData={setDataUpdater} />
      )}
      {step === 7 && (
        <StepProductRegister onNext={next} onBack={back} data={data} setData={setDataUpdater} />
      )}
      {step === 8 && !launchRequested && <Step6LiveTour onFinish={finish} data={data}
        onFirstQuote={data.firstQuoteSelection ? () => setLaunchRequested(true) : undefined} />}
      {step === 8 && launchRequested && (launchJob && launchTemplate ?
        <FirstQuoteLaunch companyName={data.companyName || 'Ditt företag'} jobName={launchJob.name} templateName={launchTemplate.name}
          onContinue={launchFirstQuote} onSkip={finish} /> :
        <section className="first-quote-launch" aria-label="Din första offert">
          <h2>Vi tar med ditt upplägg</h2>
          {quoteSetupError || quoteSetup ? <>
            <p role="alert">{quoteSetupError ? 'Kunde inte läsa underlaget just nu.' : 'Ditt underlag har ändrats. Välj jobbtyp och mall igen i artikelsteget.'}</p>
            <button type="button" className="first-quote-open" onClick={() => setSetupRetry(n => n + 1)}>Försök igen</button>
            <button type="button" className="first-quote-skip" onClick={() => { setLaunchRequested(false); setStep(7) }}>Till artikelsteget</button>
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
        <div className="ob-stage" data-guided={step > 0 && step < 8 ? 'true' : undefined}>
          {step > 0 && step < 8 && <MatteSetupGuide step={step} data={data} />}
          {onboardingStep}
        </div>
      )}

      {/* Finalize-fel (Fynd 6): navigera ALDRIG till dashboarden på ett
          misslyckat finalize-anrop — visa fel + låt kunden försöka igen. */}
      {step === 8 && finishError && (
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
