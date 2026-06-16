'use client'

/* Matte-konversationell onboarding — WIRED orchestrator (increment 6).
   6a: fas A (skrapning + konto).  6b-i: fas B/C + persistering.
   Kvar (6b-ii..iv): fas D (import/kalender/telefon), Stripe-betalning, fas E finish.
   D/E renderas tills vidare som statiska demo-skärmar. */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import {
  Matte, InlineCard, Panel, PanelGroup, PanelItem, SplitShell, MobileShell, Icon,
} from './parts'
import { getAgentById } from '@/lib/agents/team'
import { type Variant } from './screens'
import { supabase } from '@/lib/supabase'
import { parseCSV, autoMapColumns, prepareRows, importCustomers } from '@/lib/customers/import-core'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
const PLANS = [
  {
    id: 'starter', name: 'Bas', price: 2495, popular: false, tagline: 'För enmansföretagaren',
    features: ['Lisa svarar i telefonen åt dig', 'Karin bevakar och påminner om fakturor', 'Upp till 50 samtal/mån'],
  },
  {
    id: 'professional', name: 'Pro', price: 5995, popular: true, tagline: 'Mest populär',
    features: ['Hela sälj- & kundteamet (Lisa, Karin, Daniel, Hanna)', 'Obegränsade samtal', 'Offert-uppföljning + SMS-kampanjer'],
  },
  {
    id: 'business', name: 'Business', price: 11995, popular: false, tagline: 'För växande team',
    features: ['Allt i Pro', 'Lars – projektledning & marginalkoll', 'Matte – chefsassistent som koordinerar', 'Egen onboarding-coach'],
  },
] as const

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
  // fas D
  importedCount: number
  calendarConnected: boolean
  phoneMode: 'forward' | 'primary'
}

const EMPTY: V3Data = {
  website: '', companyName: '', ort: '', services: [], tone: 'professionell',
  orgNumber: '', address: '', contactName: '', email: '', password: '', phone: '',
  workStart: '07:00', workEnd: '16:00', priceMin: '650', priceMax: '850', rot: true,
  importedCount: 0, calendarConnected: false, phoneMode: 'forward',
}

type ScrapeState = 'idle' | 'loading' | 'done' | 'failed'

const TONE_LABEL: Record<string, string> = { personlig: 'Personlig', professionell: 'Professionell', rak: 'Rak & tydlig' }

function buildWorkingHours(start: string, end: string) {
  const wd = { active: true, start, end }
  const we = { active: false, start: '09:00', end: '14:00' }
  return { monday: wd, tuesday: wd, wednesday: wd, thursday: wd, friday: wd, saturday: we, sunday: we }
}

export function OnboardingV3({ variant, onEscape }: { variant: Variant; onEscape?: () => void }) {
  const router = useRouter()
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

  // Slutför: onboarding_step=10 + completed_at + seedAllDefaults, sen dashboard.
  async function finish() {
    if (data.businessId) {
      try {
        await fetch('/api/onboarding', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rot_enabled: data.rot }),
        })
      } catch { /* icke-blockerande */ }
    }
    router.push('/dashboard')
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
  if (phase === 3) {
    return <PhaseDWired variant={variant} data={data} set={set} onEscape={onEscape}
      onConnectCalendar={async () => {
        // Persistera progress innan full-page-redirect (resume i increment 7).
        await save(4, {})
        window.location.href = '/api/google/connect?source=onboarding'
      }}
      onNext={async () => {
        // Numret provisioneras vid betalning/confirm; här sparas bara valet.
        await save(4, { phone_setup_type: data.phoneMode === 'forward' ? 'keep_existing' : 'new_number' })
        setPhase(4)
      }} />
  }
  if (phase === 4) {
    return <PhasePayment variant={variant} data={data} onEscape={onEscape}
      onDone={async () => { await save(5, {}); setPhase(5) }} />
  }
  return <PhaseEWired variant={variant} data={data} onFinish={finish} onEscape={onEscape} />
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
            // TODO: fånga riktig bransch (fråga i A, eller mappa från scrapade
            // tjänster) — 'other' ger generisk kunskapsbas + generiska defaults.
            branch: 'other',
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

/* ---------- Fas D (wired): import + kalender + telefon ---------- */
function PhaseDWired({ variant, data, set, onConnectCalendar, onNext, onEscape }: {
  variant: Variant; data: V3Data; set: (p: Partial<V3Data>) => void
  onConnectCalendar: () => void; onNext: () => void; onEscape?: () => void
}) {
  const [importing, setImporting] = useState(false)
  const [importErr, setImportErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!data.businessId) return
    setImporting(true); setImportErr(null)
    try {
      const text = await file.text()
      const { headers, rows } = parseCSV(text)
      const mapping = autoMapColumns(headers)
      if (mapping.phone_number === null) { setImportErr('Hittade ingen telefonkolumn i filen.'); setImporting(false); return }
      const prepared = prepareRows(rows, mapping)
      const result = await importCustomers(supabase, data.businessId, prepared, { skipDuplicates: false })
      set({ importedCount: result.success })
    } catch {
      setImportErr('Kunde inte läsa filen.')
    }
    setImporting(false)
  }

  const csvDone = data.importedCount > 0
  const dialog = (
    <>
      <Matte>Nu kopplar vi era verktyg så teamet kan börja jobba på riktigt — inte bara öva.</Matte>
      <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Import */}
        <div className={`m3-tool ${csvDone ? 'done' : ''}`}>
          <div className="m3-tool-ic" style={{ background: csvDone ? 'var(--primary-50)' : '#DBEAFE', color: csvDone ? 'var(--primary-700)' : 'var(--blue-600)' }}><Icon name="users" size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="m3-tool-title">Importera kunder</div>
            <div className="m3-tool-sub">{csvDone ? `${data.importedCount} kunder importerade` : importing ? 'Importerar…' : 'Ladda upp en CSV — Karin tar hand om resten'}</div>
          </div>
          {csvDone ? <span className="m3-tool-ok"><Icon name="check" size={15} /> Klart</span>
            : <button className="m3-tool-btn primary" onClick={() => fileRef.current?.click()} disabled={importing}>{importing ? 'Importerar…' : 'Välj fil'}</button>}
        </div>
        {importErr && <div className="m3-scrape" style={{ background: '#FFF1F2', borderColor: '#FECDD3', color: '#BE123C' }}><Icon name="x" size={16} /> {importErr}</div>}

        {/* Kalender */}
        <div className={`m3-tool ${data.calendarConnected ? 'done' : ''}`}>
          <div className="m3-tool-ic" style={{ background: data.calendarConnected ? 'var(--primary-50)' : '#D1FAE5', color: data.calendarConnected ? 'var(--primary-700)' : 'var(--emerald-600)' }}><Icon name="calendar" size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="m3-tool-title">Koppla Google Calendar</div>
            <div className="m3-tool-sub">{data.calendarConnected ? 'Lisa kan nu boka riktiga tider' : 'Låter Lisa boka in jobb utan dubbelbokning'}</div>
          </div>
          {data.calendarConnected ? <span className="m3-tool-ok"><Icon name="check" size={15} /> Kopplad</span>
            : <button className="m3-tool-btn oauth" onClick={onConnectCalendar}><Icon name="calendar" size={14} /> Anslut</button>}
        </div>

        {/* Telefon-val */}
        <div className="m3-tool" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <div className="m3-tool-ic" style={{ background: '#FEF3C7', color: 'var(--amber-600)' }}><Icon name="phone" size={20} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="m3-tool-title">Telefon — så når kunderna er</div>
              <div className="m3-tool-sub">Hur ska inkommande samtal tas emot? Går att ändra senare.</div>
            </div>
          </div>
          {([
            { mode: 'forward', title: 'Behåll ert befintliga nummer', desc: 'Kunderna ringer samma nummer som idag. Samtalen vidarekopplas till teamet som svarar, bokar och tar meddelanden. Ni aktiverar vidarekoppling hos er operatör — vi visar hur.' },
            { mode: 'primary', title: 'Få ett nytt Handymate-nummer', desc: 'Ni får ett nytt nummer som teamet svarar på direkt. Bra om ni vill hålla ert privata nummer privat. Använd det i annonser, på sajten och i offerter.' },
          ] as const).map(opt => {
            const on = data.phoneMode === opt.mode
            return (
              <button key={opt.mode} onClick={() => set({ phoneMode: opt.mode })}
                style={{
                  textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', padding: '11px 13px',
                  border: `1.5px solid ${on ? 'var(--primary-700)' : 'var(--border)'}`,
                  borderRadius: 'var(--r-md)', background: on ? 'var(--primary-50)' : 'var(--surface)',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
                  <span style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, border: `2px solid ${on ? 'var(--primary-700)' : 'var(--border-strong)'}`, background: on ? 'var(--primary-700)' : 'transparent', boxShadow: on ? 'inset 0 0 0 2px #fff' : 'none' }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{opt.title}</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.45, paddingLeft: 25 }}>{opt.desc}</div>
              </button>
            )
          })}
        </div>

        {/* Kommer snart */}
        <div className="m3-tool soon">
          <div className="m3-tool-ic" style={{ background: 'var(--bg)', color: 'var(--subtle)' }}><Icon name="messageCircle" size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="m3-tool-title">Email-vidarekoppling</div>
            <div className="m3-tool-sub">Teamet läser och svarar på kundmejl</div>
          </div>
          <span className="m3-tool-badge">Kommer snart</span>
        </div>
        <div className="m3-tool soon">
          <div className="m3-tool-ic" style={{ background: 'var(--bg)', color: 'var(--subtle)' }}><Icon name="fileText" size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="m3-tool-title">Fortnox</div>
            <div className="m3-tool-sub">Synka fakturor och bokföring automatiskt</div>
          </div>
          <span className="m3-tool-badge">Kommer snart</span>
        </div>
      </div>
    </>
  )
  const dock = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 12.5, color: 'var(--muted)', flex: 1 }}>Du kan koppla fler verktyg senare i inställningarna.</span>
      <button className="m3-go" onClick={onNext}>Fortsätt <Icon name="arrowRight" size={15} /></button>
    </div>
  )
  const panelBody = (
    <>
      <PanelGroup label="Företaget" icon="home">
        <PanelItem icon="home" v={`${data.companyName || '—'}${data.ort ? ' · ' + data.ort : ''}`} state="confirmed" tag="Bekräftat" />
        <PanelItem icon="clock" k="Tider & pris" v={`${data.workStart}–${data.workEnd} · ${data.priceMin}–${data.priceMax} kr/h`} state="confirmed" tag="Bekräftat" />
      </PanelGroup>
      <PanelGroup label="Verktyg" icon="zap">
        <PanelItem icon="users" k="Kundregister" v={csvDone ? `${data.importedCount} kunder` : 'Inga ännu'} state={csvDone ? 'confirmed' : 'future'} tag={csvDone ? 'Bekräftat' : 'Väntar'} />
        <PanelItem icon="calendar" k="Kalender" v={data.calendarConnected ? 'Kopplad' : 'Ej kopplad'} state={data.calendarConnected ? 'confirmed' : 'future'} tag={data.calendarConnected ? 'Bekräftat' : 'Väntar'} />
      </PanelGroup>
    </>
  )
  const tools = (csvDone ? 1 : 0) + (data.calendarConnected ? 1 : 0)
  return variant === 'mobile'
    ? <MobileShell active={3} dialog={dialog} dock={dock} panelSummary={`${tools} verktyg kopplade`} panelDrawer={panelBody} onEscape={onEscape} />
    : <SplitShell active={3} dialog={dialog} dock={dock} panel={<Panel pct={85}>{panelBody}</Panel>} onEscape={onEscape} />
}

/* ---------- Betalning (wired): Stripe Elements, återbruk billing-flödet ---------- */
function PhasePayment({ variant, data, onDone, onEscape }: {
  variant: Variant; data: V3Data; onDone: () => void; onEscape?: () => void
}) {
  return (
    <Elements stripe={stripePromise}>
      <PaymentInner variant={variant} data={data} onDone={onDone} onEscape={onEscape} />
    </Elements>
  )
}

function PaymentInner({ variant, onDone, onEscape }: {
  variant: Variant; data: V3Data; onDone: () => void; onEscape?: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [plan, setPlan] = useState<string>('professional')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [planLoading, setPlanLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPlanLoading(true); setError(null); setClientSecret(null)
    fetch('/api/billing/setup-intent', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: plan }),
    })
      .then(r => r.json())
      .then(d => { if (d.clientSecret) setClientSecret(d.clientSecret); else setError(d.error || 'Kunde inte initiera betalning') })
      .catch(() => setError('Nätverksfel — försök igen'))
      .finally(() => setPlanLoading(false))
  }, [plan])

  async function pay() {
    if (!stripe || !elements || !clientSecret || processing) return
    setProcessing(true); setError(null)
    const cardEl = elements.getElement(CardElement)
    if (!cardEl) { setProcessing(false); return }
    const { setupIntent, error: stripeError } = await stripe.confirmCardSetup(clientSecret, { payment_method: { card: cardEl } })
    if (stripeError) { setError(stripeError.message || 'Kortfel — kontrollera uppgifterna'); setProcessing(false); return }
    if (setupIntent?.status === 'succeeded') {
      const res = await fetch('/api/billing/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupIntentId: setupIntent.id, planId: plan }),
      })
      if (res.ok) onDone()
      else { const d = await res.json().catch(() => ({})); setError(d.error || 'Kunde inte bekräfta betalning'); setProcessing(false) }
    } else setProcessing(false)
  }

  const selected = PLANS.find(p => p.id === plan) || PLANS[1]
  const dialog = (
    <>
      <Matte>Sista biten — välj plan så aktiverar jag teamet på riktigt.</Matte>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {PLANS.map(p => (
          <div key={p.id} className={`m3-tool ${plan === p.id ? 'done' : ''}`} style={{ cursor: 'pointer', alignItems: 'flex-start', flexDirection: 'column', gap: 10 }} onClick={() => setPlan(p.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13, width: '100%' }}>
              <div className="m3-tool-ic" style={{ background: plan === p.id ? 'var(--primary-50)' : 'var(--bg)', color: plan === p.id ? 'var(--primary-700)' : 'var(--subtle)' }}>
                <Icon name={plan === p.id ? 'check' : 'zap'} size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="m3-tool-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {p.name}
                  {p.popular && <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--primary-700)', background: 'var(--primary-50)', padding: '2px 7px', borderRadius: 999 }}>Populär</span>}
                </div>
                <div className="m3-tool-sub">{p.price.toLocaleString('sv-SE')} kr/mån exkl. moms · {p.tagline}</div>
              </div>
            </div>
            <ul style={{ margin: 0, padding: '0 0 0 2px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5, width: '100%' }}>
              {p.features.map(f => (
                <li key={f} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.4 }}>
                  <Icon name="check" size={13} color="var(--primary-600)" /> <span style={{ flex: 1 }}>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {error && <div className="m3-scrape" style={{ background: '#FFF1F2', borderColor: '#FECDD3', color: '#BE123C' }}><Icon name="x" size={16} /> {error}</div>}
    </>
  )
  const dock = (
    <InlineCard accent>
      <div className="m3-inline-label"><Icon name="shield" size={13} /> Kortuppgifter</div>
      <div style={{ border: '1px solid var(--ob-border)', borderRadius: 'var(--ob-r-md)', padding: '13px 14px', background: 'var(--ob-surface)', marginBottom: 12 }}>
        <CardElement options={{ style: { base: { fontSize: '15px', color: '#0F172A' } } }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="m3-go" onClick={pay} disabled={!clientSecret || processing || planLoading}>
          {processing ? 'Behandlar…' : <>Aktivera {selected.name} <Icon name="arrowRight" size={15} /></>}
        </button>
      </div>
    </InlineCard>
  )
  const panelBody = (
    <PanelGroup label="Din plan" icon="zap">
      <PanelItem icon="zap" k="Plan" v={`${selected.name} · ${selected.price.toLocaleString('sv-SE')} kr/mån`} state="confirmed" tag="Vald" />
      <PanelItem icon="shield" v="14 dagars trial — avsluta när du vill" state="future" tag="Trial" />
    </PanelGroup>
  )
  return variant === 'mobile'
    ? <MobileShell active={4} dialog={dialog} dock={dock} panelSummary={`${selected.name} · ${selected.price.toLocaleString('sv-SE')} kr`} panelDrawer={panelBody} onEscape={onEscape} />
    : <SplitShell active={4} dialog={dialog} dock={dock} panel={<Panel pct={95}>{panelBody}</Panel>} onEscape={onEscape} />
}

/* ---------- Fas E (wired): team-reveal + finish ---------- */
const TEAM_E = [
  { id: 'lisa', name: 'Lisa', line: 'svarar i telefonen åt er', live: true },
  { id: 'karin', name: 'Karin', line: 'sköter fakturor och bokföring' },
  { id: 'daniel', name: 'Daniel', line: 'följer upp era offerter' },
  { id: 'lars', name: 'Lars', line: 'håller koll på projekt och bokningar' },
  { id: 'hanna', name: 'Hanna', line: 'sköter SMS och påminnelser' },
]

function PhaseEWired({ variant, data, onFinish, onEscape }: {
  variant: Variant; data: V3Data; onFinish: () => void; onEscape?: () => void
}) {
  const [finishing, setFinishing] = useState(false)
  const dialog = (
    <>
      <Matte>Allt klart! Det här är teamet jag satt ihop åt er — <strong>konfigurerat efter era tjänster och tider</strong>.</Matte>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {TEAM_E.map(t => (
          <div key={t.id} className="m3-teamcard">
            <div className="av" style={{ backgroundImage: `url(${getAgentById(t.id)?.avatar || ''})` }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="m3-team-name">{t.name}</div>
              <div className="m3-team-line">{t.line}</div>
            </div>
            {t.live && <span className="m3-live"><i /> Live</span>}
          </div>
        ))}
      </div>
      <Matte role={false}>Dag ett vet jag bara det ni berättat. Men <strong>ju mer ni använder mig, desto bättre lär jag känna era mönster</strong> — vilka kunder som återkommer, när det är läge att skicka offert.</Matte>
      <div className="m3-firstwin" style={{ marginLeft: 50 }}>
        <Icon name="phone" size={18} /> Vill du höra det funka? <strong style={{ marginLeft: 4 }}>Ring ert eget nummer och hör Lisa svara.</strong>
      </div>
    </>
  )
  const dock = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 12.5, color: 'var(--muted)', flex: 1 }}>Teamet börjar jobba så fort du kör igång.</span>
      <button className="m3-go" style={{ height: 48, padding: '0 24px', fontSize: 15 }} onClick={() => { setFinishing(true); onFinish() }} disabled={finishing}>
        <Icon name="rocket" size={17} /> {finishing ? 'Startar…' : 'Kör igång'}
      </button>
    </div>
  )
  const panelBody = (
    <>
      <PanelGroup label="Ditt företag" icon="check">
        <PanelItem icon="home" v={`${data.companyName || '—'}${data.ort ? ' · ' + data.ort : ''}`} state="confirmed" tag="Bekräftat" />
        <PanelItem icon="wrench" k="Tjänster & ton" v={`${data.services.join(' · ') || '—'} — ${TONE_LABEL[data.tone] || ''}`} state="confirmed" tag="Bekräftat" />
        <PanelItem icon="clock" k="Tider & pris" v={`Mån–Fre ${data.workStart}–${data.workEnd} · ${data.priceMin}–${data.priceMax} kr/h · ROT ${data.rot ? 'på' : 'av'}`} state="confirmed" tag="Bekräftat" />
        <PanelItem icon="zap" k="Verktyg" v={`${data.importedCount ? data.importedCount + ' kunder' : '—'}${data.calendarConnected ? ' · Kalender' : ''}`} state="confirmed" tag="Bekräftat" />
      </PanelGroup>
      <PanelGroup label="Lär mig över tid" icon="sparkles">
        <PanelItem icon="users" v="Era vanligaste kunder & mönster" state="future" tag="Lär mig" />
        <PanelItem icon="target" v="Bästa läget att skicka offert" state="future" tag="Lär mig" />
        <PanelItem icon="calendar" v="Återkommande jobb & säsonger" state="future" tag="Lär mig" />
      </PanelGroup>
    </>
  )
  return variant === 'mobile'
    ? <MobileShell active={4} dialog={dialog} dock={dock} panelSummary="Komplett · teamet redo" panelDrawer={panelBody} onEscape={onEscape} />
    : <SplitShell active={4} dialog={dialog} dock={dock} panel={<Panel pct={100}>{panelBody}</Panel>} onEscape={onEscape} />
}
