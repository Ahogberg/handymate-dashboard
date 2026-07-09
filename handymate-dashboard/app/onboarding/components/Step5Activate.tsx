'use client'

import { useState } from 'react'
import { ArrowRight, Check, Info, Loader2, Shield } from 'lucide-react'
import OnboardingHeader from './OnboardingHeader'
import InfoSheet from './InfoSheet'
import { TEAM } from '@/lib/agents/team'
import type { OnboardingFormData } from '../types-redesign'

/**
 * Andreas pilot-feedback (2026-06-03): plan-cards behöver visuell ankare
 * via agent-avatars + rich-content InfoSheet med "vilka fördelar".
 * agents-array listar vilka TEAM-IDs som ingår; valueBullets används i
 * InfoSheet för "typiskt värde + när byter folk upp"-kontext.
 */
const PLANS = [
  {
    id: 'starter',
    name: 'Bas',
    price: 2495,
    popular: false,
    agents: ['lisa', 'karin'],
    features: ['Lisa svarar i telefonen åt dig', 'Karin följer fakturor', 'Upp till 50 samtal/mån'],
    valueBullets: [
      'Du missar inga samtal — Lisa svarar 24/7 även när du är på taket',
      'Karin nudgar förfallna fakturor automatiskt (med ditt godkännande)',
      'Passar enmansföretagare som vill släppa telefonen',
    ],
    upgradeHint: 'När du börjar skicka 5+ offerter/månad är det dags att titta på Pro (Daniel följer dem).',
  },
  {
    id: 'professional',
    name: 'Pro',
    price: 5995,
    popular: true,
    agents: ['lisa', 'karin', 'daniel', 'hanna'],
    features: ['Hela försäljnings- och kund-teamet', 'Obegränsade samtal', 'Offert-uppföljning + SMS-kampanjer'],
    valueBullets: [
      'Daniel följer obeöppnade offerter och föreslår SMS-påminnelser',
      'Hanna kör säsongs-kampanjer och kund-reaktivering',
      'Karin + Daniel samarbetar kring offert→faktura-flödet',
      'Lämplig om du har 3+ pågående offerter samtidigt',
    ],
    upgradeHint: 'När ditt team växer eller du vill ha Lars projektledning, gå till Business.',
  },
  {
    id: 'business',
    name: 'Business',
    price: 11995,
    popular: false,
    agents: ['lisa', 'karin', 'daniel', 'hanna', 'lars', 'matte'],
    features: ['Allt i Pro', 'Lars projektledning', 'Matte chef-assistent', 'Egen onboarding-coach'],
    valueBullets: [
      'Lars håller koll på marginal och flagga projekt som tappar pengar',
      'Matte är din personliga assistent som koordinerar allt',
      'Egen onboarding-coach hjälper dig komma igång snabbt',
      'Passar dig med flera anställda eller 5+ samtidiga projekt',
    ],
    upgradeHint: 'Du är på toppen — kontakta oss om ni har special-behov.',
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
 * inbäddat CardElement. Detta skapar en RIKTIG prenumeration med 30 dagars
 * provperiod. De gamla /api/billing/setup-intent + /api/billing/confirm är
 * ERSATTA (satte bara subscription_status:'trialing' utan att skapa någon
 * Stripe-prenumeration → kunden debiterades aldrig). Routes finns kvar orörda
 * men anropas inte längre härifrån.
 */
export default function Step5Activate({ onNext, onBack, data, setData }: Step5Props) {
  const plan = data.plan || 'professional'
  const setPlan = (id: string) => setData(d => ({ ...d, plan: id }))

  const [redirecting, setRedirecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [infoPlanId, setInfoPlanId] = useState<string | null>(null)

  async function handleSubmit() {
    if (redirecting) return
    setRedirecting(true)
    setError(null)

    try {
      const res = await fetch('/api/billing/onboarding-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan }),
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

  const selectedPlan = PLANS.find(p => p.id === plan) || PLANS[1]

  return (
    <div className="ob-screen">
      <OnboardingHeader step={3} total={4} onBack={onBack} />
      <div className="ob-body">
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
                30 dagars resultatgaranti
              </strong>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ob-ink-2)', lineHeight: 1.45 }}>
              Hanterar inte AI-teamet minst <strong>5 kundkontakter</strong> åt dig — eller är
              du av någon anledning inte nöjd — får du{' '}
              <strong>pengarna tillbaka</strong>. Inga frågor.
            </p>
          </div>
        </div>

        {/* Plan picker */}
        <label className="ob-label" style={{ marginBottom: 10 }}>
          Välj plan
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {PLANS.map(p => (
            <PlanCard
              key={p.id}
              plan={p}
              active={plan === p.id}
              onSelect={() => setPlan(p.id)}
              onInfo={() => setInfoPlanId(p.id)}
            />
          ))}
        </div>

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
            Du anger kortuppgifterna säkert hos Stripe i nästa steg. Inget dras nu —
            provperioden är 30 dagar.
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
            'Kort dras inte direkt om garantin utlöses',
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
        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--ob-muted)' }}>
          {selectedPlan.price.toLocaleString('sv-SE')} kr/mån · Säker betalning via Stripe
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
    popular: boolean
    agents: string[]
    features: string[]
    valueBullets: string[]
    upgradeHint: string
  }
  active: boolean
  onSelect: () => void
  onInfo: () => void
}

function PlanCard({ plan, active, onSelect, onInfo }: PlanCardProps) {
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
        <div>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ob-ink)' }}>
            {plan.price.toLocaleString('sv-SE')}
          </span>
          <span style={{ fontSize: 12, color: 'var(--ob-muted)', marginLeft: 2 }}>kr/mån</span>
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
