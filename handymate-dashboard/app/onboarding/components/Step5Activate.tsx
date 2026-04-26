'use client'

import { useEffect, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { ArrowRight, Check, Loader2, Shield } from 'lucide-react'
import OnboardingHeader from './OnboardingHeader'
import type { OnboardingFormData } from '../types-redesign'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const PLANS = [
  {
    id: 'starter',
    name: 'Bas',
    price: 2495,
    popular: false,
    features: ['Lisa svarar i telefonen', 'Karin följer fakturor', 'Upp till 50 samtal/mån'],
  },
  {
    id: 'professional',
    name: 'Pro',
    price: 5995,
    popular: true,
    features: ['Hela AI-teamet aktivt', 'Obegränsade samtal', 'SMS-kampanjer (Hanna)', 'Offert-uppföljning (Daniel)'],
  },
  {
    id: 'business',
    name: 'Business',
    price: 11995,
    popular: false,
    features: ['Allt i Pro', 'Egen onboarding-coach', 'Prioriterad support', 'Anpassad röst för Lisa'],
  },
]

interface Step5Props {
  onNext: () => void
  onBack: () => void
  data: OnboardingFormData
  setData: (updater: (d: OnboardingFormData) => OnboardingFormData) => void
}

export default function Step5Activate(props: Step5Props) {
  return (
    <Elements stripe={stripePromise}>
      <Step5Inner {...props} />
    </Elements>
  )
}

function Step5Inner({ onNext, onBack, data, setData }: Step5Props) {
  const stripe = useStripe()
  const elements = useElements()
  const plan = data.plan || 'professional'
  const setPlan = (id: string) => setData(d => ({ ...d, plan: id }))

  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [planLoading, setPlanLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cardReady, setCardReady] = useState(false)

  useEffect(() => {
    setPlanLoading(true)
    setError(null)
    setClientSecret(null)

    fetch('/api/billing/setup-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: plan }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.clientSecret) {
          setClientSecret(d.clientSecret)
        } else {
          setError(d.error || 'Kunde inte initiera betalning')
        }
      })
      .catch(() => setError('Nätverksfel — försök igen'))
      .finally(() => setPlanLoading(false))
  }, [plan])

  async function handleSubmit() {
    if (!stripe || !elements || !clientSecret || processing) return
    setProcessing(true)
    setError(null)

    const cardEl = elements.getElement(CardElement)
    if (!cardEl) {
      setProcessing(false)
      return
    }

    const { setupIntent, error: stripeError } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card: cardEl },
    })

    if (stripeError) {
      setError(stripeError.message || 'Kortfel — kontrollera uppgifterna')
      setProcessing(false)
      return
    }

    if (setupIntent?.status === 'succeeded') {
      const res = await fetch('/api/billing/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupIntentId: setupIntent.id, planId: plan }),
      })

      if (res.ok) {
        onNext()
      } else {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Kunde inte bekräfta betalning')
        setProcessing(false)
      }
    } else {
      setProcessing(false)
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
            />
          ))}
        </div>

        {/* Stripe card element — riktig integration */}
        <label className="ob-label" style={{ marginBottom: 10 }}>
          Betalkort
        </label>
        <div
          style={{
            padding: '14px 16px',
            border: '1px solid var(--ob-border)',
            borderRadius: 'var(--ob-r-md)',
            background: 'var(--ob-surface)',
            marginBottom: 10,
            minHeight: 50,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {planLoading ? (
            <Loader2
              size={18}
              className="animate-spin"
              style={{ color: 'var(--ob-primary-700)' }}
            />
          ) : (
            <div style={{ width: '100%' }}>
              <CardElement
                onChange={e => setCardReady(e.complete)}
                options={{
                  style: {
                    base: {
                      fontSize: '16px',
                      color: '#0F172A',
                      fontFamily:
                        '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
                      '::placeholder': { color: '#94A3B8' },
                    },
                    invalid: { color: '#EF4444' },
                  },
                  hidePostalCode: true,
                }}
              />
            </div>
          )}
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
          disabled={!stripe || processing || !clientSecret || !cardReady}
          onClick={handleSubmit}
        >
          {processing ? (
            <>
              <Loader2 size={18} className="animate-spin" /> Behandlar…
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
    </div>
  )
}

interface PlanCardProps {
  plan: { id: string; name: string; price: number; popular: boolean; features: string[] }
  active: boolean
  onSelect: () => void
}

function PlanCard({ plan, active, onSelect }: PlanCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
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
          marginBottom: 4,
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
      <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0' }}>
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
    </button>
  )
}
