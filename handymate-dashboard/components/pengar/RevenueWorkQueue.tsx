'use client'

import { useEffect, useState } from 'react'
import { useBusiness } from '@/lib/BusinessContext'
import { QUEUE_GROUPS, QUEUE_HINTS, queueGroup, selectQueue, type QueueGroup } from '@/lib/value/revenue-work-queue'
import type { RevenueRecoveryCase } from '@/lib/value/revenue-recovery-case'

const money = (value: number) => new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(value)
function createdDate(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'medium' }).format(date) : 'Datum saknas'
}
export default function RevenueWorkQueue() {
  const business = useBusiness()
  return <RevenueWorkQueueSession key={business.business_id} />
}

export function RevenueWorkQueueSession() {
  const [cases, setCases] = useState<RevenueRecoveryCase[] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [group, setGroup] = useState<QueueGroup>('action')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(20)
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') setAttempt(value => value + 1) }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    // Clear the old snapshot on refresh, including revoked access and failed reads.
    setCases(null); setLoading(true); setError('')
    void (async () => {
      try {
        const response = await fetch('/api/revenue-recovery-cases?view=queue', { cache: 'no-store', signal: controller.signal })
        if (response.status === 403) throw new Error('Intäktskön är tillgänglig för ägare och administratörer.')
        if (response.status === 401) throw new Error('Logga in igen för att läsa intäktskön.')
        if (!response.ok) throw new Error('Intäktskön kunde inte läsas. Försök igen.')
        const body = await response.json()
        if (!Array.isArray(body.cases) || body.cases.some((row: RevenueRecoveryCase) => !row || typeof row.case_id !== 'string' || !Object.prototype.hasOwnProperty.call(QUEUE_HINTS, row.phase) || typeof row.created_at !== 'string')) throw new Error('Intäktskön kunde inte kontrolleras. Försök igen.')
        if (!controller.signal.aborted) setCases(body.cases)
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Intäktskön kunde inte läsas. Försök igen.')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    })()
    return () => controller.abort()
  }, [attempt])
  const filtered = cases ? selectQueue(cases, group, search) : []
  return <section aria-labelledby="revenue-queue-title" className="overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-sm">
    <div className="border-b border-teal-100 bg-gradient-to-r from-teal-50 via-white to-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Money Brain</p>
          <h2 id="revenue-queue-title" className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Ta intäkterna vidare</h2>
        </div>
        <button type="button" disabled={loading} onClick={() => setAttempt(value => value + 1)} className="min-h-[44px] rounded-xl border border-teal-200 bg-white px-3 text-sm font-medium text-teal-800 shadow-sm transition-colors hover:border-teal-400 disabled:opacity-50">Uppdatera</button>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">Se vad som blockerar pengar, vem som väntar och vilket verifierat nästa steg som för ärendet framåt.</p>
    </div>
    <div className="p-4 sm:p-5">
    {loading && <p role="status" className="mt-4 text-sm">Läser intäktsärenden…</p>}
    {error && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
    {cases && <>
      <div role="group" aria-label="Filtrera intäktsärenden" className="my-4 flex flex-wrap gap-2">
        {(Object.keys(QUEUE_GROUPS) as QueueGroup[]).map(key => <button type="button" key={key} aria-pressed={group === key} onClick={() => { setGroup(key); setLimit(20) }} className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm ${group === key ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 text-slate-700'}`}>{QUEUE_GROUPS[key]} ({cases.filter(row => queueGroup(row.phase) === key).length})</button>)}
      </div>
      <label className="block text-sm font-medium text-slate-700">Sök projekt eller fakturanummer<input type="search" value={search} onChange={event => { setSearch(event.target.value); setLimit(20) }} className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 font-normal" /></label>
      <p role="status" className="my-3 text-xs text-slate-500">{filtered.length} ärenden i urvalet. Fakturaunderlag först, därefter äldsta registrerade ärende inom samma steg.</p>
      {!filtered.length && <p className="rounded-lg bg-slate-50 p-3 text-sm">{cases.length ? 'Inga ärenden matchar det här urvalet.' : 'Inga intäktsärenden finns i det lästa underlaget.'}</p>}
      <div className="space-y-3">{filtered.slice(0, limit).map(row => <article key={row.case_id} className={`min-w-0 rounded-xl border p-4 transition-colors ${queueGroup(row.phase) === 'control' ? 'border-amber-200 bg-amber-50/40' : queueGroup(row.phase) === 'action' ? 'border-teal-200 bg-teal-50/30' : 'border-slate-200 bg-white'}`}>
        <h3 className="break-words font-semibold text-slate-900">{row.project_name || 'Projekt behöver kontrolleras'}</h3>
        {row.title && <p className="mt-1 break-words text-sm text-slate-700">{row.title}</p>}
        <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${queueGroup(row.phase) === 'control' ? 'bg-amber-100 text-amber-900' : queueGroup(row.phase) === 'action' ? 'bg-teal-100 text-teal-900' : 'bg-slate-100 text-slate-700'}`}>{row.phase_label}</p>
        <p className="mt-2 text-sm text-slate-600">{QUEUE_HINTS[row.phase]}</p>
        {row.truth_note && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{row.truth_note}</p>}
        <details className="mt-2 text-sm"><summary className="min-h-[44px] cursor-pointer py-3 text-slate-700">Visa underlag och belopp</summary>
          <dl className="space-y-2 text-slate-600">
            <div><dt>Ärendet registrerat</dt><dd>{createdDate(row.created_at)}</dd></div>
            <div><dt>Identifierat underlag</dt><dd>{row.identified_kr != null && Number.isFinite(row.identified_kr) ? money(row.identified_kr) : 'Belopp saknas'}</dd></div>
            {row.invoice_id && <div><dt>Hela fakturans belopp {row.invoice_number ? `(${row.invoice_number})` : ''}</dt><dd>{row.invoice_total_kr != null && Number.isFinite(row.invoice_total_kr) ? money(row.invoice_total_kr) : 'Belopp saknas'}</dd></div>}
          </dl>
          <p className="mt-2 text-xs text-slate-500">Identifierat underlag är inte bekräftad intäkt. En faktura kan omfatta flera ärenden och annat arbete. Registreringsdatumet anger inte hur länge ärendet varit i nuvarande steg.</p>
        </details>
        {row.next_action && <a href={row.next_action.href} className="mt-1 inline-flex min-h-[44px] items-center rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800">{row.next_action.label} →</a>}
        {!row.next_action && row.invoice_id && <a href={`/dashboard/invoices/${encodeURIComponent(row.invoice_id)}`} className="inline-block min-h-[44px] py-3 text-sm text-teal-800 underline">Visa fakturan</a>}
      </article>)}</div>
      {filtered.length > limit && <button type="button" onClick={() => setLimit(value => value + 20)} className="mt-3 min-h-[44px] text-sm text-teal-800 underline">Visa fler ärenden ({filtered.length - limit} kvar)</button>}
      <p className="mt-4 text-xs text-slate-500">Nästa steg öppnas där du granskar och bekräftar handlingen. Kön visar dessa intäktsärenden, inte företagets samtliga fordringar.</p>
    </>}
    </div>
  </section>
}
