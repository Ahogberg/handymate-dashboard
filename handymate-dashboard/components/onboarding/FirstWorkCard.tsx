'use client'
import { useEffect, useState } from 'react'
import type { FirstWorkReceipt } from '@/lib/onboarding/first-work'
import { QuoteHandoff } from '@/components/quotes/QuoteHandoff'
export function FirstWorkCard({ businessId }: { businessId: string }) {
  const [receipt, setReceipt] = useState<FirstWorkReceipt | null>(null)
  const [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setReceipt(null)
    setError(false)
    fetch('/api/onboarding/first-work', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 403 || response.status === 404) return
        if (!response.ok) throw new Error('read')
        const data = await response.json()
        if (data.receipt && data.receipt.business_id !== businessId)
          throw new Error('tenant')
        if (active) setReceipt(data.receipt)
      })
      .catch(() => {
        if (active) setError(true)
      })
    const refresh = () => setAttempt((n) => n + 1)
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      controller.abort()
      window.removeEventListener('focus', refresh)
    }
  }, [businessId, attempt])
  if (error)
    return (
      <section className="mx-auto max-w-5xl p-4" role="alert">
        Kunde inte kontrollera ditt sparade jobb.{' '}
        <button
          className="min-h-[44px] underline"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Försök igen
        </button>
      </section>
    )
  if (!receipt) return null
  return (
    <section className="mx-auto max-w-5xl p-4" aria-label="Ditt första jobb">
      <div className="rounded-2xl border border-teal-200 bg-white p-5">
        <h2 className="text-lg font-semibold">{receipt.headline}</h2>
        <p className="mt-2">{receipt.done}</p>
        <p className="mt-2 text-sm">{receipt.next}</p>
        <p className="mt-2 text-sm text-slate-600">{receipt.needs_you}</p>
        {receipt.elapsed_minutes !== null && (
          <p className="mt-3 text-sm">
            {receipt.elapsed_minutes.toLocaleString('sv-SE')} min från start
            till registrerat utskick. Förfluten tid inklusive pauser, inte
            sparad arbetstid.
          </p>
        )}
        <a
          href={receipt.href}
          className="inline-flex min-h-[44px] items-center font-semibold text-teal-800 underline"
        >
          {receipt.quote_id ? 'Öppna samma offert' : 'Fortsätt med underlaget'}
        </a>
      </div>
      {receipt.quote_id && receipt.phase === 'sent' && (
        <QuoteHandoff
          key={`${businessId}:${receipt.quote_id}`}
          businessId={businessId}
          quoteId={receipt.quote_id}
          revision={receipt.first_action_at || ''}
        />
      )}
    </section>
  )
}
