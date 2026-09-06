'use client'

import { useMemo, useState } from 'react'
import { ArrowRight, Check, FileText, Radio, Sparkles } from 'lucide-react'
import { getAgentById } from '@/lib/agents/team'
import { deriveFirstAssignmentOptions, type FirstAssignmentId } from '@/lib/onboarding/first-assignment-options'
import { writeFirstMissionPrompt, clearFirstMissionPrompt } from '@/lib/onboarding/first-mission-handoff'
import { firstFocusOption } from '@/lib/onboarding/first-focus'
import type { OnboardingFormData } from '../types-redesign'

interface Props {
  data: OnboardingFormData
  unpaidCount: number
  openDealsCount: number
  onFinish: () => void
  onFirstQuote?: () => void
  busy?: boolean
}

export function FirstAssignmentFinal({ data, unpaidCount, openDealsCount, onFinish, onFirstQuote, busy = false }: Props) {
  const options = useMemo(() => deriveFirstAssignmentOptions({
    hasFirstQuoteSetup: Boolean(onFirstQuote && data.firstQuoteSelection),
    firstFocus: data.firstFocus,
    unpaidCount,
    openDealsCount,
    importedCustomers: data.importedCustomers ?? 0,
  }), [data.firstFocus, data.firstQuoteSelection, data.importedCustomers, onFirstQuote, openDealsCount, unpaidCount])
  const [handoffError, setHandoffError] = useState(false)
  const focus = firstFocusOption(data.firstFocus)
  const [selectedId, setSelectedId] = useState<FirstAssignmentId | null>(null)
  const selected = options.find(option => option.id === selectedId) ?? options[0]

  function start() {
    if (!selected || busy) return
    if (selected.id === 'first_quote' && onFirstQuote) {
      clearFirstMissionPrompt()
      onFirstQuote()
      return
    }
    setHandoffError(false)
    if (selected.prompt && !writeFirstMissionPrompt(selected.prompt, data.businessId || '')) {
      setHandoffError(true)
      return
    }
    onFinish()
  }

  return (
    <section className="first-assignment-final" style={{ flexShrink: 0 }} aria-label="Teamets första uppdrag">
      <div className="first-assignment-final__heading">
        <Sparkles size={19} aria-hidden="true" />
        <div><span>TEAMET ÄR REDO</span><h2>Vad ska vi ta tag i först?</h2></div>
      </div>
      <p className="first-assignment-final__intro">
        Du väljer riktning. Matte kontrollerar underlaget och inget skickas utan ditt godkännande.
      </p>
      {focus && <p className="rounded-xl bg-teal-50 border border-teal-100 p-3 text-sm text-teal-900">
        Du valde: <strong>{focus.label}</strong>. Här är en start utifrån ditt underlag.
      </p>}
      <div className="first-assignment-final__options">
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            disabled={busy}
            aria-pressed={selected?.id === option.id}
            onClick={() => setSelectedId(option.id)}
            className={selected?.id === option.id ? 'selected' : ''}
          >
            <span className="first-assignment-final__check">{selected?.id === option.id && <Check size={13} />}</span>
            <span className="first-assignment-final__copy"><strong>{option.title}</strong>{index === 0 && <small>Rekommenderad start</small>}<small>{option.description}</small></span>
            <span className="first-assignment-final__agents" aria-label="Ansvariga">
              {option.agentIds.map(agentId => {
                const agent = getAgentById(agentId)
                return <img key={agentId} src={agent?.avatar} alt={agent?.name ?? ''} title={agent?.name} />
              })}
            </span>
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-600 my-3">
        {selected?.id === 'first_quote' ? 'Ditt resultat: en offert att granska för ditt eget jobb.' : 'Nästa steg: en förifylld fråga till Matte. Du kan ändra den innan du skickar och får ett svar att granska.'}
      </p>
      {busy && <p role="status" className="text-sm text-teal-800">Sparar dina val innan vi öppnar nästa steg…</p>}
      {handoffError && <p role="alert" className="text-sm text-red-700">Kunde inte ta med din fråga. Försök igen eller välj Utforska själv och öppna Matte där.</p>}
      <button type="button" className="ob-cta" disabled={busy} onClick={start}>
        {selected?.id === 'first_quote'
          ? <><FileText size={18} /> Skapa min första offert</>
          : <><Radio size={18} /> Förbered mitt första uppdrag <ArrowRight size={18} /></>}
      </button>
      <button type="button" className="ob-cta ghost" disabled={busy} onClick={() => { clearFirstMissionPrompt(); onFinish() }}>Utforska själv</button>
    </section>
  )
}
