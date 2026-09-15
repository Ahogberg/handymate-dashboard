'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useBusiness } from '@/lib/BusinessContext'
import type { WeeklyValue } from '@/lib/weekly-value'
import { TIME_ESTIMATE_ANCHOR, TIME_ESTIMATE_EXPLANATION } from '@/lib/value/time-estimate-copy'

const number = (n: number) => n.toLocaleString('sv-SE', { maximumFractionDigits: 1 })

/** One shared receipt for the home and agent views. Money sources remain server-owned. */
export function WeeklyValueReceipt({ data }: { data: WeeklyValue }) {
  const hasWork = data.confirmed_kr > 0 || data.captured_count > 0 || data.autonomous_count > 0 || data.time_minutes > 0 || (data.measured_minutes ?? 0) > 0
  const split = typeof data.paid_kr === 'number' && typeof data.accepted_quote_kr === 'number'
  const hasMoney = split ? data.paid_kr! + data.accepted_quote_kr! > 0 : data.confirmed_kr > 0
  return <section className="mb-6 rounded-2xl border border-teal-100 bg-white p-5 shadow-sm" aria-label="Din vecka med Handymate">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-bold text-gray-900">Din vecka med Handymate</h2><span className="text-xs text-gray-500">Senaste {data.range_days} dagarna</span></div>
    {!hasWork ? <div className="mt-4"><p className="text-sm text-gray-700">Här visas vad teamets arbete har lett till. Ännu finns inget registrerat utfall under perioden.</p><Link href="/dashboard/quotes/new" className="mt-3 inline-block text-sm font-medium text-teal-800 underline">Förbered din första offert</Link><p className="mt-2 text-xs text-gray-500">Granska innehåll och pris innan du skickar något.</p></div> : <>
      {hasMoney ? <><div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {split ? <><div><p className="text-2xl font-bold text-teal-800">{number(data.paid_kr!)} kr</p><p className="text-sm font-medium">Registrerat betalt</p></div><div><p className="text-2xl font-bold text-gray-900">{number(data.accepted_quote_kr!)} kr</p><p className="text-sm font-medium">Accepterade offerter</p><p className="text-xs text-gray-500">Inte samma sak som inbetalda pengar.</p></div></> : <div><p className="text-2xl font-bold">{number(data.confirmed_kr)} kr</p><p className="text-sm">Accepterade offerter och registrerade betalningar</p></div>}
      </div>
      <p className="mt-3 text-xs text-gray-500">Utfall med direkt koppling till teamets arbete. Det visar inte hur mycket som hade uteblivit utan Handymate.</p>
      {data.confirmed_items.length > 0 && <ul className="mt-3 space-y-1 text-sm">{data.confirmed_items.slice(0, 5).map((item, i) => <li key={i}>{item.label} · {number(item.amount)} kr</li>)}</ul>}
      </> : <p className="mt-4 text-sm text-gray-700">Ännu finns inget registrerat ekonomiskt utfall under perioden. Här visas teamets övriga arbete.</p>}
      <div className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2"><div><p className="font-semibold">{data.captured_count} nya förfrågningar</p><p className="text-xs text-gray-500">Registrerade under perioden. Det bevisar inte att de annars hade gått förlorade.</p></div><div><p className="font-semibold">{number(data.estimated_minutes ?? data.time_minutes)} min uppskattad arbetsbesparing</p><p className="text-xs text-gray-500">Schablon per aktivitet, inte uppmätt arbetstid.</p>{data.autonomous_count > 0 && <p className="mt-1 text-xs">{data.autonomous_count} åtgärder registrerade som utförda självständigt.</p>}</div></div>
      {(data.measured_minutes ?? 0) > 0 && <p className="mt-3 text-sm">Uppmätt genomloppstid mellan arbetssteg: {number(data.measured_minutes!)} min. Detta är inte sparad arbetstid.</p>}
      <p id={TIME_ESTIMATE_ANCHOR} className="mt-3 scroll-mt-24 text-xs text-gray-500"><strong>Så uppskattas tiden: </strong>{TIME_ESTIMATE_EXPLANATION}</p>
    </>}
    {data.impact_available && <Link href="/dashboard/impact" className="mt-4 mr-4 inline-block text-sm font-medium text-teal-800 underline">Se värdet av teamets arbete</Link>}
    <Link href="/dashboard/pengar" className="mt-4 inline-block text-sm font-medium text-teal-800 underline">Följ identifierat → agerat → fakturerat → betalt</Link>
  </section>
}

export default function WeeklyValueDigest() {
  const business = useBusiness()
  return <WeeklyValueSession key={business.business_id} />
}

export function WeeklyValueSession() {
  const [data, setData] = useState<WeeklyValue | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'denied'>('loading')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setState('loading'); setData(null)
    fetch('/api/dashboard/weekly-value', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (response.status === 401 || response.status === 403) { if (!controller.signal.aborted) setState('denied'); return }
        if (!response.ok) throw new Error('read_failed')
        const result = await response.json()
        if (!controller.signal.aborted) { setData(result); setState('ready') }
      }).catch(() => { if (!controller.signal.aborted) setState('error') })
    return () => controller.abort()
  }, [attempt])
  if (state === 'denied') return null
  if (state === 'loading') return <p role="status" className="mb-6 text-sm text-gray-500">Hämtar veckans underlag…</p>
  if (state === 'error') return <section className="mb-6 rounded-2xl border border-amber-200 p-5"><p role="alert">Veckans underlag kunde inte hämtas.</p><button onClick={() => setAttempt(n => n + 1)} className="mt-2 text-teal-800 underline">Försök igen</button></section>
  return data ? <WeeklyValueReceipt data={data} /> : null
}
