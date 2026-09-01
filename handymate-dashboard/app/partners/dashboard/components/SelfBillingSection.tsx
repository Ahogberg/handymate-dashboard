'use client'

import { useState } from 'react'
import { CheckCircle2, Download, FileWarning, Loader2, ReceiptText } from 'lucide-react'
import { formatDate, formatSek, type SelfBillingBatch } from './types'

export default function SelfBillingSection({ batches, onChanged }: { batches: SelfBillingBatch[]; onChanged: () => Promise<void> }) {
  const [disputing, setDisputing] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function review(id: string, decision: 'approved' | 'disputed') {
    setBusy(id)
    setMessage(null)
    try {
      const response = await fetch(`/api/partners/self-billing/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason: decision === 'disputed' ? reason : null }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kunde inte spara beslutet')
      setDisputing(null); setReason(''); setMessage('Ditt beslut är registrerat.'); await onChanged()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Kunde inte spara beslutet')
    } finally { setBusy(null) }
  }

  const label = (batch: SelfBillingBatch) => {
    if (batch.status === 'paid') return ['Utbetald', 'bg-green-50 text-green-700']
    if (batch.review_status === 'disputed') return ['Bestridd', 'bg-red-50 text-red-700']
    if (batch.review_status === 'approved' || batch.review_status === 'deemed_approved') return ['Godkänd', 'bg-blue-50 text-blue-700']
    return ['Väntar på granskning', 'bg-amber-50 text-amber-700']
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Självfakturor</h2>
        <p className="text-sm text-gray-500 mt-1">Handymate utfärdar underlaget i ditt namn. Granska, godkänn eller invänd här.</p>
      </div>
      {batches.length === 0 ? (
        <div className="px-5 py-10 text-center"><ReceiptText className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">Ingen självfaktura skapad ännu</p></div>
      ) : (
        <div className="divide-y divide-gray-100">
          {batches.map(batch => {
            const [status, cls] = label(batch)
            return <div key={batch.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-medium text-gray-900">{batch.invoice_number}</p><p className="text-sm text-gray-500">{batch.period} · {formatDate(batch.invoice_date)} · förfaller {formatDate(batch.due_date)}</p></div>
                <div className="text-right"><p className="font-semibold text-gray-900">{formatSek(Number(batch.total_incl_vat_sek))}</p><span className={`text-xs font-medium px-2 py-1 rounded-full ${cls}`}>{status}</span></div>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <a href={`/api/partners/self-billing/${batch.id}?format=pdf`} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"><Download className="w-4 h-4" /> Ladda ner PDF</a>
                {batch.review_status === 'pending' && <>
                  <button onClick={() => review(batch.id, 'approved')} disabled={busy === batch.id} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-800 text-white text-sm font-medium disabled:opacity-50">{busy === batch.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Godkänn</button>
                  <button onClick={() => setDisputing(disputing === batch.id ? null : batch.id)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-700 text-sm font-medium"><FileWarning className="w-4 h-4" /> Invänd</button>
                </>}
              </div>
              {disputing === batch.id && <div className="mt-3 rounded-lg bg-red-50 p-3"><textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={2000} placeholder="Beskriv vad som behöver korrigeras" className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm" /><button onClick={() => review(batch.id, 'disputed')} disabled={!reason.trim() || busy === batch.id} className="mt-2 rounded-lg bg-red-700 text-white px-3 py-2 text-sm font-medium disabled:opacity-50">Skicka invändning</button></div>}
              {batch.dispute_reason && <p className="mt-3 text-sm text-red-700 bg-red-50 rounded-lg p-3">Invändning: {batch.dispute_reason}</p>}
            </div>
          })}
        </div>
      )}
      {message && <p className="px-5 py-3 text-sm border-t border-gray-100 text-gray-700">{message}</p>}
    </section>
  )
}

