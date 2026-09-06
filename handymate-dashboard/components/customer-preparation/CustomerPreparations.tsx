'use client'
import { useCallback, useEffect, useState } from 'react'
import LarsPreparationReview from './LarsPreparationReview'
import { useBusiness } from '@/lib/BusinessContext'
import { TEMPLATES, STATUS_LABELS, isExpired, type Preparation, type TemplateKey } from '@/lib/customer-preparation/contract'

export default function CustomerPreparations({ customerId }: { customerId: string }) {
  const business = useBusiness()
  return <CustomerPreparationsSession key={`${business.business_id}:${customerId}`} customerId={customerId} />
}

function CustomerPreparationsSession({ customerId }: { customerId: string }) {
  const [rows, setRows] = useState<Preparation[]>([])
  const [template, setTemplate] = useState<TemplateKey>('charging')
  const [context, setContext] = useState('')
  const [due, setDue] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setRows([])
    try {
      const res = await fetch(`/api/customer-preparation?customer_id=${encodeURIComponent(customerId)}`, { cache: 'no-store', signal })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Kunde inte läsa underlagen.')
      if (!signal?.aborted) { setRows(body.preparations); setError('') }
    } catch (err) { if (!signal?.aborted) setError(err instanceof Error ? err.message : 'Kunde inte läsa underlagen.') }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [customerId])
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [load])
  async function mutate(method: string, body: unknown) {
    setBusy(true); setError(''); setNotice('')
    try {
      const res = await fetch('/api/customer-preparation', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Kunde inte spara.')
      if (method === 'POST') { setContext(''); setDue(''); setNotice('Förfrågan skapad. Kopiera länken nedan och dela den med kunden. Inget meddelande har skickats automatiskt.') }
      else setNotice('Ändringen är sparad.')
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Kunde inte spara. Läs in igen för att kontrollera resultatet.') }
    finally { setBusy(false) }
  }
  return <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
    <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} className="flex min-h-[44px] w-full items-center justify-between text-left font-semibold text-teal-800">Kundunderlag och förberedelser<span>{rows.filter(row => row.status === 'submitted').length > 0 ? `${rows.filter(row => row.status === 'submitted').length} att granska` : expanded ? 'Stäng' : 'Öppna'}</span></button>
    {expanded && <div className="mt-3 space-y-4">
      <p className="text-sm text-slate-600">Be kunden om underlag före offert eller svar inför jobbstart. Svaren granskas här innan du tar nästa steg.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-teal-50 p-3 text-sm text-teal-900">{notice}</p>}
      <button type="button" disabled={busy} className="min-h-[44px] text-sm text-teal-700 underline" onClick={() => void load()}>Läs in igen</button>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); void mutate('POST', { customer_id: customerId, template, context, due_date: due || null }) }}>
        <label className="block text-sm font-medium">Vad behöver kunden svara på?<select value={template} onChange={event => setTemplate(event.target.value as TemplateKey)} className="mt-1 block min-h-[44px] w-full rounded-lg border p-2">{Object.entries(TEMPLATES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
        <label className="block text-sm font-medium">Beskriv arbetet och arbetsplatsen för kunden<textarea required maxLength={600} value={context} onChange={event => setContext(event.target.value)} rows={3} className="mt-1 block w-full rounded-lg border p-3" placeholder="Exempel: Laddbox vid garaget på Storgatan 12. Vi behöver underlaget inför vårt besök." /></label>
        <label className="block text-sm font-medium">Önskat svarsdatum (valfritt)<input type="date" value={due} onChange={event => setDue(event.target.value)} className="mt-1 block min-h-[44px] rounded-lg border p-2" /></label>
        <details className="text-sm text-slate-600"><summary className="cursor-pointer py-2">Förhandsvisa frågorna</summary><ul className="list-disc space-y-1 pl-5">{TEMPLATES[template].questions.map(question => <li key={question.id}>{question.label}</li>)}</ul></details>
        <button disabled={busy} className="min-h-[44px] rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Sparar…' : 'Skapa kundlänk'}</button>
      </form>
      {loading ? <p role="status">Läser in…</p> : rows.length === 0 && !error ? <p className="text-sm text-slate-500">Inga förfrågningar ännu.</p> : rows.map(row => <article key={row.id} className="rounded-lg border border-slate-200 p-3">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium">{TEMPLATES[row.template].label}</h3><span className="text-sm text-teal-800">{row.status === 'open' && isExpired(row.expires_at) ? 'Länken har gått ut' : STATUS_LABELS[row.status]}</span></div>
        <p className="my-2 whitespace-pre-wrap text-sm">{row.context}</p>
        {row.due_date && <p className="text-xs text-slate-500">Önskat svar: {row.due_date}</p>}
        {row.status === 'open' && !isExpired(row.expires_at) && row.token && <div className="my-3"><label className="block text-xs text-slate-500">Länk till kunden (giltig till {row.expires_at.slice(0,10)})<input readOnly value={`${window.location.origin}/preparation/${row.token}`} onFocus={event => event.target.select()} className="mt-1 w-full rounded border p-2 text-sm" /></label><button type="button" className="min-h-[44px] text-sm text-teal-700 underline" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/preparation/${row.token}`); setNotice('Länken är kopierad. Dela den med kunden.') } catch { setNotice('Markera länken ovan och kopiera den manuellt.') } }}>Kopiera länk</button></div>}
        {['submitted', 'reviewed'].includes(row.status) && <div className="space-y-3">
          <p className="text-xs text-slate-500">Kundens svar · {row.submitted_at ? new Date(row.submitted_at).toLocaleString('sv-SE') : ''}</p>
          {TEMPLATES[row.template].questions.map(question => <div key={question.id}><p className="text-sm font-medium">{question.label}</p><p className="whitespace-pre-wrap text-sm">{row.answers[question.id] || 'Inget svar'}</p></div>)}
          {(row.image_urls || []).map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="inline-block p-1"><img src={url} alt={`Kundens bild ${index + 1}`} className="h-24 w-24 rounded-lg object-cover" /></a>)}
          <LarsPreparationReview row={row} customerId={customerId} onChanged={load} />
          {row.status === 'reviewed' && <a href={`/dashboard/quotes/new?customer_id=${encodeURIComponent(customerId)}&preparation_id=${encodeURIComponent(row.id)}`} className="inline-block min-h-[44px] rounded-lg bg-teal-700 px-3 py-3 text-sm text-white">Använd i ny offert</a>}
          {row.status === 'submitted' && !row.lars_review && <button type="button" disabled={busy} onClick={() => void mutate('PATCH', { id: row.id, status: 'reviewed' })} className="min-h-[44px] rounded-lg bg-teal-700 px-3 text-sm text-white disabled:opacity-50">Markera som granskat</button>}
          <p className="text-xs text-slate-500">Granskning ändrar inte offert, bokning eller projektstatus. Bildlänkar varar fem minuter — läs in igen vid behov.</p>
        </div>}
        {row.status !== 'cancelled' && <button type="button" disabled={busy} onClick={() => void mutate('PATCH', { id: row.id, status: 'cancelled' })} className="mt-2 min-h-[44px] text-sm text-slate-500 underline">Återkalla kundlänk</button>}
      </article>)}
      {rows.length === 50 && <p className="text-xs text-slate-500">De 50 senaste förfrågningarna visas.</p>}
    </div>}
  </section>
}
