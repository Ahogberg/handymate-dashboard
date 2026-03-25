'use client'

import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Loader2, Shield, Lock, Check, ChevronRight } from 'lucide-react'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const PLANS = [
  { id: 'starter', name: 'Bas', price: '2 495', monthly: 2495, features: ['AI-telefonassistent', 'Offerter & Fakturor', 'Kundhantering', 'Pipeline', '3 användare'] },
  { id: 'professional', name: 'Pro', price: '5 995', monthly: 5995, popular: true, features: ['Allt i Bas +', 'Automationer & Nurture', 'Lead-generering', 'Offertmallar (obegränsat)', '25 användare', 'Fortnox-integration'] },
  { id: 'business', name: 'Business', price: '11 995', monthly: 11995, features: ['Allt i Pro +', 'Obegränsade användare', 'Egen AI-röst', 'Dedikerad support', 'Egen domän'] },
]

interface StepPaymentProps {
  selectedPlan?: string
  onComplete: () => void
  onBack: () => void
}

function PaymentForm({ selectedPlan: initialPlan, onComplete, onBack }: StepPaymentProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [selectedPlan, setSelectedPlan] = useState(initialPlan || 'professional')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [planName, setPlanName] = useState('')
  const [planPrice, setPlanPrice] = useState(0)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cardReady, setCardReady] = useState(false)

  // Hämta setup intent när plan väljs
  useEffect(() => {
    setLoading(true)
    setError(null)
    setClientSecret(null)

    fetch('/api/billing/setup-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: selectedPlan }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.clientSecret) {
          setClientSecret(data.clientSecret)
          setPlanName(data.planName)
          setPlanPrice(data.planPrice)
        } else {
          setError(data.error || 'Kunde inte initiera betalning')
        }
      })
      .catch(() => setError('Nätverksfel — försök igen'))
      .finally(() => setLoading(false))
  }, [selectedPlan])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements || !clientSecret) return
    setProcessing(true)
    setError(null)

    const cardElement = elements.getElement(CardElement)
    if (!cardElement) { setProcessing(false); return }

    const { setupIntent, error: stripeError } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card: cardElement },
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
        body: JSON.stringify({ setupIntentId: setupIntent.id, planId: selectedPlan }),
      })

      if (res.ok) {
        onComplete()
      } else {
        const data = await res.json()
        setError(data.error || 'Kunde inte bekräfta betalning')
        setProcessing(false)
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Planväljare */}
      <div className="grid gap-3">
        {PLANS.map(plan => (
          <button
            key={plan.id}
            type="button"
            onClick={() => setSelectedPlan(plan.id)}
            className={`relative text-left p-4 rounded-2xl border-2 transition-all ${
              selectedPlan === plan.id
                ? 'border-teal-600 bg-teal-50/50 shadow-sm'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            {plan.popular && (
              <span className="absolute -top-2.5 right-4 bg-teal-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                Populärast
              </span>
            )}
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-base font-bold text-gray-900">{plan.name}</h3>
              <div className="text-right">
                <span className="text-xl font-bold text-gray-900">{plan.price}</span>
                <span className="text-sm text-gray-400"> kr/mån</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {plan.features.map(f => (
                <span key={f} className="text-xs text-gray-500 flex items-center gap-1">
                  <Check className="w-3 h-3 text-teal-600" />{f}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>

      {/* Garanti */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
        <p className="text-sm font-semibold text-emerald-700">
          💚 30 dagars pengarna-tillbaka-garanti
        </p>
        <p className="text-xs text-emerald-600 mt-0.5">
          Sparar du inte tid inom 30 dagar — få pengarna tillbaka, inga frågor
        </p>
      </div>

      {/* Kortfält */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-gray-400" />
          Kortuppgifter
        </label>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 text-teal-600 animate-spin" />
          </div>
        ) : (
          <>
            <div className="px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl">
              <CardElement
                onChange={(e) => setCardReady(e.complete)}
                options={{
                  style: {
                    base: {
                      fontSize: '16px',
                      color: '#111827',
                      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                      '::placeholder': { color: '#9CA3AF' },
                    },
                    invalid: { color: '#EF4444' },
                  },
                  hidePostalCode: true,
                }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
              <Shield className="w-3 h-3" />
              Säkrad med 256-bit SSL. Debiteras efter 30-dagarsperioden.
            </p>
          </>
        )}
      </div>

      {/* Fel */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Knappar */}
      <div className="flex gap-3">
        <button type="button" onClick={onBack}
          className="px-4 py-3 border border-gray-200 rounded-xl text-gray-600 text-sm">
          Tillbaka
        </button>
        <button
          type="submit"
          disabled={!stripe || processing || !clientSecret || !cardReady}
          className="flex-1 py-3 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {processing
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Behandlar...</>
            : <>Aktivera Handymate <ChevronRight className="w-4 h-4" /></>
          }
        </button>
      </div>

      <p className="text-center text-xs text-gray-400">
        Du debiteras {planPrice > 0 ? planPrice.toLocaleString('sv-SE') : PLANS.find(p => p.id === selectedPlan)?.price || '—'} kr/mån efter 30-dagarsperioden.
        Avbryt när som helst.
      </p>
    </form>
  )
}

export default function StepPayment(props: StepPaymentProps) {
  return (
    <Elements stripe={stripePromise}>
      <PaymentForm {...props} />
    </Elements>
  )
}
