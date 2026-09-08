'use client'
import { useEffect, useState } from 'react'
import type { DaySummary } from '@/lib/relief/day-summary'
export function DaySummaryCard({ projectId, date, revision }: { projectId: string; date: string; revision: number }) {
  const [summary, setSummary] = useState<DaySummary | null>(null)
  const [error, setError] = useState(''), [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    setSummary(null); setError('')
    fetch(`/api/day-close?${new URLSearchParams({ projectId, date })}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const body = await response.json()
      if (!response.ok || !body.summary || body.summary.projectId !== projectId || body.summary.date !== date) throw new Error('Rapportens sparade uppgifter kunde inte kontrolleras. Försök igen.')
      if (active) setSummary(body.summary)
    }).catch(() => { if (active) setError('Rapportens sparade uppgifter kunde inte kontrolleras. Försök igen.') }).finally(() => clearTimeout(timeout))
    return () => { active = false; controller.abort(); clearTimeout(timeout) }
  }, [projectId, date, revision, retry])
  if (error) return <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><p>{error}</p><button type="button" onClick={() => setRetry(n => n + 1)} className="min-h-[44px] underline">Kontrollera igen</button></div>
  if (!summary) return <p role="status" className="text-sm text-slate-500">Kontrollerar vad som finns sparat…</p>
  return <section aria-label="Sparat för jobbet idag" className="rounded-xl border border-slate-200 bg-slate-50 p-4">
    <h3 className="font-semibold text-slate-900">Det här finns sparat · {summary.date}</h3>
    <p className="mt-2 text-sm">Din tid: <strong>{(summary.ownMinutes / 60).toLocaleString('sv-SE', { maximumFractionDigits: 2 })} timmar</strong> i {summary.ownEntryCount} poster.</p>
    <p className="mt-1 text-sm">Dina arbetsanteckningar: <strong>{summary.ownNotes.length}</strong>.</p>
    {summary.ownNotes.length > 0 && <details className="mt-2 text-sm"><summary>Visa sparade anteckningar</summary><ul className="mt-2 space-y-2">{summary.ownNotes.map(n => <li key={n.id} className="whitespace-pre-wrap">{n.text}</li>)}</ul></details>}
    {summary.activeTimer && <p className="mt-3 rounded-lg bg-amber-100 p-2 text-sm text-amber-900">Du har en pågående timer eller instämpling. <a href="/dashboard/time" className="underline">Kontrollera din tid</a> innan du lägger till mer.</p>}
    {summary.ownEntryCount === 0 && summary.ownNotes.length === 0 && <p className="mt-2 text-sm">Inga egna tidsrader eller arbetsanteckningar finns sparade för detta jobb och datum ännu.</p>}
    <p className="mt-3 text-xs text-slate-500">{summary.scope}</p>
  </section>
}
