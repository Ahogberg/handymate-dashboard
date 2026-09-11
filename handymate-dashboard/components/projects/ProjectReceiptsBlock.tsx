'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { APPROVAL_QUEUE_CHANGED } from '@/lib/approvals/review-client'
import { createProjectApprovalReadGuard, loadProjectApprovalPage } from '@/lib/projects/load-project-approvals'
import { areValidProjectReceiptRows, projectReceiptPresentation, resolveProjectReceiptRead, type ProjectReceiptPresentation } from '@/lib/projects/project-receipt-presentation'

type ApprovalRow = Parameters<typeof projectReceiptPresentation>[0]

function ProjectReceiptsScope({ projectId, businessId }: { projectId: string; businessId: string }) {
  const business = useBusiness()
  const [receipts, setReceipts] = useState<ProjectReceiptPresentation[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [readingMore, setReadingMore] = useState(false)
  const guard = useRef(createProjectApprovalReadGuard())
  const rowsRef = useRef<ApprovalRow[]>([])

  const read = useCallback(async (offset = 0) => {
    if (!business?.business_id) return
    const sequence = guard.current.begin()
    const controller = new AbortController()
    if (offset === 0) {
      rowsRef.current = []
      setReceipts([])
      setNextOffset(null)
      setState('loading')
    } else setReadingMore(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const result = await resolveProjectReceiptRead({ sequence, isCurrent: value => guard.current.isCurrent(value), load: () => loadProjectApprovalPage<ApprovalRow>(projectId, session?.access_token, offset, controller.signal, fetch, 'resolved') })
      if (result.stale) return
      const page = result.value
      if (!areValidProjectReceiptRows(page.approvals)) throw new Error('receipt-read-malformed')
      const combined = offset === 0 ? page.approvals : [...rowsRef.current, ...page.approvals]
      rowsRef.current = Array.from(new Map(combined.map(row => [row.id, row])).values())
      setReceipts(rowsRef.current.map(projectReceiptPresentation).filter((item): item is ProjectReceiptPresentation => item !== null))
      setNextOffset(page.nextOffset)
      setState('ready')
    } catch (error) {
      if (!guard.current.isCurrent(sequence) || (error instanceof DOMException && error.name === 'AbortError')) return
      setState('error')
    } finally {
      if (guard.current.isCurrent(sequence)) setReadingMore(false)
    }
  }, [business?.business_id, businessId, projectId])

  useEffect(() => {
    guard.current.invalidate()
    rowsRef.current = []
    setReceipts([])
    setNextOffset(null)
    setState('loading')
    if (business?.business_id) void read(0)
    return () => guard.current.invalidate()
  }, [business?.business_id, businessId, projectId, read])

  useEffect(() => {
    const refresh = () => { void read(0) }
    window.addEventListener(APPROVAL_QUEUE_CHANGED, refresh)
    return () => window.removeEventListener(APPROVAL_QUEUE_CHANGED, refresh)
  }, [read])

  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-4" aria-labelledby="project-receipts-heading">
      <h3 id="project-receipts-heading" className="text-sm font-semibold text-gray-900">Projektets kvitton</h3>
      {state === 'loading' && <div role="status" className="mt-3 flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Hämtar kvitton…</div>}
      {state === 'error' && <div role="alert" className="mt-3 text-sm text-amber-800"><p>Kunde inte läsa projektets kvitton.</p><button type="button" className="mt-2 min-h-11 font-semibold text-primary-700" onClick={() => void read(0)}>Försök igen</button></div>}
      {state === 'ready' && receipts.length === 0 && nextOffset === null && <p className="mt-2 text-sm text-gray-500">Inga sparade utförandekvitton hittades för projektet.</p>}
      {receipts.length > 0 && <ul className="mt-3 divide-y divide-gray-100">{receipts.map(receipt => <li key={receipt.id} className="py-3 first:pt-0 last:pb-0"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className={`text-xs font-semibold ${receipt.complete ? 'text-emerald-700' : 'text-amber-700'}`}>{receipt.statusLabel}</span>{receipt.recordedAt && <time className="text-xs text-gray-400" dateTime={receipt.recordedAt}>{receipt.recordedAtLabel} {new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(receipt.recordedAt))}</time>}</div><p className="mt-1 whitespace-pre-line text-sm text-gray-700">{receipt.text}</p></li>)}</ul>}
      {state === 'ready' && receipts.length === 0 && nextOffset !== null && <p className="mt-2 text-sm text-gray-500">Den lästa sidan saknar sparade kvitton. Det finns fler beslut att läsa.</p>}
      {state === 'ready' && nextOffset !== null && <button type="button" disabled={readingMore} onClick={() => void read(nextOffset)} className="mt-3 min-h-11 text-sm font-semibold text-primary-700 disabled:opacity-50">{readingMore ? 'Hämtar…' : 'Visa fler'}</button>}
    </section>
  )
}

export default function ProjectReceiptsBlock({ projectId }: { projectId: string }) {
  const business = useBusiness()
  if (!business?.business_id) return null
  return <ProjectReceiptsScope key={`${business.business_id}:${projectId}`} projectId={projectId} businessId={business.business_id} />
}
