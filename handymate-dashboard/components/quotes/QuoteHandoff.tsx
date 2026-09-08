'use client'

import { useEffect, useState } from 'react'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import type { HandoffSummary } from '@/lib/quotes/handoff'

const date = (value: string) => new Date(value).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'short', timeStyle: 'short' })

export function QuoteHandoff({ quoteId, revision }: { quoteId: string; revision: string }) {
  const [data, setData] = useState<{ checkedAt: string; summary: HandoffSummary } | null>(null)
  const [error, setError] = useState('')
  const [hidden, setHidden] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    setData(null); setError(''); setHidden(false)
    fetch(`/api/quotes/${encodeURIComponent(quoteId)}/handoff`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (response.status === 403) { if (active) setHidden(true); return }
        const json = await response.json()
        if (!response.ok) throw new Error(json.error || 'Kunde inte kontrollera överlämningen.')
        if (active) setData(json)
      }).catch(() => { if (active) setError('Kunde inte kontrollera överlämningen. Räkna inte med bekräftad bevakning innan kontrollen lyckas.') })
      .finally(() => clearTimeout(timeout))
    const refresh = () => setAttempt(n => n + 1)
    window.addEventListener('focus', refresh)
    return () => { active = false; controller.abort(); clearTimeout(timeout); window.removeEventListener('focus', refresh) }
  }, [quoteId, revision, attempt])
  if (hidden) return null
  const summary = data?.summary
  return <section className="my-4 rounded-2xl border border-teal-100 bg-white p-4 sm:p-5" aria-label="Överlämning till teamet">
    <div className="flex items-center gap-3"><AgentAvatar agentKey="daniel" size="sm" /><h2 className="font-semibold text-slate-900">{summary?.headline || 'Kontrollerar överlämningen'}</h2></div>
    {error ? <p role="alert" className="mt-3 text-sm text-amber-800">{error}</p> : summary ? <>
      <dl className="mt-4 grid gap-4 md:grid-cols-3 text-sm">
        <div><dt className="font-semibold text-teal-900">Det här har hänt</dt><dd className="mt-1 text-slate-600">{summary.done}</dd></div>
        <div><dt className="font-semibold text-teal-900">Nästa steg</dt><dd className="mt-1 text-slate-600">{summary.next}{summary.eligibleAt && <span className="block mt-1 font-medium">Tidigast {date(summary.eligibleAt)}</span>}</dd></div>
        <div><dt className="font-semibold text-teal-900">När du behövs</dt><dd className="mt-1 text-slate-600">{summary.needsYou}</dd></div>
      </dl>
      {summary.link && <a href={summary.link} className="inline-flex items-center min-h-[44px] mt-2 text-sm font-semibold text-teal-800 underline">{summary.linkLabel}</a>}
      <p className="mt-3 text-xs text-slate-500">Uppgifterna kontrollerade {date(data.checkedAt)}.{summary.lastRunAt ? ` Regelns senaste körning: ${date(summary.lastRunAt)}.` : summary.state === 'configured' ? ' Ingen körningstid är bekräftad här.' : ''}</p>
    </> : !error && <p role="status" className="mt-3 text-sm text-slate-500">Läser offert, inställningar och väntande beslut…</p>}
    <button type="button" className="min-h-[44px] text-sm text-teal-800 underline" onClick={() => setAttempt(n => n + 1)}>{error ? 'Försök igen' : 'Kontrollera igen'}</button>
  </section>
}
