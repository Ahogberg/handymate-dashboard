'use client'

import { useRef, useState } from 'react'
import { ArrowRight, FileText, Loader2 } from 'lucide-react'
import { getAgentById } from '@/lib/agents/team'
import './first-quote-launch.css'

interface Props {
  companyName: string
  jobName: string
  templateName: string
  /** Kan bara anslutas efter att QuoteBuilder konsumerar/verifierar startreferenserna.
   * Anroparen finaliserar först, hämtar om underlaget och navigerar sist.
   * Ingen fördröjning för animationens skull, ingen påstådd offertskapning.
   */
  onContinue: () => Promise<void>
  onSkip: () => void | Promise<void>
}

export function FirstQuoteLaunch({ companyName, jobName, templateName, onContinue, onSkip }: Props) {
  const matte = getAgentById('matte')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)

  async function open(action: () => void | Promise<void>) {
    if (lock.current) return
    lock.current = true; setWorking(true); setError('')
    try { await action() }
    catch { setError('Kunde inte öppna offerten. Försök igen eller gå till översikten.') }
    finally { lock.current = false; setWorking(false) }
  }

  return <section className="first-quote-launch" data-opening={working} aria-label="Din första offert" aria-busy={working}>
    <div className="first-quote-host">
      <img src={matte?.avatar} alt="" width={80} height={80} />
      <span>Matte · din chefsagent</span>
      <h2>Snyggt! Låt oss skapa<br />din första offert.</h2>
      <p>Ditt upplägg följer med. Välj kund och anpassa jobbet direkt i offertvyn.</p>
    </div>
    <div className="first-quote-paper">
      <div className="first-quote-paper-top"><strong>{companyName}</strong><FileText size={26} aria-hidden="true" /></div>
      <span>VALT UNDERLAG</span><h3>{jobName}</h3><p>{templateName}</p>
      <div className="first-quote-paper-rule" />
      <p className="first-quote-paper-note">Inget skickas innan du har granskat och valt att skicka.</p>
    </div>
    {error && <p className="first-quote-error" role="alert">{error}</p>}
    <button type="button" className="first-quote-open" disabled={working} onClick={() => void open(onContinue)}>
      {working ? <><Loader2 size={20} className="animate-spin" /> Öppnar offertvyn…</> : <>Skapa min första offert <ArrowRight size={20} /></>}
    </button>
    <button type="button" className="first-quote-skip" disabled={working} onClick={() => void open(onSkip)}>Till översikten i stället</button>
    <p className="first-quote-status" role="status">{working ? 'Kontrollerar att allt är sparat innan offertvyn öppnas.' : ''}</p>
  </section>
}
