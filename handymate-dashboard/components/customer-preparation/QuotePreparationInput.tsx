'use client'
import { useEffect, useState } from 'react'
import type { Preparation } from '@/lib/customer-preparation/contract'
import { preparationQuoteInput } from '@/lib/customer-preparation/quote-handoff'

export default function QuotePreparationInput({ customerId, preparationId, onApply }: {
  customerId: string; preparationId?: string | null; onApply: (text: string) => void
}) {
  const [rows, setRows] = useState<Preparation[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [applied, setApplied] = useState<string[]>([])
  useEffect(() => {
    const controller = new AbortController()
    setRows([]); setLoading(true); setError('')
    void (async () => {
      try {
        const response = await fetch(`/api/customer-preparation?customer_id=${encodeURIComponent(customerId)}`, { cache: 'no-store', signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(response.status === 403 ? 'Kundunderlag kräver ägar- eller administratörsbehörighet.' : 'Kunde inte läsa kundunderlaget.')
        if (!Array.isArray(data.preparations)) throw new Error('Kunde inte läsa kundunderlaget.')
        if (!controller.signal.aborted) setRows(data.preparations.filter((row: Preparation) => row.status === 'reviewed' && (!preparationId || row.id === preparationId)))
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Kunde inte läsa kundunderlaget.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    })()
    return () => controller.abort()
  }, [customerId, preparationId, attempt])
  return <details className="mb-3 rounded-xl border border-teal-200 bg-white p-3" open={!!preparationId}>
    <summary className="cursor-pointer py-2 text-sm font-medium text-teal-800">Använd granskat kundunderlag</summary>
    {loading ? <p role="status" className="text-sm">Läser underlag…</p> : error ? <p role="alert" className="text-sm text-red-700">{error}</p> : rows.length === 0 ? <p className="text-sm text-slate-600">Inget granskat underlag hittades. Öppna kundkortet för att granska svaret.</p> : rows.map(row => <div key={row.id} className="space-y-2 border-t py-3">
      <p className="whitespace-pre-wrap text-sm">{row.context}</p>
      <button type="button" disabled={applied.includes(row.id)} onClick={() => { onApply(preparationQuoteInput(row)); setApplied(previous => [...previous, row.id]) }} className="min-h-[44px] rounded-lg bg-teal-700 px-3 text-sm text-white disabled:opacity-50">{applied.includes(row.id) ? 'Tillagt i offertunderlaget' : 'Lägg till svaren i offertunderlaget'}</button>
      <p className="text-xs text-slate-500">Svaren läggs till i din text. Befintliga offertrader och reservationer behålls. Eventuella bilder granskas på kundkortet.</p>
    </div>)}
    <div className="flex flex-wrap gap-4 text-sm text-teal-800"><a className="min-h-[44px] py-3 underline" href={`/dashboard/customers/${encodeURIComponent(customerId)}`} target="_blank" rel="noopener noreferrer">Öppna kundunderlaget</a><button type="button" disabled={loading} className="min-h-[44px] underline" onClick={() => setAttempt(value => value + 1)}>Läs in igen</button></div>
  </details>
}
