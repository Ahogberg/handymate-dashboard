'use client'

import { useEffect, useRef, useState } from 'react'
import FinancialKernelShadowSection from './FinancialKernelShadowSection'
import type { UnresolvedEffectIntent, EffectResolution } from '@/lib/financial-kernel/commands/service'

const effectNames: Record<string, string> = {
  pipeline: 'Uppdatera affär', project_check: 'Kontrollera jobb', project_stage: 'Uppdatera jobbstatus',
  smart_communication: 'Kunduppföljning', payment_received_rules: 'Betalningsuppföljning', portal_message: 'Meddelande i kundportalen',
  review_request: 'Förbered omdömesförfrågan', invoice_paid_thanks: 'Tackmeddelande', review_request_schedule: 'Schemalägg omdömesförfrågan',
}
const labels = { delivered: 'Levererat', abandon: 'Avbryt', retry: 'Försök igen' }
type Consumer = { consumer: string; halted_at: string | null; backlog: string }

export default function FinancialKernelSection({ businesses }: { businesses: { business_id: string; business_name: string }[] }) {
  const [businessId, setBusinessId] = useState('')
  const [intents, setIntents] = useState<UnresolvedEffectIntent[]>([])
  const [consumers, setConsumers] = useState<Consumer[]>([])
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [receipt, setReceipt] = useState('')
  const [decision, setDecision] = useState<{ id: string; resolution: EffectResolution | 'resume' } | null>(null)
  const [reason, setReason] = useState('')
  const [shadowBusy, setShadowBusy] = useState(false)
  const generation = useRef(0)
  async function refresh(id: string) {
    const current = ++generation.current
    setLoading(true); setError(''); setIntents([]); setConsumers([])
    if (!id) { setLoading(false); return }
    try {
      const query = '?business_id=' + encodeURIComponent(id)
      const results = await Promise.all(['intents', 'consumers'].map(async part => {
        const response = await fetch('/api/admin/financial-kernel/' + part + query, { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Kunde inte hämta uppföljningen')
        return data
      }))
      if (generation.current === current) { setIntents(results[0].intents); setConsumers(results[1].consumers) }
    } catch (error) { if (generation.current === current) setError(error instanceof Error ? error.message : String(error)) }
    finally { if (generation.current === current) setLoading(false) }
  }
  useEffect(() => { setDecision(null); setReason(''); setReceipt(''); void refresh(businessId); return () => { generation.current++ } }, [businessId])
  async function submit() {
    if (!decision || !reason.trim() || busy) return
    setBusy(true); setError(''); setReceipt('')
    try {
      const resume = decision.resolution === 'resume'
      const response = await fetch('/api/admin/financial-kernel/' + (resume ? 'consumers/resume' : 'intents/' + encodeURIComponent(decision.id) + '/resolve'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, reason: reason.trim(), ...(resume ? { consumer: decision.id } : { resolution: decision.resolution }) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Beslutet kunde inte bekräftas')
      setReceipt(resume ? 'Uppföljningen har återupptagits.' : decision.resolution === 'retry' ? 'Nytt försök är registrerat och väntar på nästa körning.' : 'Beslutet har sparats.')
      setDecision(null); setReason(''); await refresh(businessId)
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return <section className="mt-8 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
    <h2 className="text-lg font-semibold text-gray-900">Ekonomikärnan — utskick som kräver beslut</h2>
    <p className="mt-2 text-sm text-gray-600">Kontrollera leveransen innan du väljer ett nytt försök. Ett tidigare utskick kan redan ha nått kunden.</p>
    <label className="mt-4 block text-sm font-medium">Företag
      <select value={businessId} disabled={busy || shadowBusy} onChange={event => setBusinessId(event.target.value)} className="mt-1 w-full rounded-lg border p-2">
        <option value="">Välj företag</option>
        {businesses.map(business => <option key={business.business_id} value={business.business_id}>{business.business_name}</option>)}
      </select>
    </label>
    {businessId && <button disabled={busy || loading} onClick={() => { setDecision(null); void refresh(businessId) }} className="mt-3 text-sm text-teal-700">Uppdatera listan</button>}
    {loading && <p role="status" className="mt-4 text-sm">Hämtar uppföljning…</p>}
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    {receipt && <p role="status" className="mt-4 text-sm text-teal-800">{receipt}</p>}
    {!loading && !error && businessId && intents.length === 0 && !consumers.some(c => c.halted_at) && <p className="mt-4 text-sm text-gray-600">Inga utskick eller pausade uppföljningar kräver beslut.</p>}
    {!loading && intents.map(intent => <article key={intent.id} className="mt-4 rounded-lg border p-4">
      <h3 className="font-medium">{effectNames[intent.effect] || intent.effect}</h3>
      <p className="text-sm text-gray-600">Faktura: {intent.invoice_id} · {intent.status === 'unknown' ? 'Leveransen behöver kontrolleras' : 'Alla försök har misslyckats'} · {intent.attempts} försök</p>
      {intent.last_error && <p className="mt-2 break-words text-sm text-gray-600">{intent.last_error}</p>}
      <div className="mt-3 flex flex-wrap gap-3">{(Object.keys(labels) as EffectResolution[]).map(resolution => <button key={resolution} disabled={busy} onClick={() => { setDecision({ id: intent.id, resolution }); setReason('') }} className="rounded-lg border px-3 py-2 text-sm text-teal-800">{labels[resolution]}</button>)}</div>
    </article>)}
    {!loading && consumers.filter(c => c.halted_at).map(consumer => <article key={consumer.consumer} className="mt-4 rounded-lg border p-4">
      <h3 className="font-medium">{consumer.consumer === 'value-ledger' ? 'Värdeunderlaget är pausat' : 'Betalningsuppföljningen är pausad'}</h3><p className="text-sm">{consumer.backlog} händelser väntar.</p>
      <button disabled={busy} onClick={() => { setDecision({ id: consumer.consumer, resolution: 'resume' }); setReason('') }} className="mt-3 rounded-lg border px-3 py-2 text-sm text-teal-800">Återuppta</button>
    </article>)}
    {decision && <form onSubmit={event => { event.preventDefault(); void submit() }} className="mt-4 rounded-lg bg-gray-50 p-4">
      <p className="font-medium">{decision.resolution === 'resume' ? 'Återuppta uppföljningen' : labels[decision.resolution]}</p>
      <label className="mt-2 block text-sm">Skäl till beslutet<textarea required maxLength={500} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 block w-full rounded-lg border p-2" /></label>
      <div className="mt-3 flex gap-3"><button type="submit" disabled={busy || !reason.trim()} className="rounded-lg bg-teal-700 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? 'Sparar…' : 'Spara beslut'}</button><button type="button" disabled={busy} onClick={() => setDecision(null)} className="text-sm">Stäng</button></div>
    </form>}
    {businessId && <FinancialKernelShadowSection key={businessId} businessId={businessId} onBusyChange={setShadowBusy} />}
  </section>
}
