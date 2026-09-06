'use client'
import { useEffect, useRef, useState } from 'react'
import { svDateStr } from '@/lib/dates'
import { REPORT_LABELS, readReportConfirmation, confirmedReportResult, type ReportConfirmation } from '@/lib/matte/day-close-client'
import { useReportDictation } from './useReportDictation'
interface Receipt { token: string; label: string; summary: string; duplicate: boolean; tool: ReportConfirmation['tool_name'] }
export default function DayClose({ projectId, projectName, onSaved }: { projectId: string; projectName: string; onSaved?: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(svDateStr())
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reply, setReply] = useState('')
  const [pending, setPending] = useState<ReportConfirmation | null>(null)
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [history, setHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [thread, setThread] = useState<string | null>(null)
  const inFlight = useRef(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const dictation = useReportDictation(value => setText(previous => [previous,value].filter(Boolean).join('\n')), setError)
  const locked = busy || dictation.busy || dictation.recording
  async function send(confirm = false) {
    if (inFlight.current || locked || !confirm && (!text.trim() || pending)) return
    const current = pending
    if (confirm && !current) return
    inFlight.current = true; setBusy(true); setError('')
    const messages = [...history, { role: 'user' as const, content: text.trim() }]
    try {
      const res = await fetch('/api/matte/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(confirm ? { confirm: { token: current!.token } } : {
        messages, context: { projectId, workReport: true, workDate: date, threadId: thread }, require_confirm_external: true,
      }) })
      const body = await res.json()
      if (!alive.current) return
      if (!res.ok) throw new Error('Rapporten kunde inte hanteras. Försök igen; vid osäkert sparresultat ska samma bekräftelse återanvändas.')
      const replyText = typeof body.reply === 'string' ? body.reply : ''
      if (confirm) {
        const status = confirmedReportResult(body, current!)
        if (!status) throw new Error(replyText || 'Sparningen kunde inte bekräftas. Försök med samma knapp igen.')
        setReceipts(previous => previous.some(row => row.token === current!.token) ? previous : [...previous, { token: current!.token, label: REPORT_LABELS[current!.tool_name], summary: current!.summary, duplicate: status === 'already_saved', tool: current!.tool_name }])
        // A saved step stays saved even when the following proposal is malformed.
        setPending(null)
        // Refresh failures must never turn a confirmed write into a failed-write receipt.
        try { await onSaved?.() } catch { setError('Uppgiften är sparad, men projektvyn kunde inte uppdateras. Läs in projektet igen.') }
      }
      setReply(replyText)
      const next = readReportConfirmation(body.pending_confirmation, projectId, date)
      setPending(next)
      if (confirm && !next) { setHistory([]); setThread(null) }
      if (!confirm) { setHistory([...messages, ...(replyText ? [{ role: 'assistant' as const, content: replyText }] : [])]); setText('') }
      if ((!confirm || next) && typeof body.thread_id === 'string') setThread(body.thread_id)
    } catch (err) { if (alive.current) setError(err instanceof Error ? err.message : 'Kunde inte nå företagskontoret. Dina uppgifter finns kvar här; försök igen.') }
    finally { inFlight.current = false; if (alive.current) setBusy(false) }
  }
  function reset() { setPending(null); setReceipts([]); setHistory([]); setThread(null); setReply(''); setError(''); setText('') }
  return <section className="rounded-xl border border-teal-200 bg-white p-4">
    <button type="button" disabled={locked} aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-[44px] w-full text-left font-semibold text-teal-800">Avsluta arbetsdagen <span className="float-right text-sm">{open ? 'Stäng' : 'Öppna'}</span></button>
    <div className={open ? 'mt-3 space-y-4' : 'hidden'}>
      <p className="text-sm text-slate-600">{projectName} · Din egen tid, intern anteckning, material och ÄTA-förslag. Beskriv vad du vill registrera och granska varje del innan den sparas.</p>
      <label className="block text-sm font-medium">Rapportdatum<input type="date" value={date} disabled={locked || !!pending || history.length > 0 || receipts.length > 0} onChange={event => setDate(event.target.value)} className="mt-1 block min-h-[44px] rounded-lg border p-2" /></label>
      {receipts.length > 0 && <div className="rounded-lg bg-teal-50 p-3"><h3 className="font-medium text-teal-900">Sparat i den här rapporten</h3>{receipts.map(row => <details key={row.token} className="mt-2 text-sm"><summary>{row.label} — {row.duplicate ? 'redan sparat, ingen dubblett' : 'sparat'}</summary><p className="mt-2 whitespace-pre-wrap">{row.summary}</p></details>)}{receipts.some(row => row.tool === 'create_ata_draft') && <p className="mt-3 text-sm">ÄTA-förslaget behöver granskas innan ett ÄTA-utkast skapas. <a href="/dashboard/approvals" className="underline">Öppna godkännandekön</a>. Ägare och administratörer kan också <a href="/dashboard/pengar" className="underline">följa intäktsärendet i Pengar</a>.</p>}</div>}
      {reply && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{reply}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {pending ? <div className="rounded-lg border border-teal-300 p-3"><h3 className="font-semibold">Kontrollera nästa del</h3><p className="my-3 whitespace-pre-wrap text-sm">{pending.summary}</p><button type="button" disabled={locked} onClick={() => void send(true)} className="min-h-[44px] rounded-lg bg-teal-700 px-4 py-2 font-medium text-white disabled:opacity-50">{busy ? 'Kontrollerar sparningen…' : pending.confirm_label}</button><button type="button" disabled={locked} onClick={() => { setPending(null); setHistory([]); setThread(null); setReply('De återstående förslagen har lagts åt sidan. Tidigare sparade delar finns kvar.'); setError('') }} className="ml-3 min-h-[44px] text-sm text-slate-600 underline">Avstå från återstående delar</button></div> : <form onSubmit={event => { event.preventDefault(); void send() }} className="space-y-3">
        <label className="block text-sm font-medium">Vad vill du registrera?<textarea value={text} maxLength={6000} rows={4} disabled={locked} onChange={event => setText(event.target.value)} className="mt-2 block w-full rounded-lg border p-3 font-normal" placeholder="Registrera tre timmar på mig för montering. Spara också en intern anteckning om att vi behöver återkomma för målningen." /></label>
        <div className="flex flex-wrap gap-3"><button type="button" disabled={busy || dictation.busy} onClick={() => dictation.recording ? dictation.stop() : void dictation.start()} className="min-h-[44px] rounded-lg border border-teal-700 px-4 py-2 text-sm text-teal-800 disabled:opacity-50">{dictation.recording ? 'Stoppa diktering' : dictation.busy ? 'Tolkar inspelningen…' : 'Diktera (högst en minut)'}</button><button disabled={locked || !text.trim() || !date} className="min-h-[44px] rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Tar fram förslag…' : 'Ta fram förslag'}</button></div>
        <p className="text-xs text-slate-500">Dikteringen fyller bara i texten. Kontrollera den innan du går vidare. Inget kundmeddelande skickas och projektet avslutas inte.</p>
      </form>}
      {!pending && (history.length > 0 || receipts.length > 0) && <button type="button" disabled={locked} onClick={reset} className="min-h-[44px] text-sm text-slate-500 underline">Börja en ny rapport (sparade uppgifter finns kvar)</button>}
    </div>
  </section>
}
