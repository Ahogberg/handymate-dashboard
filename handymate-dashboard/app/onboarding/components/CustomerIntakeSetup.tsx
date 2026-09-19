'use client'

import { useEffect, useState } from 'react'
import { ContactProofGuide } from '@/components/onboarding/ContactProofGuide'
import { MailConnections } from '@/components/onboarding/MailConnections'
import { ContactReadiness } from '@/components/onboarding/ContactReadiness'
import type { OnboardingFormData } from '../types-redesign'
import { CUSTOMER_INTAKE_CHANNELS, intakeNextStep, selectedIntakeChannels, toggleIntakeChannel, type CustomerMailProvider } from '@/lib/onboarding/customer-intake'
import { isDemoBusinessId } from '@/lib/demo/is-demo-client'

type RouteState = { address: string | null; active: boolean; last_received_at: string | null }
export function CustomerIntakeSetup({ data, setData }: {
  data: OnboardingFormData; setData: (updater: (d: OnboardingFormData) => OnboardingFormData) => void
}) {
  const [route, setRoute] = useState<RouteState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selected = selectedIntakeChannels(data)
  const email = selected.includes('email')
  const [refresh, setRefresh] = useState(0)
  const demo = isDemoBusinessId(data.businessId || '')
  useEffect(() => {
    if (!email || demo) return
    let active = true
    setBusy(true); setError('')
    fetch('/api/integrations/email-lead', { cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() })
      .then(result => { if (active) setRoute(result) })
      .catch(() => { if (active) setError('Kunde inte läsa e-postkopplingen. Du kan fortsätta och ordna den i Inställningar senare.') })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [email, demo, refresh])
  async function activate() {
    if (busy || demo) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/integrations/email-lead', { method: 'POST' })
      const result = await response.json()
      if (!response.ok || !result.address) throw new Error(result.message || result.error || 'Mottagaradressen kunde inte skapas.')
      // Provisioning is not evidence that a message was received.
      setRoute({ address: result.address, active: result.active === true, last_received_at: null })
    } catch (error) { setError(error instanceof Error ? error.message : 'Kunde inte skapa mottagaradressen.') }
    finally { setBusy(false) }
  }
  return <section style={{ marginBottom: 24 }} aria-label="Företagets kontaktvägar">
    <h2 className="ob-label">Hur kontaktar era kunder er?</h2>
    <p>Välj alla kontaktvägar ni använder. Börja med den viktigaste och ordna resten i er egen takt.</p>
    <div className="ob-chip-grid">{CUSTOMER_INTAKE_CHANNELS.map(channel => <button type="button" key={channel.id}
      className={`ob-chip ${selected.includes(channel.id) ? 'selected' : ''}`}
      aria-pressed={selected.includes(channel.id)} disabled={busy}
      onClick={() => setData(d => ({ ...d, ...toggleIntakeChannel(d, channel.id) }))}>{channel.label}</button>)}</div>
    {selected.length > 1 && <label>Vilken vill ni börja med?
      <select aria-label="Viktigaste kontaktvägen" value={data.primaryLeadChannel || selected[0]} onChange={e => setData(d => ({ ...d, primaryLeadChannel: e.target.value as OnboardingFormData['primaryLeadChannel'] }))}>
        {CUSTOMER_INTAKE_CHANNELS.filter(c => selected.includes(c.id)).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
    </label>}
    <p style={{ fontSize: 13, color: 'var(--ob-muted)' }}>{intakeNextStep(data.primaryLeadChannel)}</p>
    {email && <><MailConnections returnTo="onboarding" demo={demo} /><div className="job-setup-note">
      <label htmlFor="intake-mail-provider">Vilken e-post använder ni?</label>
      <select id="intake-mail-provider" value={data.customerMailProvider || ''} onChange={e => setData(d => ({ ...d, customerMailProvider: (e.target.value || undefined) as CustomerMailProvider | undefined }))}>
        <option value="">Välj eller gör senare</option><option value="gmail">Gmail / Google Workspace</option>
        <option value="microsoft">Microsoft 365 / Outlook</option><option value="other">Annan e-post</option>
      </select>
      <div className="ob-chip-grid" style={{ marginTop: 12 }}>
        <button type="button" className={`ob-chip ${data.customerMailProvider === 'gmail' ? 'selected' : ''}`} aria-pressed={data.customerMailProvider === 'gmail'} onClick={() => setData(d => ({ ...d, customerMailProvider: 'gmail' }))}>Använd Gmail / Google Workspace</button>
        <button type="button" className={`ob-chip ${data.customerMailProvider === 'microsoft' ? 'selected' : ''}`} aria-pressed={data.customerMailProvider === 'microsoft'} onClick={() => setData(d => ({ ...d, customerMailProvider: 'microsoft' }))}>Använd Outlook / Microsoft 365</button>
      </div>
      <p>Direktkoppling av Gmail och Outlook förbereds. Du kan använda vidarebefordran när mottagaradressen är klar och provad. Kalenderkoppling är separat.</p>
      {data.customerMailProvider && <div>
        <p><strong>Vidarebefordran:</strong> nya mejl som ni skickar vidare kan tas emot i Handymate. Gamla mejl importeras inte, och detta ger inte Handymate rätt att skicka från er adress.</p>
        <p>Börja gärna med ett manuellt vidarebefordrat provmejl. Automatisk vidarebefordran kan kräva ett verifieringsmejl eller administratörsgodkännande; den är inte klar förrän ett prov från kundens väg har nått fram.</p>
        <p>För en gemensam info-adress: konfigurera vidarebefordran för just den brevlådan. Det kan kräva hjälp av er administratör. Prova från en extern adress till den adress era kunder använder.</p>
        {data.customerMailProvider === 'gmail' && <a href="https://support.google.com/mail/answer/10957?hl=sv" target="_blank" rel="noopener noreferrer">Visa Googles instruktioner för vidarebefordran</a>}
        {data.customerMailProvider === 'microsoft' && <a href="https://support.microsoft.com/outlook" target="_blank" rel="noopener noreferrer">Öppna Outlooks hjälp och sök efter vidarebefordran</a>}
      </div>}
      {demo ? <p>Ingen riktig e-postkoppling skapas i demon.</p> : <>
        {busy && <p role="status">Kontrollerar mottagaradressen…</p>}
        {route?.address ? <>
          <p>Mottagaradress: <strong style={{ overflowWrap: 'anywhere' }}>{route.address}</strong></p>
          <p>{route.active ? 'Ställ in vidarebefordran hos din e-postleverantör och skicka sedan ett provmejl.' : 'Adressen är inte bekräftad som aktiv. Kontrollera kopplingen i Inställningar innan du börjar vidarebefordra.'}</p>
          <button type="button" className="ob-chip" disabled={busy} onClick={() => setRefresh(n => n + 1)}>Kontrollera mottagningen igen</button>
          {route.active && route.last_received_at && <p>Ett mejl har tidigare tagits emot. Kundmatchning och svar behöver kontrolleras separat.</p>}
        </> : <button type="button" className="ob-chip" disabled={busy} onClick={() => void activate()}>Skapa mottagaradress för vidarebefordran</button>}
        {error && <p role="alert">{error}</p>}
      </>}
    </div></>}
    {selected.includes('website') && <div className="job-setup-note"><strong>Fånga förfrågningar från hemsidan</strong><p>Använder ni redan ett formulär? Vidarebefordra dess mejl till Handymate-adressen. Med Handymates widget kan kunden lämna sin förfrågan direkt.</p><p>Skicka sedan en provförfrågan från er publicerade hemsida. Kontrollera kontaktuppgifterna, kundärendet och vem som tar nästa steg.</p><a href="/dashboard/settings/integrations" target="_blank" rel="noopener noreferrer">Öppna inställningarna för hemsidan i ny flik</a></div>}
    {selected.includes('sms') && <div className="job-setup-note"><strong>SMS behöver en egen kontroll</strong><p>{intakeNextStep('sms')} SMS till ert gamla mobilnummer stannar hos er operatör.</p></div>}
    {selected.length > 0 && <><ContactReadiness selected={selected} demo={demo} /><ContactProofGuide demo={demo} /></>}
    {!data.primaryLeadChannel && <p style={{ fontSize: 12 }}>Frivilligt — du kan fortsätta och välja kanal senare.</p>}
  </section>
}
