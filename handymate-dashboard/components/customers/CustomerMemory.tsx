'use client'

import { useEffect, useState } from 'react'
import { Loader2, MessageSquare, Trash2 } from 'lucide-react'
import { customerFactSourceText, loadCustomerMemory, promiseStatusText, type CustomerMemoryFact } from '@/lib/customers/customer-memory'
import { useToast } from '@/components/Toast'

const BADGE = {
  preference: ['Preferens', 'bg-primary-50 text-primary-700'],
  constraint: ['Förutsättning', 'bg-amber-50 text-amber-700'],
  commitment: ['Löfte', 'bg-primary-50 text-primary-700'],
  contact: ['Kontakt', 'bg-gray-100 text-gray-700'],
} as const

export default function CustomerMemory({ customerId }: { customerId: string }) {
  const toast = useToast()
  const [facts, setFacts] = useState<CustomerMemoryFact[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [limit, setLimit] = useState(20)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    void loadCustomerMemory(customerId, controller.signal).then(result => {
      if (controller.signal.aborted) return
      setFacts(result.facts)
      setLimit(result.limit)
      setStatus('ready')
    }).catch(error => {
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return
      setFacts([])
      setStatus('error')
    })
    return () => controller.abort()
  }, [customerId, retry])

  async function remove(id: string) {
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(customerId)}/facts?factId=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!response.ok) { toast.error('Kunde inte ta bort faktumet'); return }
      setFacts(current => current.filter(fact => fact.id !== id))
    } catch { toast.error('Kunde inte ta bort faktumet') }
  }

  if (status === 'loading') return <div role="status" className="bg-white rounded-xl border border-[#E2E8F0] p-6 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /><span className="text-sm text-gray-500">Läser kundminnet…</span></div>
  if (status === 'error') return <div role="alert" className="bg-white rounded-xl border border-amber-300 p-4"><p className="text-sm text-amber-800">Kundminnet kunde inte läsas.</p><button onClick={() => setRetry(current => current + 1)} className="mt-2 min-h-11 px-3 text-sm font-semibold text-primary-700">Försök igen</button></div>
  return <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Det här vet Handymate</h2>
    {facts.length === 0 ? <p className="text-sm text-gray-500">Inga bekräftade kundfakta finns ännu.</p> : <div className="space-y-3">{facts.map(fact => {
      const badge = BADGE[fact.fact_type] || BADGE.preference
      const promise = promiseStatusText(fact)
      return <div key={fact.id} className="p-3 bg-gray-50 rounded-xl group">
        <div className="flex items-center justify-between gap-2 mb-1.5"><div className="flex flex-wrap items-center gap-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge[1]}`}>{badge[0]}</span><span className="text-xs text-gray-400">Bekräftat {new Date(fact.confirmed_at).toLocaleDateString('sv-SE')}</span></div><button onClick={() => void remove(fact.id)} className="min-w-11 min-h-11 flex items-center justify-center text-gray-400 hover:text-red-600" aria-label="Ta bort kundfaktum" title="Ta bort"><Trash2 className="w-3.5 h-3.5" /></button></div>
        <p className="text-sm text-gray-900">{fact.content}</p>
        {promise && <p className="mt-1 text-xs font-medium text-gray-600">{promise}</p>}
        {fact.evidence_quote && <div className="mt-2 pl-3 border-l-2 border-primary-200 bg-primary-50/40 rounded-r-lg py-1.5 pr-2"><p className="flex items-center gap-1 text-[10px] font-medium text-primary-700 uppercase tracking-wide mb-0.5"><MessageSquare className="w-3 h-3" />Varför vet Handymate detta?</p><p className="text-xs text-gray-600 italic">&quot;{fact.evidence_quote}&quot;</p></div>}
        <p className="mt-2 text-xs text-gray-400">Källa: {customerFactSourceText(fact.source_type)}{fact.created_at ? ` · sparat ${new Date(fact.created_at).toLocaleDateString('sv-SE')}` : ''}</p>
      </div>
    })}<p className="text-xs text-gray-400">Visar högst {limit} aktuella, bekräftade fakta.</p></div>}
  </div>
}
