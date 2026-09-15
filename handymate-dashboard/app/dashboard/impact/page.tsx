'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import { useBusiness } from '@/lib/BusinessContext'
import { ImpactView } from '@/components/value/ImpactView'
import type { ImpactResponse } from '@/lib/value/impact'
export default function ImpactPage() {
  const business = useBusiness()
  const { user } = useCurrentUser()
  if (!user || !['owner', 'admin'].includes(user.role))
    return (
      <p className="p-6">Vyn kräver ägar- eller administratörsbehörighet.</p>
    )
  return (
    <ImpactSession
      key={`${business.business_id}:${user.id}`}
      businessId={business.business_id}
    />
  )
}
function ImpactSession({ businessId }: { businessId: string }) {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7)),
    [attempt, setAttempt] = useState(0)
  const [data, setData] = useState<ImpactResponse | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    setData(null)
    setError('')
    setLoading(true)
    fetch('/api/dashboard/impact?period=' + encodeURIComponent(period), {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok)
          throw new Error(body.error || 'Kunde inte läsa värdeunderlaget.')
        if (
          body.version !== 1 ||
          body.business_id !== businessId ||
          body.period !== period
        )
          throw new Error('Värdeunderlaget behöver kontrolleras igen.')
        if (!controller.signal.aborted) setData(body)
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    const refresh = () => setAttempt((n) => n + 1)
    window.addEventListener('focus', refresh)
    return () => {
      controller.abort()
      window.removeEventListener('focus', refresh)
    }
  }, [businessId, period, attempt])
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8">
      <Link
        href="/dashboard/pengar"
        className="text-sm text-teal-800 underline"
      >
        Till Pengar
      </Link>
      <h1 className="mt-4 text-2xl font-bold">Värdet av teamets arbete</h1>
      <p className="mt-2 text-gray-600">
        Från upptäckt arbete till verifierat resultat.
      </p>
      <label className="my-5 block text-sm">
        Månad{' '}
        <input
          aria-label="Månad"
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="ml-2 rounded-lg border p-2"
        />
      </label>
      {loading ? (
        <p role="status">Kontrollerar underlaget…</p>
      ) : error ? (
        <section role="alert">
          <p>{error}</p>
          <button
            className="min-h-[44px] text-teal-800 underline"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Försök igen
          </button>
        </section>
      ) : (
        data && <ImpactView data={data} />
      )}
    </main>
  )
}
