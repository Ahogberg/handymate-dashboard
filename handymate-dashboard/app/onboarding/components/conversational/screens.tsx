'use client'

/* Matte-konversationell onboarding (v3) — faserna A–E.
   Portad från Claude Designs ob3-screens.jsx till TSX.
   STATISK (demo-data) i detta increment — increment 6 byter ut mot riktig
   data/handlers. Avatarer i fas E via getAgentById istället för demo-png. */

import React, { useState } from 'react'
import {
  Matte, User, InlineCard, PanelItem, PanelGroup, Panel,
  SplitShell, MobileShell, Icon,
} from './parts'
import { getAgentById } from '@/lib/agents/team'

export type Variant = 'desktop' | 'mobile'

interface RenderArgs {
  idx: number
  dialog: React.ReactNode
  dock?: React.ReactNode
  panelBody: React.ReactNode
  pct: number
  mobSummary: React.ReactNode
  mobOpen?: boolean
  onEscape?: () => void
}

function render(variant: Variant, a: RenderArgs) {
  return variant === 'mobile'
    ? <MobileShell active={a.idx} dialog={a.dialog} dock={a.dock} panelSummary={a.mobSummary} panelDrawer={a.panelBody} panelOpen={a.mobOpen} onEscape={a.onEscape} />
    : <SplitShell active={a.idx} dialog={a.dialog} dock={a.dock} panel={<Panel pct={a.pct}>{a.panelBody}</Panel>} onEscape={a.onEscape} />
}

/* ============================== A — Vem ni är ============================== */
export function PhaseA({ variant, onEscape }: { variant: Variant; onEscape?: () => void }) {
  const dialog = (
    <>
      <Matte>Hej! Jag är <strong>Matte</strong> — jag leder teamet som ska sköta kontoret åt dig.</Matte>
      <Matte role={false}>Innan vi drar igång vill jag lära känna ert företag. Har ni en hemsida?</Matte>
      <User>bergstrombygg.se</User>
      <div className="m3-scrape" style={{ marginLeft: 50 }}>
        <Icon name="check" size={16} /> Jag läste er sajt — här är vad jag hittade.
      </div>
      <Matte role={false}>Stämmer <strong>namnet</strong> och <strong>orten</strong>? Fyll på med org-nummer så har jag det formella på plats.</Matte>
    </>
  )
  const dock = (
    <InlineCard accent>
      <div className="m3-inline-label"><Icon name="fileText" size={13} /> Komplettera</div>
      <div className="m3-fieldrow">
        <input className="m3-input2" placeholder="Org-nummer" defaultValue="556921-4087" />
        <input className="m3-input2" placeholder="Besöksadress" defaultValue="Kopparbergsvägen 12, Västerås" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <button className="m3-go">Fortsätt <Icon name="arrowRight" size={15} /></button>
      </div>
    </InlineCard>
  )
  const panelBody = (
    <PanelGroup label="Företaget" icon="home">
      <PanelItem icon="home" k="Företagsnamn" v="Bergström Bygg & Tak AB" state="interp" tag="Tolkat" />
      <PanelItem icon="mapPin" k="Ort" v="Västerås" state="interp" tag="Tolkat" />
      <PanelItem icon="fileText" k="Org-nummer" v="556921-4087" state="confirmed" tag="Bekräftat" />
    </PanelGroup>
  )
  return render(variant, { idx: 0, dialog, dock, panelBody, pct: 20, mobSummary: '3 poster · 2 tolkade', onEscape })
}

/* ============================== B — Vad ni gör ============================== */
const SERVICES = ['Badrumsrenovering', 'Takarbeten', 'Elinstallation']
export function PhaseB({ variant, onEscape }: { variant: Variant; onEscape?: () => void }) {
  const [confirmed, setConfirmed] = useState(false)
  const [tone, setTone] = useState('personlig')

  const dialog = (
    <>
      <Matte>Jag läste er sajt ordentligt. Det ser ut som att ni gör <strong>badrum</strong>, <strong>takarbeten</strong> och <strong>elinstallationer</strong> — och tonen är personlig och rakt på sak.</Matte>
      <Matte role={false}>Stämmer det? Justera gärna chipsen så blir teamet vassare från start.</Matte>
      {confirmed && <User>Ja, det stämmer — ta bort &quot;el&quot; dock, det gör vi inte längre.</User>}
      {confirmed && <Matte role={false}>Perfekt, då vet jag. <strong>Bekräftat ✓</strong></Matte>}
    </>
  )
  const dock = (
    <InlineCard accent>
      <div className="m3-inline-label"><Icon name="wrench" size={13} /> Era tjänster {!confirmed && <span style={{ color: 'var(--amber-600)', fontWeight: 700 }}>· tolkat från sajten</span>}</div>
      <div className="m3-chips" style={{ marginBottom: 12 }}>
        {SERVICES.map(s => (
          <span key={s} className={`m3-chip ${confirmed ? '' : 'interp'}`}>
            {s}<span className="m3-chip-x"><Icon name="x" size={10} /></span>
          </span>
        ))}
        <span className="m3-chip add"><Icon name="plus" size={12} /> Lägg till</span>
      </div>
      <div className="m3-inline-label"><Icon name="messageCircle" size={13} /> Ton mot kund</div>
      <div className="m3-seg" style={{ marginBottom: 12 }}>
        {[['personlig', 'Personlig'], ['professionell', 'Professionell'], ['rak', 'Rak & tydlig']].map(([k, l]) => (
          <button key={k} className={tone === k ? 'on' : ''} onClick={() => setTone(k)}>{l}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {!confirmed
          ? <><button className="m3-go ghost">Ändra</button><button className="m3-go" onClick={() => setConfirmed(true)}><Icon name="check" size={15} /> Ja, det stämmer</button></>
          : <button className="m3-go">Fortsätt <Icon name="arrowRight" size={15} /></button>}
      </div>
    </InlineCard>
  )
  const panelBody = (
    <>
      <PanelGroup label="Företaget" icon="home">
        <PanelItem icon="home" k="Företagsnamn" v="Bergström Bygg & Tak AB" state="interp" tag="Tolkat" />
        <PanelItem icon="mapPin" k="Ort" v="Västerås" state="interp" tag="Tolkat" />
        <PanelItem icon="fileText" k="Org-nummer" v="556921-4087" state="confirmed" tag="Bekräftat" />
      </PanelGroup>
      <PanelGroup label="Vad ni gör" icon="wrench">
        <PanelItem icon="wrench" k="Tjänster" v="Badrum · Tak · El" state={confirmed ? 'confirmed' : 'interp'} tag={confirmed ? 'Bekräftat' : 'Tolkat'} />
        <PanelItem icon="messageCircle" k="Ton mot kund" v="Personlig & rak" state={confirmed ? 'confirmed' : 'interp'} tag={confirmed ? 'Bekräftat' : 'Tolkat'} />
        {!confirmed && (
          <div className="m3-confirmrow">
            <button className="yes" onClick={() => setConfirmed(true)}>Stämmer ✓</button>
            <button className="no">Rätta</button>
          </div>
        )}
      </PanelGroup>
    </>
  )
  return render(variant, { idx: 1, dialog, dock, panelBody, pct: confirmed ? 52 : 45, mobSummary: confirmed ? '5 poster · allt bekräftat' : '5 poster · 4 tolkade', mobOpen: true, onEscape })
}

/* ============================== C — Hur ni jobbar ============================== */
export function PhaseC({ variant, onEscape }: { variant: Variant; onEscape?: () => void }) {
  const [rot, setRot] = useState(true)
  const dialog = (
    <>
      <Matte>Bra — då vet teamet vad ni gör. Nu det praktiska: <strong>när jobbar ni</strong>, och <strong>hur tar ni betalt</strong>?</Matte>
      <Matte role={false}>Det här använder Lisa när hon bokar tider och Daniel när han räknar offert.</Matte>
    </>
  )
  const dock = (
    <InlineCard accent>
      <div className="m3-inline-label"><Icon name="clock" size={13} /> Arbetstider</div>
      <div className="m3-fieldrow" style={{ marginBottom: 12 }}>
        <input className="m3-input2" defaultValue="Mån–Fre" />
        <input className="m3-input2" defaultValue="07:00" />
        <input className="m3-input2" defaultValue="16:00" />
      </div>
      <div className="m3-inline-label"><Icon name="dollarSign" size={13} /> Timpris (kr, exkl. moms)</div>
      <div className="m3-fieldrow" style={{ marginBottom: 12 }}>
        <input className="m3-input2" defaultValue="650" />
        <input className="m3-input2" defaultValue="850" />
      </div>
      <div className="m3-toggle" onClick={() => setRot(r => !r)} style={{ cursor: 'pointer' }}>
        <div>
          <div className="m3-tool-title" style={{ fontSize: 14 }}>ROT-avdrag som standard</div>
          <div className="m3-tool-sub">Dras automatiskt på privatkunders offerter</div>
        </div>
        <div className={`ob-switch ${rot ? 'on' : ''}`} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="m3-go">Fortsätt <Icon name="arrowRight" size={15} /></button>
      </div>
    </InlineCard>
  )
  const panelBody = (
    <>
      <PanelGroup label="Företaget" icon="home">
        <PanelItem icon="home" v="Bergström Bygg & Tak AB · Västerås" state="confirmed" tag="Bekräftat" />
        <PanelItem icon="wrench" k="Tjänster" v="Badrum · Tak · El" state="confirmed" tag="Bekräftat" />
      </PanelGroup>
      <PanelGroup label="Hur ni jobbar" icon="clock">
        <PanelItem icon="clock" k="Arbetstider" v="Mån–Fre · 07:00–16:00" state="confirmed" tag="Bekräftat" />
        <PanelItem icon="dollarSign" k="Timpris" v="650–850 kr/h" state="confirmed" tag="Bekräftat" />
        <PanelItem icon="shield" k="ROT-avdrag" v={rot ? 'Automatiskt på privatkunder' : 'Av'} state="confirmed" tag="Bekräftat" />
      </PanelGroup>
    </>
  )
  return render(variant, { idx: 2, dialog, dock, panelBody, pct: 68, mobSummary: '7 poster · allt bekräftat', onEscape })
}

/* ============================== D — Verktyg ============================== */
export function PhaseD({ variant, onEscape }: { variant: Variant; onEscape?: () => void }) {
  const [cal, setCal] = useState(false)
  const [csv, setCsv] = useState(false)
  const dialog = (
    <>
      <Matte>Nu kopplar vi era verktyg så teamet kan börja jobba på riktigt — inte bara öva.</Matte>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className={`m3-tool ${csv ? 'done' : ''}`}>
          <div className="m3-tool-ic" style={{ background: csv ? 'var(--primary-50)' : '#DBEAFE', color: csv ? 'var(--primary-700)' : 'var(--blue-600)' }}><Icon name="users" size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="m3-tool-title">Importera kunder</div>
            <div className="m3-tool-sub">{csv ? '24 kunder inlästa från kunder.csv' : 'Dra in en CSV — Karin tar hand om resten'}</div>
          </div>
          {csv ? <span className="m3-tool-ok"><Icon name="check" size={15} /> Klart</span>
               : <><button className="m3-tool-btn skip">Hoppa över</button><button className="m3-tool-btn primary" onClick={() => setCsv(true)}>Välj fil</button></>}
        </div>
        {!csv && <div className="m3-drop"><Icon name="upload" size={18} /><div style={{ marginTop: 6, fontSize: 13, color: 'var(--muted)' }}>Släpp <strong>kunder.csv</strong> här</div></div>}

        <div className={`m3-tool ${cal ? 'done' : ''}`}>
          <div className="m3-tool-ic" style={{ background: cal ? 'var(--primary-50)' : '#D1FAE5', color: cal ? 'var(--primary-700)' : 'var(--emerald-600)' }}><Icon name="calendar" size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="m3-tool-title">Koppla Google Calendar</div>
            <div className="m3-tool-sub">{cal ? 'Lisa kan nu boka riktiga tider' : 'Låter Lisa boka in jobb utan dubbelbokning'}</div>
          </div>
          {cal ? <span className="m3-tool-ok"><Icon name="check" size={15} /> Kopplad</span>
               : <button className="m3-tool-btn oauth" onClick={() => setCal(true)}><Icon name="calendar" size={14} /> Anslut</button>}
        </div>

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
      <button className="m3-go">Möt teamet <Icon name="arrowRight" size={15} /></button>
    </div>
  )
  const panelBody = (
    <>
      <PanelGroup label="Företaget" icon="home">
        <PanelItem icon="home" v="Bergström Bygg & Tak AB · Västerås" state="confirmed" tag="Bekräftat" />
        <PanelItem icon="clock" k="Arbetstider & pris" v="Mån–Fre 07–16 · 650–850 kr/h" state="confirmed" tag="Bekräftat" />
      </PanelGroup>
      <PanelGroup label="Verktyg" icon="zap">
        <PanelItem icon="users" k="Kundregister" v={csv ? '24 kunder importerade' : 'Inga ännu'} state={csv ? 'confirmed' : 'future'} tag={csv ? 'Bekräftat' : 'Väntar'} />
        <PanelItem icon="calendar" k="Kalender" v={cal ? 'Google Calendar kopplad' : 'Ej kopplad'} state={cal ? 'confirmed' : 'future'} tag={cal ? 'Bekräftat' : 'Väntar'} />
      </PanelGroup>
    </>
  )
  return render(variant, { idx: 3, dialog, dock, panelBody, pct: 85, mobSummary: `${(csv ? 1 : 0) + (cal ? 1 : 0)} verktyg kopplade`, onEscape })
}

/* ============================== E — Teamet (magiskt, ärligt) ============================== */
const TEAM = [
  { id: 'lisa', name: 'Lisa', line: 'svarar redan på ert nummer', live: true },
  { id: 'karin', name: 'Karin', line: 'sköter fakturor och bokföring' },
  { id: 'daniel', name: 'Daniel', line: 'följer upp era offerter' },
  { id: 'lars', name: 'Lars', line: 'håller koll på projekt och bokningar' },
  { id: 'hanna', name: 'Hanna', line: 'sköter SMS och påminnelser' },
]
export function PhaseE({ variant, onEscape }: { variant: Variant; onEscape?: () => void }) {
  const dialog = (
    <>
      <Matte>Allt klart. Det här är teamet jag satt ihop åt er — <strong>konfigurerat efter era tjänster och tider</strong>.</Matte>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {TEAM.map(t => (
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
      <button className="m3-go" style={{ height: 48, padding: '0 24px', fontSize: 15 }}><Icon name="rocket" size={17} /> Kör igång</button>
    </div>
  )
  const panelBody = (
    <>
      <PanelGroup label="Ditt företag" icon="check">
        <PanelItem icon="home" v="Bergström Bygg & Tak AB · Västerås" state="confirmed" tag="Bekräftat" />
        <PanelItem icon="wrench" k="Tjänster & ton" v="Badrum · Tak · El — personlig & rak" state="confirmed" tag="Bekräftat" />
        <PanelItem icon="clock" k="Tider & pris" v="Mån–Fre 07–16 · 650–850 kr/h · ROT på" state="confirmed" tag="Bekräftat" />
        <PanelItem icon="zap" k="Verktyg" v="24 kunder · Kalender kopplad" state="confirmed" tag="Bekräftat" />
      </PanelGroup>
      <PanelGroup label="Lär mig över tid" icon="sparkles">
        <PanelItem icon="users" v="Era vanligaste kunder & mönster" state="future" tag="Lär mig" />
        <PanelItem icon="target" v="Bästa läget att skicka offert" state="future" tag="Lär mig" />
        <PanelItem icon="calendar" v="Återkommande jobb & säsonger" state="future" tag="Lär mig" />
      </PanelGroup>
    </>
  )
  return render(variant, { idx: 4, dialog, dock, panelBody, pct: 100, mobSummary: 'Komplett · teamet redo', mobOpen: false, onEscape })
}

export const SCREENS = [
  { id: 'A', name: 'Vem ni är', comp: PhaseA },
  { id: 'B', name: 'Vad ni gör', comp: PhaseB },
  { id: 'C', name: 'Hur ni jobbar', comp: PhaseC },
  { id: 'D', name: 'Verktyg', comp: PhaseD },
  { id: 'E', name: 'Teamet', comp: PhaseE },
] as const
