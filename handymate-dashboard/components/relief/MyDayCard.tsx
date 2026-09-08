'use client'
import { useEffect, useState } from 'react'
import type { MyDay } from '@/lib/relief/my-day'
import { svDateStr } from '@/lib/dates'
import { followupLabels, followupReasons } from '@/lib/followup/presentation'
import DayClose from '@/components/day-close/DayClose'

export function MyDayCard() {
  const [date, setDate] = useState(svDateStr)
  const [result, setResult] = useState<MyDay | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [report, setReport] = useState<{ id: string; name: string } | null>(null)
  useEffect(() => {
    const refresh = () => setRevision(n => n + 1)
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', refresh)
    window.addEventListener('handymate:approval-queue-changed', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('handymate:approval-queue-changed', refresh); document.removeEventListener('visibilitychange', visible) }
  }, [])
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    setResult(null); setError('')
    fetch(`/api/day-close?${new URLSearchParams({ view: 'day', date })}`, { cache: 'no-store', signal: controller.signal }).then(async r => {
      const body = await r.json()
      if (!r.ok || body.overview?.date !== date || !body.overview.work || !body.overview.timer) throw Error('Unavailable')
      if (active) setResult(body.overview)
    }).catch(() => { if (active) setError('Din dag kunde inte kontrolleras. Dina sparade uppgifter finns kvar; försök läsa dem igen.') }).finally(() => clearTimeout(timeout))
    return () => { active = false; controller.abort(); clearTimeout(timeout) }
  }, [date, revision])
  // A date change must hide the prior day's response immediately, before the effect runs.
  const day = result?.date === date ? result : null
  const hours = (minutes: number) => (minutes / 60).toLocaleString('sv-SE', { maximumFractionDigits: 2 })
  return <section aria-label="Din dag" className="mb-6 rounded-2xl border border-teal-100 bg-white p-5 sm:p-7">
    <h2 className="text-2xl font-semibold text-slate-900">Din dag</h2>
    <p className="mt-2 text-sm text-slate-600">Det du har sparat, det som behöver dig och nästa steg hos teamet.</p>
    <label className="mt-4 block text-sm font-medium">Visa rapportering för<input type="date" value={date} onChange={e => { setDate(e.target.value); setReport(null) }} className="mt-1 block min-h-[44px] max-w-full rounded-lg border p-2" /></label>
    {error ? <p role="alert" className="mt-4 text-amber-900">{error}</p> : !day ? <p role="status" className="mt-4">Kontrollerar din dag…</p> : <>
      {day.work.state === 'unavailable' ? <p role="alert" className="mt-4 text-amber-900">{day.work.message}</p> : <div className="mt-4">
        <p className="text-lg font-medium">{hours(day.work.value.minutes)} timmar rapporterade · {day.work.value.notes} arbetsanteckningar</p>
        <p className="mt-1 text-xs text-slate-500">Din avslutade rapporterade tid och dina anteckningar på jobb du har åtkomst till. Pågående timer, material och ÄTA ingår inte i summan.</p>
        {day.work.value.projects.length === 0 ? <p className="mt-3 text-sm">Inget eget arbete finns återläst för datumet på dina behöriga jobb. Har du arbetat? Lämna underlaget nedan och välj Rapportera arbete.</p> : <ul className="mt-4 divide-y divide-slate-100">{day.work.value.projects.map(p => <li key={p.id} className="py-3">
          <a href={`/dashboard/projects/${encodeURIComponent(p.id)}`} className="font-medium text-teal-800 underline break-words">{p.name}</a>
          <p className="mt-1 text-sm">{hours(p.minutes)} timmar · {p.notes} anteckningar</p>
          {date === svDateStr() ? <button type="button" onClick={() => setReport(p)} className="min-h-[44px] text-sm text-teal-800 underline">Komplettera dagens rapport</button> : <p className="mt-1 text-xs text-slate-500">Öppna jobbet för att kontrollera rapporteringen för {date}.</p>}
        </li>)}</ul>}
      </div>}
      <div className="mt-4 rounded-xl bg-slate-50 p-4">
        <h3 className="font-semibold">Behöver ses över nu</h3>
        <p className="mb-2 text-xs text-slate-500">Aktuellt läge, oavsett valt rapportdatum.</p>
        {day.timer.state === 'unavailable' ? <p role="alert">{day.timer.message}</p> : day.timer.value ? <p>Du har en pågående timer eller instämpling. <a href="/dashboard/time" className="text-teal-800 underline">Kontrollera din tid</a>.</p> : <p className="text-sm">Ingen pågående timer eller instämpling hittades.</p>}
        {day.decisions && (day.decisions.state === 'unavailable' ? <p role="alert" className="mt-2">{day.decisions.message}</p> : <p className="mt-2 text-sm">{day.decisions.value > 0 ? <a href="/dashboard/approvals" className="text-teal-800 underline">{day.decisions.value} beslut väntar på granskning</a> : 'Inga väntande godkännandekort hittades.'}</p>)}
      </div>
      {day.followups && <div className="mt-4"><h3 className="font-semibold">Nästa steg hos teamet</h3>
        {day.followups.state === 'unavailable' ? <p role="alert" className="mt-2 text-amber-900">{day.followups.message}</p> : <>
          {!day.followups.value.healthy && <p role="alert" className="mt-2 text-amber-900">Teamets senaste körning kan inte bekräftas. Planerade tider är inte bevis för utförd uppföljning.</p>}
          {day.followups.value.items.length === 0 ? <p className="mt-2 text-sm">Inga öppna schemalagda offertuppföljningar hittades. Öppna en skickad offert för att planera nästa steg.</p> : <ul className="mt-2 space-y-3">{day.followups.value.items.map(f => <li key={f.id} className="rounded-lg border border-slate-200 p-3 text-sm">
            <p className="font-medium">{followupLabels[f.state] || 'Behöver kontrolleras'} · {new Date(f.dueAt).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'short', timeStyle: 'short' })}</p>
            <p className="mt-1">{followupReasons[f.reason || ''] || 'Daniel förbereder uppföljningen från den sparade tiden. Du granskar innan SMS skickas.'}</p>
            <a href={`/dashboard/quotes/${encodeURIComponent(f.quoteId)}`} className="inline-flex min-h-[44px] items-center text-teal-800 underline">Öppna offertens nästa steg</a>
          </li>)}</ul>}
          <p className="mt-2 text-xs text-slate-500">Tider i svensk tid. Här visas öppna schemalagda offertuppföljningar, inklusive sådana som har stoppats. Övrigt agentarbete ingår inte.</p>
        </>}
      </div>}
      <p className="mt-4 text-xs text-slate-500">Kontrollerat {new Date(day.checkedAt).toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' })} svensk tid. Läs igen efter en ändring.</p>
    </>}
    <button type="button" onClick={() => setRevision(n => n + 1)} className="mt-2 min-h-[44px] text-sm text-teal-800 underline">Läs in igen</button>
    {report && date === svDateStr() && <div className="mt-4 border-t pt-4"><button type="button" onClick={() => { setReport(null); setRevision(n => n + 1) }} className="min-h-[44px] text-teal-800 underline">Tillbaka och läs sparat arbete</button><DayClose key={report.id} projectId={report.id} projectName={report.name} initiallyOpen /></div>}
  </section>
}
