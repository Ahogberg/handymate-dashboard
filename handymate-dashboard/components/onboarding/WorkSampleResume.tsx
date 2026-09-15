'use client'

import { useEffect, useState } from 'react'
import { readWorkSample, type WorkSample } from '@/lib/onboarding/work-sample'

export function WorkSampleResume({ businessId, hasContent, onApply, onSource }: {
  businessId: string; hasContent: boolean; onApply: (sample: WorkSample) => void; onSource: (text: string) => void
}) {
  const [sample, setSample] = useState<WorkSample | null>(null)
  const [source, setSource] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [existingQuote, setExistingQuote] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    let active = true
    setSample(null); setSource(''); setDone(false); setError(false); setConfirm(false); setExistingQuote(null)
    fetch('/api/onboarding', { cache: 'no-store' }).then(async r => {
      if (!r.ok) throw new Error('read')
      const json = await r.json()
      if (json.business_id !== businessId) throw new Error('business')
      if (!active) return
      const savedSample = readWorkSample(json.onboarding_data?.workSample)
      if (savedSample?.workId) {
        const response = await fetch('/api/onboarding/first-work', { cache: 'no-store' })
        if (!response.ok) throw new Error('continuity')
        const { receipt } = await response.json()
        if (!receipt || receipt.business_id !== businessId || receipt.id !== savedSample.workId) throw new Error('continuity')
        if (!active) return
        if (receipt.quote_id) { setExistingQuote(receipt.quote_id); return }
      }
      setSample(savedSample)
      const text = json.onboarding_data?.workSampleSource
      if (typeof text === 'string' && text.length <= 4000) setSource(text)
    }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [businessId, attempt])
  if (existingQuote) return <section className="mb-4 rounded-xl bg-teal-50 p-4"><h2 className="font-semibold">Jobbet har redan en sparad offert</h2><a className="inline-flex min-h-[44px] items-center underline" href={`/dashboard/quotes/${encodeURIComponent(existingQuote)}`}>Fortsätt med samma jobb</a></section>
  if (done) return <p role="status" className="mb-4 rounded-xl bg-teal-50 p-4 text-sm text-teal-900">Ditt arbetsprov är infogat. Granska mängder, priser och avdrag innan du skickar.</p>
  if (error) return <p className="mb-3 text-sm" role="alert">Kunde inte kontrollera ditt sparade arbetsprov. <button type="button" className="underline min-h-[44px]" onClick={() => setAttempt(n => n + 1)}>Försök igen</button></p>
  if (!sample && !source) return null
  return <section className="mb-4 rounded-xl border border-teal-200 bg-teal-50 p-4" aria-label="Ditt sparade arbetsprov">
    <h2 className="font-semibold">Fortsätt med jobbet du visade oss</h2>
    <p className="text-sm mt-2">{sample?.title || source.slice(0, 140)}</p>
    <details className="text-sm mt-2"><summary>Visa din ursprungliga förfrågan</summary><p className="whitespace-pre-wrap mt-2">{sample?.source || source}</p></details>
    {confirm && <p role="alert" className="text-sm mt-3">Arbetsprovet ersätter offertens nuvarande rubrik, beskrivning och rader. Kundvalet behålls.</p>}
    <button type="button" className="min-h-[44px] mt-2 text-sm font-semibold text-teal-900 underline" onClick={() => {
      if (sample && hasContent && !confirm) { setConfirm(true); return }
      if (sample) onApply(sample); else onSource(source)
      setDone(true)
    }}>{confirm ? 'Ersätt med arbetsprovet' : sample ? 'Använd mitt förberedda underlag' : 'Lägg förfrågan i offertbyggaren'}</button>
    {confirm && <button type="button" className="ml-4 min-h-[44px] text-sm underline" onClick={() => setConfirm(false)}>Avbryt</button>}
  </section>
}
