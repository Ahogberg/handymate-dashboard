'use client'
import { useEffect, useRef, useState } from 'react'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import type { Invoice } from '../types'
export function FortnoxReconciliation({ invoice, onChecked }: { invoice: Invoice; onChecked: () => void }) {
  const { user } = useCurrentUser()
  const allowed = user?.is_active && user.business_id === invoice.business_id && ['owner', 'admin'].includes(user.role)
  if (!allowed || !['pending', 'failed'].includes(invoice.fortnox_sync_status || '') || invoice.is_credit_note) return null
  return <ReconciliationControl key={`${invoice.invoice_id}:${user.id}:${user.role}`} invoice={invoice} onChecked={onChecked} />
}
function ReconciliationControl({ invoice, onChecked }: { invoice: Invoice; onChecked: () => void }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  async function check() {
    if (busy) return
    setBusy(true); setMessage(null)
    try {
      const res = await fetch(`/api/invoices/${encodeURIComponent(invoice.invoice_id)}/reconcile-fortnox`, { method: 'POST' })
      const result = await res.json()
      if (!mounted.current) return
      setMessage(result.message || result.error || 'Kontrollen kunde inte slutföras.')
      if (res.ok && result.outcome === 'matched') onChecked()
    } catch { if (mounted.current) setMessage('Kontrollen kunde inte slutföras. Försök kontrollera igen.') }
    finally { if (mounted.current) setBusy(false) }
  }
  return <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
    <h2 className="font-semibold">Fortnox-synken behöver kontrolleras</h2>
    <p className="my-2">Kontrollen söker efter fakturan i Fortnox och sparar en verifierad koppling. Den skapar ingen ny faktura och skickar inget till kunden. Leverans och eventuell ROT/RUT-begäran behöver fortfarande kontrolleras.</p>
    {invoice.fortnox_document_number && <p className="my-2">Kopplat Fortnox-nummer: {invoice.fortnox_document_number}</p>}
    <button type="button" disabled={busy} onClick={() => void check()} className="rounded-lg bg-white px-3 py-2 font-medium ring-1 ring-amber-300 disabled:opacity-50">{busy ? 'Kontrollerar…' : 'Kontrollera i Fortnox'}</button>
    {message && <p role="status" className="mt-3">{message}</p>}
  </section>
}
