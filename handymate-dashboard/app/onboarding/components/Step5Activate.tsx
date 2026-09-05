'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Check, Info, Loader2, Shield } from 'lucide-react'
import OnboardingHeader from './OnboardingHeader'
import { OB_DOTS, OB_DOT_TOTAL } from '../constants'
import InfoSheet from './InfoSheet'
import { TEAM } from '@/lib/agents/team'
import {
  FOUNDERS_GUARANTEE_DAYS,
  STANDARD_GUARANTEE_DAYS,
  getPlanCommercialFacts,
  YEARLY_MONTHS_FREE,
} from '@/lib/feature-gates'
import { isDemoBusinessId } from '@/lib/demo/is-demo-client'
import type { OnboardingFormData } from '../types-redesign'

/**
 * Andreas pilot-feedback (2026-06-03): plan-cards behöver visuell ankare
 * via agent-avatars + rich-content InfoSheet med "vilka fördelar".
 * agents-array listar vilka TEAM-IDs som ingår; valueBullets används i
 * InfoSheet för "typiskt värde + när byter folk upp"-kontext.
 *
 * Andreas-beslut 2026-07-31: Starter/Bas borttagen ur köpflödet — publikt
 * utbud är nu bara Professional (ingång, hela teamet) + Business (volym/
 * fler användare) + "Anpassad — kontakta oss". Plantypen 'starter' finns
 * kvar i lib/feature-gates.ts och backend (tyst nedgradering + befintliga
 * konton) — se kommentar där för motivering.
 */
// Svenska namn (Andreas-beslut 2026-07-31): Firman och Storfirman. Interna
// id:n byts aldrig. VIKTIGT: BÅDA planerna ger hela AI-teamet (sex
// medarbetare) OCH obegränsat antal användare — det är kategorilöftet;
// skillnaden är ENDAST volym (samtal/SMS), aldrig agenter eller antal
// människor (Andreas-beslut 2026-09-01 tog bort Firmans användartak —
// tidigare copy här påstod fel att Lars/Matte krävde Business, och senare
// att headcount var en spärr).
const FIRMAN_FACTS = getPlanCommercialFacts('professional')
const STORFIRMAN_FACTS = getPlanCommercialFacts('business')

const PLANS = [
  {
    id: 'professional',
    name: 'Firman',
    price: FIRMAN_FACTS.monthlyPriceSek,
    yearlyPrice: FIRMAN_FACTS.yearlyPriceSek,
    popular: true,
    agents: ['lisa', 'karin', 'daniel', 'hanna', 'lars', 'matte'],
    // Utfall, inte funktioner (Andreas-beslut 2026-08-09): varje rad svarar
    // på en smärta hantverkaren känner. Rad 2–3 är det ingen nordisk
    // konkurrent kan säga — moaten är svensk back-office, inte "AI-team".
    // Avatarraden visar redan de sex medarbetarna; texten upprepar det inte.
    features: [
      'Missat samtal? Kunden får svar inom 30 sekunder — under era öppettider',
      'Färdig offert på minuter — ROT-avdraget rätt räknat',
      'Jobbet klart → fakturan skapad. Inget glöms',
      'Tyst vecka? Teamet föreslår utskicket som fyller den',
    ],
    valueBullets: [
      'Daniel följer upp offerter som blivit liggande',
      'Hanna väcker gamla kunder med kampanjer och serviceavtal',
      'Karin förbereder fakturor och påminnelser åt dig',
      'Räcker gott och väl för de flesta firmor',
    ],
    upgradeHint: 'Ringer och smsar ni mycket? Då är Storfirman rätt.',
  },
  {
    id: 'business',
    name: 'Storfirman',
    price: STORFIRMAN_FACTS.monthlyPriceSek,
    yearlyPrice: STORFIRMAN_FACTS.yearlyPriceSek,
    popular: false,
    agents: ['lisa', 'karin', 'daniel', 'hanna', 'lars', 'matte'],
    features: ['Allt i Firman', 'Obegränsade samtal', 'Större utrymme för SMS & utskick', 'Egen hemsida med SEO', 'Dedikerad support'],
    valueBullets: [
      'Hela teamet loggar in — tidrapporter och projekt på ett ställe',
      'Lars håller koll på marginalerna när projekten blir fler',
      'Större utrymme för utskick när kundbasen växer',
      'När samtalen och SMS-utskicken blir många',
    ],
    upgradeHint: 'Ännu större volym eller flera bolag? Hör av dig så skräddarsyr vi.',
  },
]

interface Step5Props {
  onNext: () => void
  onBack: () => void
  data: OnboardingFormData
  setData: (updater: (d: OnboardingFormData) => OnboardingFormData) => void
}

/**
 * Betalning sker numera på Stripes hostade Checkout-sida (redirect), inte via
 * inbäddat CardElement. Detta skapar en RIKTIG prenumeration som debiteras
 * DIREKT (ingen provperiod — modellen är betala direkt + resultatgaranti). De
 * gamla /api/billing/setup-intent + /api/billing/confirm är ERSATTA (satte bara
 * subscription_status:'trialing' utan att skapa någon Stripe-prenumeration →
 * kunden debiterades aldrig). Routes finns kvar orörda men anropas inte längre.
 */
export default function Step5Activate({ onNext, onBack, data, setData }: Step5Props) {
  // Demokontot: hoppa Stripe-checkouten helt (INGA Stripe-anrop) — knappen
  // går direkt vidare. Garantitexten/plan-vyn visas som vanligt (det ÄR
  // demon av steget). Icke-demo-vägen (handleSubmit nedan) är oförändrad.
  const isDemo = isDemoBusinessId(data.businessId)

  const plan = data.plan || 'professional'
  const setPlan = (id: string) => setData(d => ({ ...d, plan: id }))

  // Årsavtal (Andreas-beslut 2026-08-31, ersätter 2026-08-19): default Årsvis
  // — sajten frontar nu det lägre månadsekvivalenta årspriset, köpflödet
  // ska matcha (beloppen kommer alltid från getPlanYearlyPrice, aldrig här).
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('yearly')
  const [redirecting, setRedirecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [infoPlanId, setInfoPlanId] = useState<string | null>(null)
  const [kontrollerar, setKontrollerar] = useState(false)
  const [kontrollSvar, setKontrollSvar] = useState<string | null>(null)

  // Betalningen är gjord hos Stripe men ännu inte bekräftad hos oss (3DS/SCA,
  // eller webhooken har inte hunnit). Kunden ska varken släppas igenom obetald
  // eller låsas ute — härifrån frågar den servern igen.
  async function kontrolleraBetalning() {
    if (kontrollerar) return
    setKontrollerar(true)
    setKontrollSvar(null)
    try {
      const res = await fetch('/api/onboarding')
      const d = await res.json().catch(() => ({}))
      if (d?.paid) {
        setData(prev => ({ ...prev, paid: true, paymentPending: false }))
        onNext()
        return
      }
      setKontrollSvar('Betalningen är inte registrerad än. Vänta en stund och kontrollera igen.')
    } catch {
      setKontrollSvar('Kunde inte kontrollera just nu — försök igen om en stund.')
    }
    setKontrollerar(false)
  }

  // Betalgrind, andra hållet (2026-09-02, tasks/plan-genomgang-fore-
  // betalning.md): data.paid är server-härlett i GET /api/onboarding med samma
  // regel som betalgrinden — redan betalande konton ska ALDRIG se betalsteget
  // igen, t.ex. vid en resume mitt i onboardingen.
  useEffect(() => {
    if (data.paid) onNext()
  }, [data.paid, onNext])

  if (data.paid) {
    return (
      <div className="ob-screen">
        <OnboardingHeader step={OB_DOTS.activate} total={OB_DOT_TOTAL} onBack={onBack} />
        <div className="ob-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100%' }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ob-ink)' }}>
            Betalningen är klar — vi går vidare …
          </p>
        </div>
      </div>
    )
  }

  async function handleSubmit() {
    if (redirecting) return
    setRedirecting(true)
    setError(null)

    try {
      const res = await fetch('/api/billing/onboarding-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan, interval: billingInterval }),
      })
      const d = await res.json().catch(() => ({}))

      if (res.ok && d.url) {
        // Skicka användaren till Stripes hostade betalsida. Vid genomförd
        // betalning kommer de tillbaka till /onboarding?payment=success.
        window.location.href = d.url
        return
      }

      setError(d.error || 'Kunde inte starta betalningen — försök igen')
      setRedirecting(false)
    } catch {
      setError('Nätverksfel — försök igen')
      setRedirecting(false)
    }
  }

  const selectedPlan = PLANS.find(p => p.id === plan) || PLANS[0]
  const guaranteeDays = data.foundersAvailable
    ? FOUNDERS_GUARANTEE_DAYS
    : STANDARD_GUARANTEE_DAYS

  return (
    <div className="ob-screen">
      <OnboardingHeader step={OB_DOTS.activate} total={OB_DOT_TOTAL} onBack={onBack} />
      <div className="ob-body">
        {/* Kunden kom tillbaka från Stripe men betalningen är inte bekräftad
            än (verifieringen i app/onboarding/page.tsx sa nej). Visa läget
            ärligt i stället för att antingen släppa igenom eller låsa ute. */}
        {data.paymentPending && (
          <div
            className="ob-card"
            style={{ marginBottom: 16, borderColor: '#FDE68A', background: '#FFFBEB' }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ob-ink)', marginBottom: 4 }}>
              Betalningen registreras
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--ob-ink-2)', lineHeight: 1.45 }}>
              Det tar normalt några sekunder. Du behöver inte betala igen.
            </p>
            <button
              type="button"
              onClick={kontrolleraBetalning}
              disabled={kontrollerar}
              className="ob-cta ghost"
              style={{ fontSize: 13, padding: '10px 16px', width: 'auto' }}
            >
              {kontrollerar ? 'Kontrollerar …' : 'Kontrollera igen'}
            </button>
            {kontrollSvar && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--ob-muted)' }}>{kontrollSvar}</p>
            )}
          </div>
        )}

        {/* Genomgången (StepGenomgang, steget precis före det här — tasks/
            plan-genomgang-fore-betalning.md, 2026-09-02): kunden betalar
            för något den redan sett i sina egna siffror, aldrig ett löfte. */}
        {data.genomgang && data.genomgang.length > 0 ? (
          <div className="ob-card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ob-ink)', marginBottom: 8 }}>
              Det här hittade teamet i din firma
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.genomgang.slice(0, 5).map(row => (
                <li key={row.key} style={{ fontSize: 13, color: 'var(--ob-ink-2)', lineHeight: 1.4 }}>
                  {row.text}
                </li>
              ))}
            </ul>
            {data.genomgang.length > 5 && (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--ob-muted)' }}>
                +{data.genomgang.length - 5} till
              </p>
            )}
          </div>
        ) : (
          <div className="ob-card" style={{ marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ob-ink-2)' }}>
              Teamet börjar med din första offert så fort du aktiverat.
            </p>
          </div>
        )}

        {/* Lanseringserbjudandet "Grundarkunderna" (Andreas-beslut 2026-08-19)
            — server-härlett via data.foundersAvailable (GET /api/onboarding,
            lib/billing/founders-offer.ts). Ingen banner alls när flaggan är
            false/undefined — ingen "platserna är slut"-text i V1. */}
        {data.foundersAvailable && (
          <div
            style={{
              background: 'linear-gradient(135deg, #FFFBEB 0%, var(--ob-primary-50) 100%)',
              border: '1.5px solid #FDE68A',
              borderRadius: 'var(--ob-r-2xl)',
              padding: '18px 18px',
              marginBottom: 14,
            }}
          >
            <strong
              style={{
                display: 'block',
                fontSize: 15,
                color: 'var(--ob-primary-700)',
                letterSpacing: '-0.01em',
                marginBottom: 4,
              }}
            >
              Lanseringserbjudande — Grundarkunderna
            </strong>
            <p style={{ fontSize: 13, color: 'var(--ob-ink-2)', lineHeight: 1.45 }}>
              Just nu finns grundarkundsplatser kvar: ditt pris låses för alltid, du får {FOUNDERS_GUARANTEE_DAYS} dagars resultatgaranti och en direktlinje till grundaren under hela första året.
            </p>
          </div>
        )}

        {/* Guarantee banner — DOMINERANDE, inte fotnot */}
        <div
          style={{
            background: 'linear-gradient(135deg, var(--ob-primary-50) 0%, #ECFDF5 100%)',
            border: '1.5px solid var(--ob-primary-100)',
            borderRadius: 'var(--ob-r-2xl)',
            padding: '18px 18px',
            display: 'flex',
            gap: 14,
            marginBottom: 24,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              flexShrink: 0,
              borderRadius: 'var(--ob-r-md)',
              background: 'var(--ob-primary-700)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(15,118,110,0.25)',
            }}
          >
            <Shield size={22} strokeWidth={2.2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 4,
              }}
            >
              <strong
                style={{
                  fontSize: 15,
                  color: 'var(--ob-primary-700)',
                  letterSpacing: '-0.01em',
                }}
              >
                {guaranteeDays} dagars resultatgaranti
              </strong>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ob-ink-2)', lineHeight: 1.45 }}>
              Hanterar inte AI-teamet minst <strong>5 kundkontakter</strong> åt dig — eller är
              du av någon anledning inte nöjd — får du{' '}
              <strong>pengarna tillbaka</strong>. Inga frågor.
            </p>
            {billingInterval === 'yearly' && (
              <p style={{ fontSize: 12, color: 'var(--ob-primary-700)', fontWeight: 600, marginTop: 6 }}>
                Gäller även årsavtal.
              </p>
            )}
          </div>
        </div>

        {/* Månadsvis/Årsvis (Andreas-beslut 2026-08-19) — ovanför plankorten,
            default Månadsvis. */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: 4,
            background: 'var(--ob-surface)',
            border: '1px solid var(--ob-border)',
            borderRadius: 'var(--ob-r-pill)',
            marginBottom: 14,
          }}
        >
          <button
            type="button"
            onClick={() => setBillingInterval('monthly')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 'var(--ob-r-pill)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              background: billingInterval === 'monthly' ? 'var(--ob-primary-700)' : 'transparent',
              color: billingInterval === 'monthly' ? '#fff' : 'var(--ob-ink-2)',
            }}
          >
            Månadsvis
          </button>
          <button
            type="button"
            onClick={() => setBillingInterval('yearly')}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 'var(--ob-r-pill)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              background: billingInterval === 'yearly' ? 'var(--ob-primary-700)' : 'transparent',
              color: billingInterval === 'yearly' ? '#fff' : 'var(--ob-ink-2)',
            }}
          >
            Årsvis
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.02em',
                padding: '2px 6px',
                borderRadius: 'var(--ob-r-pill)',
                background: billingInterval === 'yearly' ? 'rgba(255,255,255,0.25)' : 'var(--ob-primary-50)',
                color: billingInterval === 'yearly' ? '#fff' : 'var(--ob-primary-700)',
              }}
            >
              {YEARLY_MONTHS_FREE} månader på köpet
            </span>
          </button>
        </div>

        {/* Plan picker */}
        <label className="ob-label" style={{ marginBottom: 10 }}>
          Välj plan
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
          {PLANS.map(p => (
            <PlanCard
              key={p.id}
              plan={p}
              interval={billingInterval}
              active={plan === p.id}
              onSelect={() => setPlan(p.id)}
              onInfo={() => setInfoPlanId(p.id)}
            />
          ))}
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ob-muted)', marginBottom: 24 }}>
          {/* Supportärenden går till support@ (alias mot andreas@) — ett personnamn
              i betalsteget ser litet ut och överlever inte en organisation. */}
          Större företag med särskilda behov?{' '}
          <a href="mailto:support@handymate.se" style={{ color: 'var(--ob-primary-700)', fontWeight: 600 }}>
            Mejla oss på support@handymate.se
          </a>
        </p>

        {/* Betalning sker på Stripes säkra sida (redirect vid "Aktivera") */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            border: '1px solid var(--ob-border)',
            borderRadius: 'var(--ob-r-md)',
            background: 'var(--ob-surface)',
            marginBottom: 10,
          }}
        >
          <Shield size={18} style={{ color: 'var(--ob-primary-700)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--ob-ink-2)', lineHeight: 1.45 }}>
            Du anger kortuppgifterna säkert hos Stripe i nästa steg. Prenumerationen
            startar direkt — täckt av vår {guaranteeDays}-dagars resultatgaranti.
          </span>
        </div>

        {error && (
          <div
            style={{
              background: 'var(--ob-rose-50)',
              border: '1px solid #FECACA',
              borderRadius: 'var(--ob-r-md)',
              padding: 10,
              fontSize: 13,
              color: '#B91C1C',
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        {/* What happens next */}
        <div
          style={{
            background: 'var(--ob-surface)',
            border: '1px solid var(--ob-border)',
            borderRadius: 'var(--ob-r-lg)',
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--ob-ink)',
              marginBottom: 10,
            }}
          >
            Vad händer nu?
          </div>
          {[
            'Pengarna tillbaka om garantin inte infrias',
            'AI-teamet är aktivt från första minuten',
            'Avsluta när som helst',
          ].map((t, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                marginBottom: i < 2 ? 8 : 0,
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  flexShrink: 0,
                  borderRadius: '50%',
                  background: 'var(--ob-primary-50)',
                  color: 'var(--ob-primary-700)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 1,
                }}
              >
                <Check size={12} strokeWidth={2.5} />
              </span>
              <span style={{ fontSize: 13, color: 'var(--ob-ink-2)', lineHeight: 1.4 }}>
                {t}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="ob-footer">
        {isDemo ? (
          <button
            type="button"
            className="ob-cta"
            onClick={onNext}
          >
            Fortsätt (simulerat i demoläget) <ArrowRight size={18} />
          </button>
        ) : (
          <button
            type="button"
            className="ob-cta"
            disabled={redirecting}
            onClick={handleSubmit}
          >
            {redirecting ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Öppnar säker betalning…
              </>
            ) : (
              <>
                Aktivera Handymate <ArrowRight size={18} />
              </>
            )}
          </button>
        )}
        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--ob-muted)' }}>
          {isDemo
            ? 'Ingen betalning sker i demoläget.'
            : billingInterval === 'yearly' && selectedPlan.yearlyPrice != null
              ? `${selectedPlan.yearlyPrice.toLocaleString('sv-SE')} kr/år · Säker betalning via Stripe`
              : `${selectedPlan.price.toLocaleString('sv-SE')} kr/mån · Säker betalning via Stripe`}
        </p>
      </div>

      {/* Plan-fördelar InfoSheet */}
      {PLANS.map(p => {
        const planAgents = p.agents
          .map(id => TEAM.find(a => a.id === id))
          .filter((a): a is NonNullable<typeof a> => !!a)
        return (
          <InfoSheet
            key={`info-${p.id}`}
            open={infoPlanId === p.id}
            onClose={() => setInfoPlanId(null)}
            title={`${p.name} — vilka fördelar?`}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
              <strong style={{ fontSize: 18, color: 'var(--ob-ink)' }}>{p.name}</strong>
              <div>
                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ob-ink)' }}>
                  {p.price.toLocaleString('sv-SE')}
                </span>
                <span style={{ fontSize: 13, color: 'var(--ob-muted)', marginLeft: 4 }}>kr/mån</span>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--ob-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 8 }}>
                Ditt team i {p.name}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {planAgents.map(agent => (
                  <div
                    key={agent.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px 6px 6px',
                      background: 'var(--ob-bg)',
                      border: '1px solid var(--ob-border)',
                      borderRadius: 'var(--ob-r-pill)',
                    }}
                  >
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        backgroundImage: agent.avatar ? `url(${agent.avatar})` : undefined,
                        backgroundColor: 'var(--ob-primary-50)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ob-ink)' }}>
                      {agent.name}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--ob-muted)' }}>
                      {agent.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--ob-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 8 }}>
                Vad du får
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {p.valueBullets.map((b, i) => (
                  <li
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      fontSize: 14,
                      color: 'var(--ob-ink-2)',
                      lineHeight: 1.5,
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ color: 'var(--ob-primary-700)', flexShrink: 0, marginTop: 4 }}>
                      <Check size={14} strokeWidth={2.5} />
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>

            <div
              style={{
                padding: 12,
                background: 'var(--ob-primary-50)',
                border: '1px solid var(--ob-primary-100)',
                borderRadius: 'var(--ob-r-md)',
                fontSize: 13,
                color: 'var(--ob-ink-2)',
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: 'var(--ob-primary-700)' }}>När byter folk upp?</strong>
              <br />
              {p.upgradeHint}
            </div>
          </InfoSheet>
        )
      })}
    </div>
  )
}

interface PlanCardProps {
  plan: {
    id: string
    name: string
    price: number
    yearlyPrice: number | null
    popular: boolean
    agents: string[]
    features: string[]
    valueBullets: string[]
    upgradeHint: string
  }
  interval: 'monthly' | 'yearly'
  active: boolean
  onSelect: () => void
  onInfo: () => void
}

function PlanCard({ plan, interval, active, onSelect, onInfo }: PlanCardProps) {
  // Årsvis: kortpriset visar årsbeloppet + en underrad med
  // månadsekvivalenten, allt räknat ur plan.price/plan.yearlyPrice
  // (feature-gates.getPlanPrice/getPlanYearlyPrice) — aldrig hårdkodat.
  const showYearly = interval === 'yearly' && plan.yearlyPrice != null
  const monthlyEquivalent = showYearly ? Math.round((plan.yearlyPrice as number) / 12) : null
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      style={{
        width: '100%',
        padding: 16,
        background: active ? 'var(--ob-primary-50)' : 'var(--ob-surface)',
        border: `1.5px solid ${active ? 'var(--ob-primary-700)' : 'var(--ob-border)'}`,
        borderRadius: 'var(--ob-r-lg)',
        cursor: 'pointer',
        textAlign: 'left',
        position: 'relative',
        transition: 'all var(--ob-t-fast)',
        boxShadow: active ? 'var(--ob-sh-glow)' : 'none',
        fontFamily: 'inherit',
      }}
    >
      {plan.popular && (
        <span
          style={{
            position: 'absolute',
            top: -10,
            right: 14,
            padding: '4px 10px',
            background: 'var(--ob-ink)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            borderRadius: 'var(--ob-r-pill)',
            textTransform: 'uppercase',
          }}
        >
          POPULÄRAST
        </span>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <strong style={{ fontSize: 17, color: 'var(--ob-ink)', letterSpacing: '-0.01em' }}>
          {plan.name}
        </strong>
        <div style={{ textAlign: 'right' }}>
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ob-ink)' }}>
              {(showYearly ? (plan.yearlyPrice as number) : plan.price).toLocaleString('sv-SE')}
            </span>
            <span style={{ fontSize: 12, color: 'var(--ob-muted)', marginLeft: 2 }}>
              {showYearly ? 'kr/år' : 'kr/mån'}
            </span>
          </div>
          {monthlyEquivalent !== null && (
            <div style={{ fontSize: 11, color: 'var(--ob-muted)', marginTop: 2 }}>
              motsvarar ~{monthlyEquivalent.toLocaleString('sv-SE')} kr/mån — {YEARLY_MONTHS_FREE} månader på köpet
            </div>
          )}
        </div>
      </div>

      {/* Agent-avatars (Andreas pilot-feedback 2026-06-03): visuell ankare
          för "vilka är med i denna plan". Stackade cirklar med svag border. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 8, marginBottom: 10 }}>
        {plan.agents.map((agentId, i) => {
          const agent = TEAM.find(a => a.id === agentId)
          if (!agent) return null
          return (
            <div
              key={agentId}
              title={`${agent.name} · ${agent.role}`}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                backgroundImage: agent.avatar ? `url(${agent.avatar})` : undefined,
                backgroundColor: 'var(--ob-primary-50)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                border: '2px solid var(--ob-surface)',
                marginLeft: i === 0 ? 0 : -8,
                zIndex: plan.agents.length - i,
                flexShrink: 0,
              }}
            />
          )
        })}
        <span style={{ fontSize: 11, color: 'var(--ob-muted)', marginLeft: 8 }}>
          {plan.agents.length} agenter
        </span>
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: '0' }}>
        {plan.features.map(f => (
          <li
            key={f}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontSize: 12,
              color: 'var(--ob-ink-2)',
              lineHeight: 1.4,
              marginBottom: 4,
            }}
          >
            <span style={{ color: 'var(--ob-primary-700)', flexShrink: 0, marginTop: 1 }}>
              <Check size={12} strokeWidth={2.5} />
            </span>
            {f}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onInfo() }}
        style={{
          marginTop: 10,
          padding: '4px 8px 4px 0',
          background: 'transparent',
          border: 0,
          color: 'var(--ob-primary-700)',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <Info size={12} /> Vilka fördelar?
      </button>
    </div>
  )
}
