'use client'

import { useEffect, useState } from 'react'
import type { OnboardingFormData } from '../types-redesign'
import { CUSTOMER_INTAKE_CHANNELS, intakeNextStep, type CustomerMailProvider } from '@/lib/onboarding/customer-intake'
import { isDemoBusinessId } from '@/lib/demo/is-demo-client'

type RouteState = { address: string | null; active: boolean; last_received_at: string | null }
export function CustomerIntakeSetup({ data, setData }: {
  data: OnboardingFormData; setData: (updater: (d: OnboardingFormData) => OnboardingFormData) => void
}) {
  const [route, setRoute] = useState<RouteState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const email = data.primaryLeadChannel === 'email'
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
  }, [email, demo])
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
  return <section style={{ marginBottom: 24 }} aria-label="Viktigaste kundkanalen">
    <h2 className="ob-label">Var kommer flest nya kundförfrågningar in?</h2>
    <div className="ob-chip-grid">{CUSTOMER_INTAKE_CHANNELS.map(channel => <button type="button" key={channel.id}
      className={`ob-chip ${data.primaryLeadChannel === channel.id ? 'selected' : ''}`}
      aria-pressed={data.primaryLeadChannel === channel.id} disabled={busy}
      onClick={() => setData(d => ({ ...d, primaryLeadChannel: channel.id }))}>{channel.label}</button>)}</div>
    <p style={{ fontSize: 13, color: 'var(--ob-muted)' }}>{intakeNextStep(data.primaryLeadChannel)}</p>
    {email && <div className="job-setup-note">
      <label htmlFor="intake-mail-provider">Vilken e-post använder ni?</label>
      <select id="intake-mail-provider" value={data.customerMailProvider || ''} onChange={e => setData(d => ({ ...d, customerMailProvider: (e.target.value || undefined) as CustomerMailProvider | undefined }))}>
        <option value="">Välj eller gör senare</option><option value="gmail">Gmail / Google Workspace</option>
        <option value="microsoft">Microsoft 365 / Outlook</option><option value="other">Annan e-post</option>
      </select>
      <p>Direktkoppling av Gmail och Outlook förbereds. Du kan använda vidarebefordran när mottagaradressen är klar och provad. Kalenderkoppling är separat.</p>
      {demo ? <p>Ingen riktig e-postkoppling skapas i demon.</p> : <>
        {busy && <p role="status">Kontrollerar mottagaradressen…</p>}
        {route?.address ? <>
          <p>Mottagaradress: <strong style={{ overflowWrap: 'anywhere' }}>{route.address}</strong></p>
          <p>{route.active ? 'Ställ in vidarebefordran hos din e-postleverantör och skicka sedan ett provmejl.' : 'Adressen är inte bekräftad som aktiv. Kontrollera kopplingen i Inställningar innan du börjar vidarebefordra.'}</p>
          {route.active && route.last_received_at && <p>Ett mejl har tidigare tagits emot. Kundmatchning och svar behöver kontrolleras separat.</p>}
        </> : <button type="button" className="ob-chip" disabled={busy} onClick={() => void activate()}>Skapa mottagaradress för vidarebefordran</button>}
        {error && <p role="alert">{error}</p>}
      </>}
    </div>}
    {!data.primaryLeadChannel && <p style={{ fontSize: 12 }}>Frivilligt — du kan fortsätta och välja kanal senare.</p>}
  </section>
}
