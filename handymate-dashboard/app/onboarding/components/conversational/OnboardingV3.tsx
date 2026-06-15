'use client'

/* Matte-konversationell onboarding — WIRED orchestrator (increment 6).
   6a: state + persistens-helpers + fas A helt wired (skrapning + kontoskapande).
   6b (nästa): wire fas B–E + betalning + finish. Tills dess renderas B–E som
   de statiska demo-skärmarna (tydligt markerat). */

import { useState } from 'react'
import {
  Matte, User, InlineCard, Panel, PanelGroup, PanelItem, SplitShell, MobileShell, Icon,
} from './parts'
import { PhaseB, PhaseC, PhaseD, PhaseE, type Variant } from './screens'

interface V3Data {
  website: string
  companyName: string
  ort: string
  services: string[]
  tone: string
  orgNumber: string
  address: string
  contactName: string
  email: string
  password: string
  phone: string
  businessId?: string
}

const EMPTY: V3Data = {
  website: '', companyName: '', ort: '', services: [], tone: 'professionell',
  orgNumber: '', address: '', contactName: '', email: '', password: '', phone: '',
}

type ScrapeState = 'idle' | 'loading' | 'done' | 'failed'

export function OnboardingV3({ variant, onEscape }: { variant: Variant; onEscape?: () => void }) {
  const [phase, setPhase] = useState(0)
  const [data, setData] = useState<V3Data>(EMPTY)
  const set = (patch: Partial<V3Data>) => setData(d => ({ ...d, ...patch }))

  if (phase === 0) {
    return <PhaseAWired variant={variant} data={data} set={set} onEscape={onEscape} onDone={() => setPhase(1)} />
  }
  // 6b: byt mot wired B–E. Tills dess statiska demo-skärmar (icke-advancerande).
  if (phase === 1) return <PhaseB variant={variant} onEscape={onEscape} />
  if (phase === 2) return <PhaseC variant={variant} onEscape={onEscape} />
  if (phase === 3) return <PhaseD variant={variant} onEscape={onEscape} />
  return <PhaseE variant={variant} onEscape={onEscape} />
}

/* ---------- Fas A (wired): skrapning + kontoskapande ---------- */
function PhaseAWired({ variant, data, set, onDone, onEscape }: {
  variant: Variant; data: V3Data; set: (p: Partial<V3Data>) => void; onDone: () => void; onEscape?: () => void
}) {
  const [scrape, setScrape] = useState<ScrapeState>('idle')
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function runScrape() {
    if (!data.website.trim()) return
    setScrape('loading')
    try {
      const res = await fetch('/api/onboarding/scrape', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website: data.website }),
      })
      const j = await res.json()
      if (j?.ok) {
        set({
          companyName: j.company_name || data.companyName,
          ort: j.ort || data.ort,
          services: Array.isArray(j.services) ? j.services : [],
          tone: j.tone || data.tone,
        })
        setScrape('done')
      } else {
        setScrape('failed') // graceful: manuell ifyllnad
      }
    } catch {
      setScrape('failed')
    }
  }

  async function createAccount() {
    setErr(null)
    if (!data.companyName.trim() || !data.contactName.trim() || !data.email.trim() || data.password.length < 6) {
      setErr('Fyll i företagsnamn, ditt namn, e-post och lösenord (minst 6 tecken).')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          data: {
            email: data.email, password: data.password,
            businessName: data.companyName, contactName: data.contactName,
            displayName: data.companyName, phone: data.phone || undefined,
            serviceArea: data.ort || undefined, orgNumber: data.orgNumber || undefined,
          },
        }),
      })
      const j = await res.json()
      if (!res.ok || !j?.businessId) {
        setErr(j?.error || 'Kunde inte skapa konto.')
        setCreating(false)
        return
      }
      set({ businessId: j.businessId })
      // 6b: persistera scrape-data (specialties/tone/ort) via PUT /api/onboarding här.
      onDone()
    } catch {
      setErr('Något gick fel. Försök igen.')
      setCreating(false)
    }
  }

  const scraped = scrape === 'done'
  const dialog = (
    <>
      <Matte>Hej! Jag är <strong>Matte</strong> — jag leder teamet som ska sköta kontoret åt dig.</Matte>
      <Matte role={false}>Innan vi drar igång vill jag lära känna ert företag. Har ni en hemsida?</Matte>
      {scrape === 'loading' && <div className="m3-scrape" style={{ marginLeft: 50 }}><span className="m3-spinner" /> Läser er sajt…</div>}
      {scraped && <div className="m3-scrape" style={{ marginLeft: 50 }}><Icon name="check" size={16} /> Jag läste er sajt — fyll på org-nummer så har jag det formella.</div>}
      {scrape === 'failed' && <Matte role={false}>Jag kunde inte läsa sajten just nu — fyll i uppgifterna nedan så går vi vidare.</Matte>}
      {err && <div className="m3-scrape" style={{ marginLeft: 50, background: '#FFF1F2', borderColor: '#FECDD3', color: '#BE123C' }}><Icon name="x" size={16} /> {err}</div>}
    </>
  )
  const dock = (
    <InlineCard accent>
      {!scraped && scrape !== 'failed' && (
        <>
          <div className="m3-inline-label"><Icon name="home" size={13} /> Er hemsida</div>
          <div className="m3-urlrow">
            <input className="m3-input2" placeholder="t.ex. bergstrombygg.se" value={data.website}
              onChange={e => set({ website: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') runScrape() }} />
            <button className="m3-go" onClick={runScrape} disabled={scrape === 'loading' || !data.website.trim()}>
              {scrape === 'loading' ? 'Läser…' : <>Läs sajten <Icon name="arrowRight" size={15} /></>}
            </button>
          </div>
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <button className="m3-go ghost" onClick={() => setScrape('failed')}>Hoppa över — fyll i manuellt</button>
          </div>
        </>
      )}
      {(scraped || scrape === 'failed') && (
        <>
          <div className="m3-inline-label"><Icon name="fileText" size={13} /> Företag & konto</div>
          <div className="m3-field2">
            <input className="m3-input2" placeholder="Företagsnamn" value={data.companyName} onChange={e => set({ companyName: e.target.value })} />
            <div className="m3-fieldrow">
              <input className="m3-input2" placeholder="Org-nummer" value={data.orgNumber} onChange={e => set({ orgNumber: e.target.value })} />
              <input className="m3-input2" placeholder="Ort" value={data.ort} onChange={e => set({ ort: e.target.value })} />
            </div>
            <input className="m3-input2" placeholder="Ditt namn" value={data.contactName} onChange={e => set({ contactName: e.target.value })} />
            <div className="m3-fieldrow">
              <input className="m3-input2" type="email" placeholder="E-post" value={data.email} onChange={e => set({ email: e.target.value })} />
              <input className="m3-input2" type="password" placeholder="Lösenord" value={data.password} onChange={e => set({ password: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="m3-go" onClick={createAccount} disabled={creating}>
              {creating ? 'Skapar konto…' : <>Skapa konto & fortsätt <Icon name="arrowRight" size={15} /></>}
            </button>
          </div>
        </>
      )}
    </InlineCard>
  )
  const panelBody = (
    <PanelGroup label="Företaget" icon="home">
      <PanelItem icon="home" k="Företagsnamn" v={data.companyName || '—'} state={scraped && data.companyName ? 'interp' : 'future'} tag={scraped && data.companyName ? 'Tolkat' : 'Väntar'} />
      <PanelItem icon="mapPin" k="Ort" v={data.ort || '—'} state={scraped && data.ort ? 'interp' : 'future'} tag={scraped && data.ort ? 'Tolkat' : 'Väntar'} />
      <PanelItem icon="fileText" k="Org-nummer" v={data.orgNumber || '—'} state={data.orgNumber ? 'confirmed' : 'future'} tag={data.orgNumber ? 'Bekräftat' : 'Väntar'} />
    </PanelGroup>
  )
  const pct = scraped ? 18 : 6
  return variant === 'mobile'
    ? <MobileShell active={0} dialog={dialog} dock={dock} panelSummary={data.companyName || 'Berätta om ert företag'} panelDrawer={panelBody} panelOpen={scraped} onEscape={onEscape} />
    : <SplitShell active={0} dialog={dialog} dock={dock} panel={<Panel pct={pct}>{panelBody}</Panel>} onEscape={onEscape} />
}
