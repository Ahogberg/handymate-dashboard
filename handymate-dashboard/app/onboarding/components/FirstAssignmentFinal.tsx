'use client'

import { useMemo, useState } from 'react'
import { ArrowRight, Check, FileText, Radio, Sparkles } from 'lucide-react'
import { getAgentById } from '@/lib/agents/team'
import { deriveFirstAssignmentOptions, type FirstAssignmentId } from '@/lib/onboarding/first-assignment-options'
import { writeFirstMissionPrompt } from '@/lib/onboarding/first-mission-handoff'
import type { OnboardingFormData } from '../types-redesign'

interface Props {
  data: OnboardingFormData
  unpaidCount: number
  openDealsCount: number
  onFinish: () => void
  onFirstQuote?: () => void
}

export function FirstAssignmentFinal({ data, unpaidCount, openDealsCount, onFinish, onFirstQuote }: Props) {
  const options = useMemo(() => deriveFirstAssignmentOptions({
    hasFirstQuoteSetup: Boolean(onFirstQuote && data.firstQuoteSelection),
    firstFocus: data.firstFocus,
    unpaidCount,
    openDealsCount,
    importedCustomers: data.importedCustomers ?? 0,
  }), [data.firstFocus, data.firstQuoteSelection, data.importedCustomers, onFirstQuote, openDealsCount, unpaidCount])
  const [selectedId, setSelectedId] = useState<FirstAssignmentId>(options[0]?.id ?? 'customer_inflow')
  const selected = options.find(option => option.id === selectedId) ?? options[0]

  function start() {
    if (!selected) return
    if (selected.id === 'first_quote' && onFirstQuote) {
      onFirstQuote()
      return
    }
    if (selected.prompt) writeFirstMissionPrompt(selected.prompt)
    onFinish()
  }

  return (
    <section className="first-assignment-final" aria-label="Teamets första uppdrag">
      <div className="first-assignment-final__heading">
        <Sparkles size={19} aria-hidden="true" />
        <div><span>TEAMET ÄR REDO</span><h2>Vad ska vi ta tag i först?</h2></div>
      </div>
      <p className="first-assignment-final__intro">
        Du väljer riktning. Matte kontrollerar underlaget och inget skickas utan ditt godkännande.
      </p>
      <div className="first-assignment-final__options">
        {options.map(option => (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected?.id === option.id}
            onClick={() => setSelectedId(option.id)}
            className={selected?.id === option.id ? 'selected' : ''}
          >
            <span className="first-assignment-final__check">{selected?.id === option.id && <Check size={13} />}</span>
            <span className="first-assignment-final__copy"><strong>{option.title}</strong><small>{option.description}</small></span>
            <span className="first-assignment-final__agents" aria-label="Ansvariga">
              {option.agentIds.map(agentId => {
                const agent = getAgentById(agentId)
                return <img key={agentId} src={agent?.avatar} alt={agent?.name ?? ''} title={agent?.name} />
              })}
            </span>
          </button>
        ))}
      </div>
      <button type="button" className="ob-cta" onClick={start}>
        {selected?.id === 'first_quote'
          ? <><FileText size={18} /> Skapa min första offert</>
          : <><Radio size={18} /> Låt Matte ta fram planen <ArrowRight size={18} /></>}
      </button>
      <button type="button" className="ob-cta ghost" onClick={onFinish}>Utforska själv</button>
    </section>
  )
}
