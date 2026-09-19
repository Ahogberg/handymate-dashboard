'use client'

import { useEffect, useState } from 'react'
import { CUSTOMER_INTAKE_CHANNELS, selectedIntakeChannels, type CustomerIntakeChannel } from '@/lib/onboarding/customer-intake'
import type { ChannelHealth } from '@/lib/onboarding/channel-health'

type Snapshot = { channels: ChannelHealth[]; selected_channels?: CustomerIntakeChannel[] }

/** Evidence is read from the server. Checking a box never manufactures proof. */
export function ContactReadiness({ selected, demo = false }: { selected?: CustomerIntakeChannel[]; demo?: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [draft, setDraft] = useState<CustomerIntakeChannel[] | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (!attempt || demo) return
    const controller = new AbortController()
    setBusy(true); setError(''); setSnapshot(null)
    fetch('/api/onboarding/channel-health', { cache: 'no-store', signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error(); return r.json() })
      .then(result => { if (!Array.isArray(result.channels)) throw new Error(); if (!controller.signal.aborted) setSnapshot(result) })
      .catch(() => { if (!controller.signal.aborted) setError('Kunde inte kontrollera kontaktvägarna. Prova igen — statusen är okänd tills kontrollen lyckas.') })
      .finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [attempt, demo])
  const channels = selected ?? draft ?? selectedIntakeChannels({ customerIntakeChannels: snapshot?.selected_channels ?? [] })
  async function saveChannels() {
    if (busy || demo || !draft) return
    setBusy(true); setError(''); setSaved(false)
    try {
      const r = await fetch('/api/onboarding', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { customerIntakeChannels: draft, primaryLeadChannel: draft[0] ?? null } }) })
      if (!r.ok) throw new Error()
      setSaved(true)
    } catch { setError('Kontaktvägarna kunde inte sparas. Dina val finns kvar här — försök igen.') }
    finally { setBusy(false) }
  }
  return <section aria-label="Prova era kontaktvägar" className="rounded-2xl border border-slate-200 p-5 space-y-3">
    <h3 className="font-semibold">Prova kundens väg in</h3>
    <p className="text-sm">Börja med er viktigaste kontaktväg. Skicka en tydligt märkt provförfrågan från en annan telefon eller mejladress och följ den till kundärendet.</p>
    <ol className="list-decimal pl-5 text-sm space-y-1">
      <li>Använd numret, mejladressen eller formuläret som era kunder använder.</li>
      <li>Öppna förfrågan i Handymate och kontrollera kundens kontaktuppgifter.</li>
      <li>Kontrollera ansvarig person och nästa steg. Granska eventuella svarsförslag före sändning.</li>
    </ol>
    <button type="button" className="rounded-lg border px-3 py-2 text-sm font-medium" disabled={busy || demo} onClick={() => setAttempt(n => n + 1)}>{busy ? 'Kontrollerar…' : 'Kontrollera kontaktvägarna'}</button>
    {selected === undefined && snapshot && <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Era kontaktvägar — välj den viktigaste först</legend>
      <div className="flex flex-wrap gap-2">{CUSTOMER_INTAKE_CHANNELS.map(c => <button key={c.id} type="button" disabled={busy} aria-pressed={channels.includes(c.id)} className={`rounded-lg border px-3 py-2 text-sm ${channels.includes(c.id) ? 'border-teal-600 bg-teal-50 text-teal-900' : ''}`} onClick={() => { setSaved(false); setDraft(channels.includes(c.id) ? channels.filter(id => id !== c.id) : [...channels, c.id]) }}>{c.label}</button>)}</div>
      {draft && <button type="button" disabled={busy} className="rounded-lg border px-3 py-2 text-sm" onClick={() => void saveChannels()}>Spara kontaktvägar</button>}
      {saved && <p role="status" className="text-sm">Kontaktvägarna är sparade.</p>}
    </fieldset>}
    {demo && <p className="text-sm">Demon verifierar inga riktiga kontaktvägar.</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <div aria-live="polite" className="space-y-3">
      {snapshot && !channels.length && <p>Inga kontaktvägar valda ännu. Välj de vägar era kunder använder i onboardingen.</p>}
      {channels.map(id => {
        const evidence = snapshot?.channels.find(c => c.channel === (id === 'website' ? 'web' : id))
        const label = CUSTOMER_INTAKE_CHANNELS.find(c => c.id === id)!.label
        return <div key={id} className="border-t pt-3 text-sm">
          <strong>{label}</strong>
          <p>{id === 'sms' ? 'SMS måste provas separat. Automatiskt mottagningsbevis visas inte här ännu.' : id === 'other' ? 'Identifiera hur förfrågan kommer fram och välj en kontaktväg.' : evidence ? evidence.label : 'Inte kontrollerad i den här vyn ännu.'}</p>
          {evidence && <p>{evidence.detail} {evidence.next_action}</p>}
          {evidence?.evidence_at && <p>Senaste registrerade bevis: {new Date(evidence.evidence_at).toLocaleString('sv-SE')}. Det kan gälla ett tidigare prov.</p>}
          {id === 'phone' && <p>Provsamtal direkt till Handymate-numret bevisar inte vidarekopplingen av ert befintliga nummer.</p>}
        </div>
      })}
    </div>
    <a className="inline-block text-sm underline" href="/dashboard/inbox" target="_blank" rel="noopener noreferrer">Öppna inkorgen i ny flik och följ provförfrågan</a>
    <p className="text-xs">En anslutning eller ett äldre kanalbevis betyder inte att alla era kontaktvägar fungerar. Ni kan fortsätta och slutföra återstående kontroller senare.</p>
  </section>
}
