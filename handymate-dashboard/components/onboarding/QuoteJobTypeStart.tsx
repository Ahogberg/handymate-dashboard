'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { templatesForJobType, type FirstQuoteSelection, type QuoteSetupData } from '@/lib/quotes/job-type-setup'
import { fetchQuoteSetup } from '@/lib/quotes/job-type-start'
import './quote-job-type-start.css'

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
  return <section className="quote-job-start" aria-label="Jobbtyp och offertunderlag" aria-busy={loading || busy}>
    <div><h2>{inherited ? 'Ditt underlag för jobbet' : 'Vad ska du offerera?'}</h2>
      <p>Välj jobbtyp för dina vanliga rader och priser. Förbehållen föreslås i offertvyn.</p></div>
    {loading && <p role="status">Hämtar ditt upplägg…</p>}
    {error && <p role="alert">{error} <button type="button" disabled={busy} onClick={() => {
      if (lastSelection.current) void apply(lastSelection.current)
      else { attempted.current = false; setRetry(n => n + 1) }
    }}>Försök igen</button></p>}
    {data && !loading && <>
      {inherited ? <p className="quote-job-selected">{data.jobTypes.find(j => j.slug === jobType)?.name || jobType}</p> :
        <div className="quote-job-choices">{data.jobTypes.map(job => <button key={job.id} type="button" disabled={busy} aria-pressed={jobType === job.slug}
          onClick={() => { lastSelection.current = null; onSelectJobType(job.slug); setError('') }}>{job.name}</button>)}</div>}
      {!data.linkingAvailable && <p>Mallkopplingen är inte aktiverad ännu. Du kan beskriva jobbet eller välja en mall som vanligt.</p>}
      {data.linkingAvailable && matching.map(t => <button type="button" className="quote-job-template" key={t.id} disabled={busy}
        onClick={() => void apply({ jobTypeSlug: jobType!, templateId: t.id })}>
        <span><strong>{t.name}</strong><small>{t.items.length} rader · aktuella artikelpriser och ditt timpris</small></span>
        {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
      </button>)}
      {data.linkingAvailable && ((jobType && matching.length === 0) || data.jobTypes.length === 0) &&
        <p>Inget kopplat underlag ännu. Fortsätt med din beskrivning eller en tom offert. <a href="/dashboard/settings/job-types">Anpassa dina jobbtyper</a>.</p>}
    </>}
    {busy && <p role="status">Kontrollerar mall och aktuella artikelpriser…</p>}
  </section>
}
