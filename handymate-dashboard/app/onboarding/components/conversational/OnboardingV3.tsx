'use client'

/* Matte-konversationell onboarding — WIRED orchestrator (increment 6).
   6a: fas A (skrapning + konto).  6b-i: fas B/C + persistering.
   Kvar (6b-ii..iv): fas D (import/kalender/telefon), Stripe-betalning, fas E finish.
   D/E renderas tills vidare som statiska demo-skärmar. */

import { useState } from 'react'
import {
  Matte, InlineCard, Panel, PanelGroup, PanelItem, SplitShell, MobileShell, Icon,
} from './parts'
import { PhaseD, PhaseE, type Variant } from './screens'

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
  // fas C
  workStart: string
  workEnd: string
  priceMin: string
  priceMax: string
  rot: boolean
}

const EMPTY: V3Data = {
  website: '', companyName: '', ort: '', services: [], tone: 'professionell',
  orgNumber: '', address: '', contactName: '', email: '', password: '', phone: '',
  workStart: '07:00', workEnd: '16:00', priceMin: '650', priceMax: '850', rot: true,
}

type ScrapeState = 'idle' | 'loading' | 'done' | 'failed'

const TONE_LABEL: Record<string, string> = { personlig: 'Personlig', professionell: 'Professionell', rak: 'Rak & tydlig' }

function buildWorkingHours(start: string, end: string) {
  const wd = { active: true, start, end }
  const we = { active: false, start: '09:00', end: '14:00' }
  return { monday: wd, tuesday: wd, wednesday: wd, thursday: wd, friday: wd, saturday: we, sunday: we }
}

export function OnboardingV3({ variant, onEscape }: { variant: Variant; onEscape?: () => void }) {
  const [phase, setPhase] = useState(0)
  const [data, setData] = useState<V3Data>(EMPTY)
  const set = (patch: Partial<V3Data>) => setData(d => ({ ...d, ...patch }))

  // Persistera till business_config via /api/onboarding PUT (kräver konto/businessId).
  async function save(step: number, config: Record<string, unknown>, extra?: Record<string, unknown>) {
    if (!data.businessId) return
    try {
      await fetch('/api/onboarding', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step, config, data: extra || {} }),
      })
    } catch { /* tyst — resume täcker */ }
  }

  if (phase === 0) {
    return <PhaseAWired variant={variant} data={data} set={set} onEscape={onEscape} onDone={() => setPhase(1)} />
  }
  if (phase === 1) {
    return <PhaseBWired variant={variant} data={data} set={set} onEscape={onEscape}
      onNext={async (services, tone) => { await save(2, { specialties: services }, { tone }); setPhase(2) }} />
  }
  if (phase === 2) {
    return <PhaseCWired variant={variant} data={data} set={set} onEscape={onEscape}
      onNext={async (d) => {
        const mid = Math.round((Number(d.priceMin || 0) + Number(d.priceMax || 0)) / 2)
        await save(3, {
          working_hours: buildWorkingHours(d.workStart, d.workEnd),
          hourly_rate_min: Number(d.priceMin) || null,
          hourly_rate_max: Number(d.priceMax) || null,
          default_hourly_rate: mid || null,
        }, { rot: d.rot })
        setPhase(3)
      }} />
  }
  // 6b-ii..iv: byt mot wired D / betalning / E.
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
        setScrape('failed')
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

/* ---------- Fas B (wired): tjänster + ton ---------- */
function PhaseBWired({ variant, data, set, onNext, onEscape }: {
  variant: Variant; data: V3Data; set: (p: Partial<V3Data>) => void
  onNext: (services: string[], tone: string) => void; onEscape?: () => void
}) {
  const [confirmed, setConfirmed] = useState(false)
  const [adding, setAdding] = useState('')
  const services = data.services
  const removeService = (s: string) => set({ services: services.filter(x => x !== s) })
  const addService = () => { const v = adding.trim(); if (v && !services.includes(v)) { set({ services: [...services, v] }); setAdding('') } }
  const fromScrape = services.length > 0 && !confirmed

  const dialog = (
    <>
      <Matte>Jag läste er sajt. Det ser ut som att ni gör {services.length ? <strong>{services.join(', ').toLowerCase()}</strong> : 'olika hantverk'} — och tonen är {TONE_LABEL[data.tone]?.toLowerCase() || 'professionell'}.</Matte>
      <Matte role={false}>Stämmer det? Justera gärna chipsen så blir teamet vassare från start.</Matte>
      {confirmed && <Matte role={false}>Perfekt, då vet jag. <strong>Bekräftat ✓</strong></Matte>}
    </>
  )
  const dock = (
    <InlineCard accent>
      <div className="m3-inline-label"><Icon name="wrench" size={13} /> Era tjänster {fromScrape && <span style={{ color: 'var(--amber-600)', fontWeight: 700 }}>· tolkat från sajten</span>}</div>
      <div className="m3-chips" style={{ marginBottom: 10 }}>
        {services.map(s => (
          <span key={s} className={`m3-chip ${confirmed ? '' : 'interp'}`}>
            {s}<span className="m3-chip-x" onClick={() => removeService(s)}><Icon name="x" size={10} /></span>
          </span>
        ))}
      </div>
      <div className="m3-urlrow" style={{ marginBottom: 12 }}>
        <input className="m3-input2" placeholder="Lägg till tjänst…" value={adding}
          onChange={e => setAdding(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addService() }} />
        <button className="m3-go ghost" onClick={addService} disabled={!adding.trim()}><Icon name="plus" size={14} /></button>
      </div>
      <div className="m3-inline-label"><Icon name="messageCircle" size={13} /> Ton mot kund</div>
      <div className="m3-seg" style={{ marginBottom: 12 }}>
        {(['personlig', 'professionell', 'rak'] as const).map(k => (
          <button key={k} className={data.tone === k ? 'on' : ''} onClick={() => set({ tone: k })}>{TONE_LABEL[k]}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {!confirmed
          ? <button className="m3-go" onClick={() => setConfirmed(true)} disabled={services.length === 0}><Icon name="check" size={15} /> Ja, det stämmer</button>
          : <button className="m3-go" onClick={() => onNext(services, data.tone)}>Fortsätt <Icon name="arrowRight" size={15} /></button>}
      </div>
    </InlineCard>
  )
  const panelBody = (
    <>
      <PanelGroup label="Företaget" icon="home">
        <PanelItem icon="home" v={`${data.companyName || '—'}${data.ort ? ' · ' + data.ort : ''}`} state="confirmed" tag="Bekräftat" />
      </PanelGroup>
      <PanelGroup label="Vad ni gör" icon="wrench">
        <PanelItem icon="wrench" k="Tjänster" v={services.length ? services.join(' · ') : '—'} state={confirmed ? 'confirmed' : 'interp'} tag={confirmed ? 'Bekräftat' : 'Tolkat'} />
        <PanelItem icon="messageCircle" k="Ton mot kund" v={TONE_LABEL[data.tone] || '—'} state={confirmed ? 'confirmed' : 'interp'} tag={confirmed ? 'Bekräftat' : 'Tolkat'} />
      </PanelGroup>
    </>
  )
  return variant === 'mobile'
    ? <MobileShell active={1} dialog={dialog} dock={dock} panelSummary={`${services.length} tjänster · ${confirmed ? 'bekräftat' : 'tolkat'}`} panelDrawer={panelBody} panelOpen onEscape={onEscape} />
    : <SplitShell active={1} dialog={dialog} dock={dock} panel={<Panel pct={confirmed ? 50 : 42}>{panelBody}</Panel>} onEscape={onEscape} />
}

/* ---------- Fas C (wired): tider + pris + ROT ---------- */
function PhaseCWired({ variant, data, set, onNext, onEscape }: {
  variant: Variant; data: V3Data; set: (p: Partial<V3Data>) => void
  onNext: (d: V3Data) => void; onEscape?: () => void
}) {
  const dialog = (
    <>
      <Matte>Bra — då vet teamet vad ni gör. Nu det praktiska: <strong>när jobbar ni</strong>, och <strong>hur tar ni betalt</strong>?</Matte>
      <Matte role={false}>Det här använder Lisa när hon bokar tider och Daniel när han räknar offert.</Matte>
    </>
  )
  const dock = (
    <InlineCard accent>
      <div className="m3-inline-label"><Icon name="clock" size={13} /> Arbetstider (mån–fre)</div>
      <div className="m3-fieldrow" style={{ marginBottom: 12 }}>
        <input className="m3-input2" value={data.workStart} onChange={e => set({ workStart: e.target.value })} placeholder="07:00" />
        <input className="m3-input2" value={data.workEnd} onChange={e => set({ workEnd: e.target.value })} placeholder="16:00" />
      </div>
      <div className="m3-inline-label"><Icon name="dollarSign" size={13} /> Timpris (kr, exkl. moms)</div>
      <div className="m3-fieldrow" style={{ marginBottom: 12 }}>
        <input className="m3-input2" value={data.priceMin} onChange={e => set({ priceMin: e.target.value })} placeholder="650" />
        <input className="m3-input2" value={data.priceMax} onChange={e => set({ priceMax: e.target.value })} placeholder="850" />
      </div>
      <div className="m3-toggle" onClick={() => set({ rot: !data.rot })} style={{ cursor: 'pointer' }}>
        <div>
          <div className="m3-tool-title" style={{ fontSize: 14 }}>ROT-avdrag som standard</div>
          <div className="m3-tool-sub">Dras automatiskt på privatkunders offerter</div>
        </div>
        <div className={`ob-switch ${data.rot ? 'on' : ''}`} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="m3-go" onClick={() => onNext(data)}>Fortsätt <Icon name="arrowRight" size={15} /></button>
      </div>
    </InlineCard>
  )
  const panelBody = (
    <>
      <PanelGroup label="Företaget" icon="home">
        <PanelItem icon="home" v={`${data.companyName || '—'}${data.ort ? ' · ' + data.ort : ''}`} state="confirmed" tag="Bekräftat" />
        <PanelItem icon="wrench" k="Tjänster" v={data.services.join(' · ') || '—'} state="confirmed" tag="Bekräftat" />
      </PanelGroup>
      <PanelGroup label="Hur ni jobbar" icon="clock">
        <PanelItem icon="clock" k="Arbetstider" v={`Mån–Fre · ${data.workStart}–${data.workEnd}`} state="confirmed" tag="Bekräftat" />
        <PanelItem icon="dollarSign" k="Timpris" v={`${data.priceMin}–${data.priceMax} kr/h`} state="confirmed" tag="Bekräftat" />
        <PanelItem icon="shield" k="ROT-avdrag" v={data.rot ? 'Automatiskt på privatkunder' : 'Av'} state="confirmed" tag="Bekräftat" />
      </PanelGroup>
    </>
  )
  return variant === 'mobile'
    ? <MobileShell active={2} dialog={dialog} dock={dock} panelSummary="Tider & pris" panelDrawer={panelBody} panelOpen onEscape={onEscape} />
    : <SplitShell active={2} dialog={dialog} dock={dock} panel={<Panel pct={68}>{panelBody}</Panel>} onEscape={onEscape} />
}
