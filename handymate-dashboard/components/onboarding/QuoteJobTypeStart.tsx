'use client'

// KOMPAKTERING (offertytan Del 2, 2026-09-01): den gamla 720px-centrerade
// "Vad ska du offerera?"-boxen (~250-300px hög, egen CSS-fil) bröt 1600px-
// gridens linjer och tryckte ner hela offerten en halv skärm. Nu är detta en
// enradig remsa i samma visuella familj som "Mer"-verktygsraden i
// QuoteBuilder (vit, border-slate-200, rounded-2xl, p-2, liten
// versal-etikett) — återinför INTE rubriken/ingressen eller 720px-boxen.
//
// TEST-LÅST (tests/job-type-start-ui.spec.ts) — ändra inte utan att ändra
// testet medvetet i samma commit:
//  - exakta strängen "Ditt underlag för jobbet" när inherited är satt
//  - "inte aktiverad" när linkingAvailable saknas
//  - "Kunde inte hämta dina jobbtyper" + "Försök igen"-knappen i role=alert
//  - role=status under laddning/apply, aria-pressed på jobbtypschips
//  - mallknapparna är <button> med mallnamnet i textContent
//  - prop-signaturen (jobType/inherited/initialIntent/automatic/
//    onSelectJobType/onApply)
// All apply-/automatik-logik nedan är OFÖRÄNDRAD från stora boxen — Del 2
// är enbart visuell.

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { templatesForJobType, type FirstQuoteSelection, type QuoteSetupData } from '@/lib/quotes/job-type-setup'
import { fetchQuoteSetup } from '@/lib/quotes/job-type-start'

interface Props {
  jobType: string | null
  /** Deal-jobbtypen är redan vald. Fråga inte igen eller byt vid kallstart. */
  inherited: boolean
  initialIntent: FirstQuoteSelection | null
  automatic?: boolean
  onSelectJobType: (slug: string) => void
  onApply: (selection: FirstQuoteSelection, signal: AbortSignal) => Promise<void>
}

export function QuoteJobTypeStart({ jobType, inherited, initialIntent, automatic = true, onSelectJobType, onApply }: Props) {
  const [data, setData] = useState<QuoteSetupData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const attempted = useRef(false)
  const applyController = useRef<AbortController | null>(null)
  const lastSelection = useRef<FirstQuoteSelection | null>(null)
  const callbacks = useRef({ onApply, onSelectJobType })
  callbacks.current = { onApply, onSelectJobType }
  useEffect(() => () => applyController.current?.abort(), [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    fetchQuoteSetup(controller.signal).then(setData).catch(() => {
      if (!controller.signal.aborted) setError('Kunde inte hämta dina jobbtyper. Du kan fortsätta utan underlag.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [retry])

  async function apply(selection: FirstQuoteSelection) {
    if (applyController.current) return
    const controller = new AbortController()
    applyController.current = controller
    lastSelection.current = selection
    setBusy(true); setError('')
    try { await callbacks.current.onApply(selection, controller.signal) }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Kunde inte öppna underlaget.') }
    finally {
      applyController.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  // Bara en automatisk start: onboardingens EXPLICITA val, eller affärens
  // redan valda jobbtyp med exakt en mall. Flera mallar kräver alltid ett val.
  useEffect(() => {
    if (!data || attempted.current || !automatic || !data.linkingAvailable) return
    attempted.current = true
    if (initialIntent) { void apply(initialIntent); return }
    if (!inherited || !jobType) return
    const matching = templatesForJobType(data.templates, jobType).filter(t => t.items.length > 0)
    if (matching.length === 1) void apply({ jobTypeSlug: jobType, templateId: matching[0].id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const matching = data && jobType ? templatesForJobType(data.templates, jobType).filter(t => t.items.length > 0) : []
  // Chipstil = Fas E:s Mer-chips, så remsan läses som en i verktygsstacken.
  const chip = 'px-3 py-1.5 rounded-[10px] text-[12.5px] font-semibold transition-colors border disabled:opacity-60'
  return <section aria-label="Jobbtyp och offertunderlag" aria-busy={loading || busy}
    className="bg-white border border-slate-200 rounded-2xl p-2 flex flex-wrap items-center gap-1.5">
    <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
      {inherited ? 'Ditt underlag för jobbet' : 'Jobbtyp'}
    </span>
    {loading && <span role="status" className="text-[12.5px] text-slate-500">Hämtar ditt upplägg…</span>}
    {error && <span role="alert" className="text-[12.5px] text-red-700">
      {error}{' '}
      <button type="button" disabled={busy} className="underline font-semibold text-primary-700 disabled:opacity-60" onClick={() => {
        if (lastSelection.current) void apply(lastSelection.current)
        else { attempted.current = false; setRetry(n => n + 1) }
      }}>Försök igen</button>
    </span>}
    {data && !loading && <>
      {inherited ? <span className="px-1 text-[12.5px] font-semibold text-slate-700">{data.jobTypes.find(j => j.slug === jobType)?.name || jobType}</span> :
        data.jobTypes.map(job => <button key={job.id} type="button" disabled={busy} aria-pressed={jobType === job.slug}
          className={`${chip} ${jobType === job.slug ? 'bg-primary-700 text-white border-primary-700' : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'}`}
          onClick={() => { lastSelection.current = null; onSelectJobType(job.slug); setError('') }}>{job.name}</button>)}
      {!data.linkingAvailable && <span className="text-[12.5px] text-slate-500">Mallkopplingen är inte aktiverad ännu — beskriv jobbet eller välj en mall som vanligt.</span>}
      {data.linkingAvailable && matching.map(t => <button type="button" key={t.id} disabled={busy}
        className="px-3 py-1.5 rounded-[10px] border border-primary-700/30 bg-primary-50 hover:bg-primary-100 transition-colors inline-flex items-center gap-2 text-left disabled:opacity-60"
        onClick={() => void apply({ jobTypeSlug: jobType!, templateId: t.id })}>
        <span className="text-[12.5px] font-semibold text-primary-800">{t.name}</span>
        <span className="text-[11px] text-slate-400">{t.items.length} rader · dina priser</span>
        {busy ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none shrink-0" /> : <ArrowRight size={14} className="shrink-0 text-primary-700" />}
      </button>)}
      {data.linkingAvailable && ((jobType && matching.length === 0) || data.jobTypes.length === 0) &&
        <span className="text-[12.5px] text-slate-500">Inget kopplat underlag ännu — fortsätt fritt. <a href="/dashboard/settings/job-types" className="underline text-primary-700">Anpassa dina jobbtyper</a></span>}
    </>}
    {busy && <span role="status" className="text-[12.5px] text-slate-500">Kontrollerar mall och aktuella artikelpriser…</span>}
  </section>
}
