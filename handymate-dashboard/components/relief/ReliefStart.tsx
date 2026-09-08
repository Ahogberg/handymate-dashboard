'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useJobbuddy } from '@/lib/JobbuddyContext'
import { useReportDictation } from '@/components/day-close/useReportDictation'
import DayClose from '@/components/day-close/DayClose'
import { loadReliefDraft, saveReliefDraft, createQuoteReliefHandoff, reliefPrompt, RELIEF_MAX_LENGTH, type ReliefIntent } from '@/lib/relief/intake'

const OPTIONS: Array<{ id: ReliefIntent; label: string; result: string }> = [
  { id: 'quote', label: 'En offert att få iväg', result: 'Ta med texten till offertbyggaren. Daniel hjälper dig ta fram ett utkast; du granskar kund, omfattning och pris innan utskick.' },
  { id: 'report', label: 'Dagens jobb att rapportera', result: 'Välj jobbet, beskriv dagen och granska tid, anteckning, material och tillägg. Sparade delar får egna kvitton.' },
  { id: 'followup', label: 'En kund att återkomma till', result: 'Ta med underlaget till Matte. Du granskar frågan innan den skickas till teamet. Ingen kundkontakt eller bevakning startar här.' },
]
export function ReliefStart({ businessId, userId, canQuote }: { businessId: string; userId: string; canQuote: boolean }) {
  const router = useRouter()
  const { setPendingPrompt, setActiveTab, setIsOpen } = useJobbuddy()
  const [intent, setIntent] = useState<ReliefIntent>(canQuote ? 'quote' : 'report')
  const [text, setText] = useState(''), [projectId, setProjectId] = useState('')
  const [ready, setReady] = useState(false), [error, setError] = useState('')
  const [projects, setProjects] = useState<Array<{ project_id: string; name: string }> | null>(null)
  const [projectsError, setProjectsError] = useState(false), [retry, setRetry] = useState(0)
  const [reportOpen, setReportOpen] = useState(false)
  const dictation = useReportDictation(value => setText(t => [t,value].filter(Boolean).join('\n').slice(0, RELIEF_MAX_LENGTH)), setError)
  useEffect(() => {
    const saved = loadReliefDraft(businessId, userId)
    if (saved) { setText(saved.text); setIntent(saved.intent === 'quote' && !canQuote ? 'report' : saved.intent); setProjectId(saved.projectId) }
    setReady(true)
  }, [businessId, userId, canQuote])
  useEffect(() => { if (ready) saveReliefDraft({ businessId, userId, intent, text, projectId }) }, [businessId, userId, ready, intent, text, projectId])
  useEffect(() => {
    if (intent !== 'report') return
    const controller = new AbortController()
    let active = true
    const timeout = setTimeout(() => controller.abort(), 15000)
    setProjects(null); setProjectsError(false)
    fetch('/api/projects?status=active', { signal: controller.signal, cache: 'no-store' }).then(async r => {
      if (!r.ok) throw new Error('projects')
      const d = await r.json()
      if (!Array.isArray(d.projects)) throw new Error('projects')
      if (active) setProjects(d.projects.map((p: { project_id: string; name: string }) => ({ project_id: p.project_id, name: p.name })))
    }).catch(() => { if (active) setProjectsError(true) }).finally(() => clearTimeout(timeout))
    return () => { active = false; controller.abort(); clearTimeout(timeout) }
  }, [intent, retry])
  const selectedProject = projects?.find(p => p.project_id === projectId)
  const locked = !ready || dictation.busy || dictation.recording
  function continueWork() {
    setError('')
    if (locked || text.trim().length < 8) return
    if (intent === 'report') { if (selectedProject) setReportOpen(true); return }
    if (intent === 'quote') {
      const handoff = createQuoteReliefHandoff(businessId, userId, text)
      if (!handoff) { setError('Texten kunde inte följa med. Kopiera den och öppna Offerter, eller försök igen.'); return }
      router.push(`/dashboard/quotes/new?relief=${handoff}`)
    } else { setPendingPrompt(reliefPrompt(text)); setActiveTab('chat'); setIsOpen(true) }
  }
  if (reportOpen && selectedProject) return <div className="space-y-4"><button type="button" className="min-h-[44px] text-teal-800 underline" onClick={() => setReportOpen(false)}>Tillbaka till mitt underlag</button><DayClose projectId={selectedProject.project_id} projectName={selectedProject.name} initialText={text} initiallyOpen /></div>
  return <section aria-label="Lämna över ditt underlag" className="rounded-2xl border border-teal-100 bg-white p-5 sm:p-7">
    <p className="text-sm font-medium text-teal-800">Vi börjar med en sak från din vardag</p>
    <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Vad ligger kvar till ikväll?</h1>
    <p className="mt-3 text-slate-600">Lämna underlaget här. Vi hjälper dig förbereda nästa steg, och du får granska innan något sparas eller skickas.</p>
    <div className="my-5 grid gap-2 sm:grid-cols-3" role="group" aria-label="Vad vill du få hjälp med?">{OPTIONS.filter(o => canQuote || o.id !== 'quote').map(o => <button type="button" key={o.id} disabled={locked} aria-pressed={intent === o.id} onClick={() => { setIntent(o.id); setError('') }} className={`min-h-[60px] rounded-xl border p-3 text-left text-sm font-medium ${intent === o.id ? 'border-teal-700 bg-teal-50 text-teal-900' : 'border-slate-200 text-slate-600'}`}>{o.label}</button>)}</div>
    <label className="block text-sm font-medium text-slate-800">Ditt underlag<textarea rows={6} maxLength={RELIEF_MAX_LENGTH} value={text} disabled={locked} onChange={e => setText(e.target.value)} placeholder="Klistra in kundens förfrågan eller beskriv vad som hänt på jobbet…" className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-base font-normal" /></label>
    <button type="button" disabled={!ready || dictation.busy} onClick={() => dictation.recording ? dictation.stop() : void dictation.start()} className="min-h-[44px] text-sm text-teal-800 underline">{dictation.recording ? 'Stoppa diktering' : dictation.busy ? 'Tolkar inspelningen…' : 'Diktera mitt underlag'}</button>
    {intent === 'report' && <div className="my-3">{projectsError ? <p role="alert">Jobben kunde inte läsas. <button type="button" className="min-h-[44px] underline" onClick={() => setRetry(n => n + 1)}>Försök igen</button></p> : projects === null ? <p role="status">Hämtar dina jobb…</p> : projects.length === 0 ? <p>Du har inga aktiva jobb att rapportera på. <a href="/dashboard/projects" className="underline">Öppna Jobb</a>.</p> : <label className="text-sm font-medium">Vilket jobb gäller det?<select className="mt-2 block min-h-[44px] w-full rounded-lg border p-2" value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">Välj jobb</option>{projects.map(p => <option key={p.project_id} value={p.project_id}>{p.name}</option>)}</select></label>}</div>}
    <div className="my-4 rounded-xl bg-slate-50 p-4"><h2 className="text-sm font-semibold">Det här blir nästa steg</h2><p className="mt-1 text-sm text-slate-600">{OPTIONS.find(o => o.id === intent)?.result}</p></div>
    {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
    <button type="button" disabled={locked || text.trim().length < 8 || intent === 'report' && !selectedProject} onClick={continueWork} className="min-h-[48px] w-full rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{intent === 'quote' ? 'Fortsätt med mitt offertunderlag' : intent === 'report' ? 'Förbered min rapport' : 'Förbered min fråga till Matte'}</button>
    <p className="mt-3 text-xs text-slate-500">Du kan skriva som du pratar. Bekräfta kund och jobb i nästa steg. Diktering fyller bara i texten.</p>
  </section>
}
