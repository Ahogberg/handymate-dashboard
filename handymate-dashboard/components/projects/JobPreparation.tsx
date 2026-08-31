/** @jsxRuntime classic */
'use client'

import React, { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { useBusiness } from '@/lib/BusinessContext'
import { useJobbuddy } from '@/lib/JobbuddyContext'
import { preparationPrompt, type JobPreparation as Preparation, type PreparationSelector } from '@/lib/job-preparation/types'

const dateTime = (value: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
const stateLabel = { available: 'Källa finns', missing: 'Saknas i underlaget', unavailable: 'Kunde inte läsas', restricted: 'Begränsad behörighet' }

/** Presentation is shared between booking, project and day plan. Never a readiness score. */
export function PreparationBody({ preparation, onAskMatte }: { preparation: Preparation; onAskMatte: () => void }) {
  return (
    <div className="space-y-4 text-sm text-slate-700">
      <div>
        <Link href={preparation.project.href} className="font-semibold text-slate-900 hover:underline break-words">{preparation.project.name}</Link>
        <p className="mt-1">{preparation.customer.name} · <Link className="underline" href={preparation.booking.href}>{dateTime(preparation.booking.start)}</Link></p>
      </div>
      <div className="rounded-lg bg-slate-50 p-3">
        <p className="font-medium text-slate-900">Adress att kontrollera</p>
        <p className="mt-1 break-words">{preparation.address.text || (preparation.address.state === 'unavailable' ? 'Adressunderlaget kunde inte läsas.' : 'Ingen projektadress kunde verifieras. Bekräfta adressen före besöket.')}</p>
        <p className="mt-1 text-xs text-slate-500">{preparation.address.source}</p>
      </div>
      <p>Här är Lars läsunderlag inför besöket. Kontrollera luckorna innan du åker. Förberedelsen ändrar inget och skickar inga meddelanden.</p>
      <div className="divide-y divide-slate-100">
        {preparation.sections.map(section => (
          <details key={section.key} className="py-3" open={section.state === 'unavailable'}>
            <summary className="cursor-pointer min-h-[44px] leading-6">
              <span className="font-medium text-slate-900">{section.title}</span>
              <span className={`block text-xs ${section.state === 'unavailable' ? 'text-amber-800' : 'text-slate-500'}`}>{stateLabel[section.state]} · Visa varför</span>
            </summary>
            <p className="mt-2 text-sm">{section.message}</p>
            {section.items.length > 0 && <ul className="mt-2 space-y-3">
              {section.items.map(item => <li key={item.id} className="break-words">
                <p>{item.text}</p>
                {/* Project tabs currently read ?tab only on mount. A real navigation
                    guarantees the source opens even when already on this project. */}
                <a href={item.href} className="inline-block py-1 text-xs text-primary-700 underline">{item.source} →</a>
              </li>)}
            </ul>}
          </details>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onAskMatte} className="min-h-[44px] rounded-lg bg-primary-700 px-4 py-2 font-medium text-white hover:bg-primary-800">Fråga Matte</button>
        <span className="text-xs text-slate-500">Öppnar en fråga som du kan ändra innan du skickar.</span>
      </div>
      <p className="text-xs text-slate-500">Läst {dateTime(preparation.observedAt)}. Detta är ett urval av projektets registrerade underlag, inte ett besked att allt är klart.</p>
    </div>
  )
}

export default function JobPreparation(props: PreparationSelector) {
  const business = useBusiness()
  // Tenant/entity changes unmount both data and in-flight requests, not just the title.
  return <PreparationSession key={`${business.business_id}:${props.bookingId || props.projectId}`} selector={props} />
}

function PreparationSession({ selector }: { selector: PreparationSelector }) {
  const { setPendingPrompt, setIsOpen, setActiveTab, setPendingVoice } = useJobbuddy()
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ data?: Preparation; error?: string }>({})
  const regionId = useId()
  const query = selector.bookingId ? `booking_id=${encodeURIComponent(selector.bookingId)}` : `project_id=${encodeURIComponent(selector.projectId!)}`
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setState({})
    void (async () => {
      try {
        const response = await fetch(`/api/job-preparation?${query}`, { cache: 'no-store', signal: controller.signal })
        const body = await response.json()
        if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Förberedelsen kunde inte läsas.')
        if (!body.preparation || body.preparation.version !== 1 || !Array.isArray(body.preparation.sections)) throw new Error('Förberedelsen kunde inte bekräftas.')
        if (!controller.signal.aborted) setState({ data: body.preparation })
      } catch (error) {
        if (!controller.signal.aborted) setState({ error: error instanceof Error ? error.message : 'Förberedelsen kunde inte läsas. Försök igen.' })
      }
    })()
    return () => controller.abort()
  }, [open, query, attempt])
  return (
    <section className="my-3 min-w-0 rounded-xl border border-slate-200 bg-white">
      <button type="button" aria-expanded={open} aria-controls={regionId} onClick={() => setOpen(!open)} className="flex min-h-[56px] w-full items-center gap-3 p-3 text-left">
        <AgentAvatar agentKey="lars" size="sm" />
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-900">Inför nästa jobb</span><span className="block text-xs text-slate-500">Lars · Läs underlaget inför besöket</span></span>
        {open ? <ChevronUp aria-hidden className="h-4 w-4 shrink-0" /> : <ChevronDown aria-hidden className="h-4 w-4 shrink-0" />}
      </button>
      {open && <div id={regionId} className="border-t border-slate-100 p-3 sm:p-4">
        {!state.data && !state.error && <p role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 aria-hidden className="h-4 w-4 animate-spin" />Läser projektets underlag…</p>}
        {state.error && <div role="alert" className="text-sm text-slate-700"><p>{state.error}</p><Link href="/dashboard/calendar" className="inline-block min-h-[44px] py-3 text-primary-700 underline">Öppna kalendern</Link></div>}
        {state.data && <PreparationBody preparation={state.data} onAskMatte={() => {
          setPendingPrompt(preparationPrompt(state.data!))
          setPendingVoice(false)
          setActiveTab('chat')
          setIsOpen(true)
        }} />}
        {(state.error || state.data) && <button type="button" className="mt-2 min-h-[44px] text-sm text-primary-700 underline" onClick={() => setAttempt(n => n + 1)}>Läs in igen</button>}
      </div>}
    </section>
  )
}
