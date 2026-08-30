'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { deriveCallOutcome } from '@/lib/voice/call-outcome'

type Detail = { call: { summary: string | null; project_id: string | null; transcribed: boolean; raw_deleted: boolean; phase: string | null };
  projects: { project_id: string; name: string }[]; outcome: ReturnType<typeof deriveCallOutcome> }

export function CallOutcomeCard({ recordingId }: { recordingId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [project, setProject] = useState('')
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/voice/calls?recording_id=${encodeURIComponent(recordingId)}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setDetail(data); setProject(data.call.project_id || '')
    } catch (e) { setDetail(null); setError(e instanceof Error ? e.message : 'Kunde inte läsa samtalet.') }
  }, [recordingId])
  useEffect(() => { setDetail(null); setError(''); void load() }, [load])
  async function act(kind: 'analyze' | 'project') {
    setBusy(true); setError('')
    try {
      const response = await fetch(kind === 'analyze' ? '/api/voice/analyze' : '/api/voice/calls', {
        method: kind === 'analyze' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recording_id: recordingId, ...(kind === 'project' ? { project_id: project || null } : {}) }),
      })
      const data = await response.json()
      if (!response.ok || data.success === false) throw new Error(data.error || 'Kunde inte slutföra åtgärden.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Försök igen.') }
    finally { await load(); setBusy(false) }
  }
  return <section aria-label="Samtalets efterarbete" className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5">
    <header><p className="text-sm font-semibold text-teal-700">Lisa · Efter samtalet</p>
      <h2 className="text-xl font-semibold text-slate-900">Det här händer nu</h2></header>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!detail ? <p className="text-slate-500">{error ? 'Uppgifterna är inte tillgängliga.' : 'Hämtar samtalet…'}</p> : <>
      {detail.call.summary && <p className="whitespace-pre-wrap text-slate-700">{detail.call.summary}</p>}
      {detail.outcome.processingIssue && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{detail.outcome.processingIssue}</p>}
      {([['Registrerat', detail.outcome.done], ['Behöver ditt beslut', detail.outcome.pending],
        ['Kunde inte utföras', detail.outcome.failed], ['Övrigt', detail.outcome.other]] as const).map(([title, items]) => items.length > 0 && <div key={title}>
          <h3 className="font-semibold text-slate-900">{title}</h3><ul className="mt-2 space-y-2">{items.map(item => <li key={item.id} className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs font-medium text-teal-700">{item.agent}</p><p className="font-medium break-words">{item.title}</p>
            <p className="text-sm text-slate-600">{item.label}</p><Link className="inline-block py-2 font-medium text-teal-700 underline" href={item.href}>Öppna →</Link>
          </li>)}</ul></div>)}
      {detail.outcome.analyzed && detail.outcome.done.length + detail.outcome.pending.length + detail.outcome.failed.length + detail.outcome.other.length === 0 &&
        <p className="text-sm text-slate-600">Inga förslag att ta vidare hittades i samtalet.</p>}
      {detail.projects.length > 0 && <div className="space-y-2 border-t pt-4">
        <label htmlFor={`project-${recordingId}`} className="block text-sm font-medium">Vilket projekt gäller samtalet?</label>
        <select id={`project-${recordingId}`} value={project} onChange={e => setProject(e.target.value)} className="w-full rounded-lg border p-3">
          <option value="">Inte kopplat till ett projekt</option>{detail.projects.map(p => <option key={p.project_id} value={p.project_id}>{p.name}</option>)}
        </select><button disabled={busy || project === (detail.call.project_id || '')} onClick={() => void act('project')} className="rounded-lg bg-teal-700 px-4 py-2 text-white disabled:opacity-50">Spara projektkoppling</button>
      </div>}
      {(detail.outcome.retryable || (!detail.call.phase && detail.call.transcribed && !detail.outcome.processingIssue)) && !detail.call.raw_deleted &&
        <button disabled={busy} onClick={() => void act('analyze')} className="rounded-lg bg-teal-700 px-4 py-3 text-white disabled:opacity-50">{busy ? 'Bearbetar…' : 'Komplettera efterarbetet'}</button>}
    </>}
    <button disabled={busy} onClick={() => { setError(''); void load() }} className="block min-h-11 text-sm text-teal-700 underline disabled:opacity-50">Uppdatera status</button>
  </section>
}
