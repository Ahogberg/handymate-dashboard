'use client'

/**
 * StepImportData — "Hämta in din verksamhet" (onboarding-steg, efter betalning).
 *
 * ALL LOGIK ÄR OFÖRÄNDRAD (Fortnox-OAuth, runFortnoxImport, handleCsvFile,
 * parseCsvCustomers, view-state-maskinen, setData, felhantering,
 * useEffect-callbacken). Endast det VISUELLA lagret är de förfinade
 * obi-*-komponenterna (states A–E) från Claude Design. Kräver CSS-tillägget
 * obi-* i onboarding.css.
 *
 * Beroenden: lucide-react, ./OnboardingHeader, @/lib/agents/team (avatarer).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Upload,
  Link2,
  FileSpreadsheet,
  Download,
  AlertTriangle,
} from 'lucide-react'
import OnboardingHeader from './OnboardingHeader'
import { TEAM } from '@/lib/agents/team'
import type { OnboardingFormData } from '../types-redesign'

interface Props {
  onNext: () => void
  onBack: () => void
  data: OnboardingFormData
  setData: (updater: (d: OnboardingFormData) => OnboardingFormData) => void
}

interface FortnoxResult {
  customers: number
  invoices: number
  outstandingKr: number
}

type View = 'choose' | 'fortnox-loading' | 'fortnox-done' | 'csv' | 'csv-done'

const avatarFor = (id: string) => TEAM.find(a => a.id === id)?.avatar

export default function StepImportData({ onNext, onBack, data, setData }: Props) {
  const [view, setView] = useState<View>('choose')
  const [error, setError] = useState<string | null>(null)
  const [fortnoxResult, setFortnoxResult] = useState<FortnoxResult | null>(null)
  const [csvCount, setCsvCount] = useState(0)
  const [csvBusy, setCsvBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importStartedRef = useRef(false)

  /* ─────────── LOGIK (oförändrad) ─────────── */

  const runFortnoxImport = useCallback(async () => {
    setView('fortnox-loading')
    setError(null)
    try {
      const custRes = await fetch('/api/fortnox/import/customers', { method: 'POST' })
      const cust = await custRes.json().catch(() => ({}))
      if (!custRes.ok) throw new Error(cust?.error ?? 'Kunde inte hämta kunder från Fortnox')

      const invRes = await fetch('/api/fortnox/import/invoices', { method: 'POST' })
      const inv = await invRes.json().catch(() => ({}))
      if (!invRes.ok) throw new Error(inv?.error ?? 'Kunde inte hämta fakturor från Fortnox')

      const result: FortnoxResult = {
        customers: Number(cust?.imported ?? 0),
        invoices: Number(inv?.imported ?? 0),
        outstandingKr: Number(inv?.total_outstanding_kr ?? 0),
      }
      setFortnoxResult(result)
      setData(d => ({ ...d, importedCustomers: result.customers, importedInvoices: result.invoices }))
      // Tomt-läge: anslutet men inget att hämta — mjuk fallback (håll kvar felruta + val-skärm).
      if (result.customers === 0 && result.invoices === 0) {
        setError('Fortnox var anslutet men innehöll inga kunder eller obetalda fakturor ännu.')
        setView('choose')
        return
      }
      setView('fortnox-done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Något gick fel vid hämtningen')
      setView('choose') // Mjuk fallback: tillbaka till valen där CSV finns.
    }
  }, [setData])

  useEffect(() => {
    if (importStartedRef.current) return
    const params = new URLSearchParams(window.location.search)
    const fortnox = params.get('fortnox')
    if (fortnox === 'connected') {
      importStartedRef.current = true
      window.history.replaceState({}, '', '/onboarding')
      runFortnoxImport()
    } else if (fortnox === 'error') {
      importStartedRef.current = true
      const msg = params.get('message')
      setError(msg ?? 'Kopplingen till Fortnox misslyckades — ladda upp en fil i stället')
      window.history.replaceState({}, '', '/onboarding')
    }
  }, [runFortnoxImport])

  function connectFortnox() {
    window.location.href = '/api/integrations/fortnox/connect?return=onboarding'
  }

  async function handleCsvFile(file: File) {
    setCsvBusy(true)
    setError(null)
    try {
      const text = await file.text()
      const customers = parseCsvCustomers(text)
      if (customers.length === 0) {
        throw new Error('Hittade inga kunder i filen — kontrollera att den har namn/telefon')
      }
      const res = await fetch('/api/customers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customers }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? 'Import misslyckades')
      const imported = Number(d?.success ?? 0)
      setCsvCount(imported)
      setData(prev => ({ ...prev, importedCustomers: imported }))
      setView('csv-done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunde inte läsa filen')
    } finally {
      setCsvBusy(false)
    }
  }

  /* ─────────── VY (förfinad, obi-*) ─────────── */

  return (
    <div className="ob-screen">
      <OnboardingHeader step={5} total={7} onBack={onBack} onSkip={onNext} />
      <div className="ob-body">
        {/* A. Val-skärm */}
        {view === 'choose' && (
          <>
            <h1 className="ob-headline">Låt ditt AI-team börja jobba direkt.</h1>
            <p className="ob-sub">
              Hämta in dina kunder och obetalda fakturor — så börjar dina AI-kollegor
              jobba på din verksamhet från minut ett.
            </p>

            {error && <FallbackNote text={error} />}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 18 }}>
              <button className="obi-choice rec" onClick={connectFortnox}>
                <span className="obi-badge">Rekommenderat</span>
                <span className="obi-choice-ic teal"><Link2 size={24} strokeWidth={2.2} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="obi-choice-title">Koppla Fortnox</span>
                  <span className="obi-choice-sub">Hämtar dina kunder och obetalda fakturor automatiskt.</span>
                </span>
                <span className="obi-choice-arrow"><ArrowRight size={20} /></span>
              </button>

              <button className="obi-choice" onClick={() => setView('csv')}>
                <span className="obi-choice-ic soft"><FileSpreadsheet size={24} strokeWidth={2.2} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="obi-choice-title">Ladda upp kundlista</span>
                  <span className="obi-choice-sub">Har du en CSV/Excel-fil? Vi läser in den åt dig.</span>
                </span>
                <span className="obi-choice-arrow"><ArrowRight size={20} /></span>
              </button>
            </div>

            <button type="button" className="obi-skiplink" style={{ marginBottom: 22 }} onClick={onNext}>
              Hoppa över — jag gör det senare
            </button>

            <div className="obi-unlock">
              <div className="obi-unlock-label">Det här låser upp</div>
              <div className="obi-unlock-row">
                <UnlockItem id="karin" text={<><b>Karin</b> jagar dina obetalda fakturor</>} />
                <UnlockItem id="hanna" text={<><b>Hanna</b> väcker vilande kunder</>} />
                <UnlockItem id="daniel" text={<><b>Daniel</b> följer upp dina offerter</>} />
              </div>
            </div>
          </>
        )}

        {/* B. Fortnox — hämtar */}
        {view === 'fortnox-loading' && (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100%' }}>
            <div className="obi-loadcard">
              <div className="obi-spinner" />
              <div className="obi-load-title">Hämtar din verksamhet från Fortnox…</div>
              <div className="obi-load-sub">Det tar bara någon sekund. Karin förbereder allt medan du väntar.</div>
              <div className="obi-load-steps">
                <div className="obi-load-step done">
                  <span className="obi-step-dot"><Check size={14} style={{ color: 'var(--ob-primary-700)' }} /></span>
                  Ansluten till Fortnox
                </div>
                <div className="obi-load-step active">
                  <span className="obi-step-dot"><span className="obi-step-spin" /></span>
                  Hämtar kunder…
                </div>
                <div className="obi-load-step">
                  <span className="obi-step-dot"><span className="obi-step-idle" /></span>
                  Läser obetalda fakturor
                </div>
              </div>
            </div>
          </div>
        )}

        {/* C. Fortnox — klart (glädje-wow) */}
        {view === 'fortnox-done' && fortnoxResult && (
          <SuccessView
            title={<>Vi hämtade <span className="hl">{fortnoxResult.customers} kunder</span> och <span className="hl">{fortnoxResult.invoices} obetalda fakturor</span></>}
            sub="Din verksamhet är inläst. Teamet har redan börjat jobba."
            stats={[
              { num: String(fortnoxResult.customers), label: 'kunder' },
              { num: String(fortnoxResult.invoices), label: 'obetalda fakturor' },
              { num: fortnoxResult.outstandingKr.toLocaleString('sv-SE'), label: 'kr utestående', hero: true },
            ]}
            agent={fortnoxResult.invoices > 0 ? {
              id: 'karin',
              text: <><b>Karin</b> har förberett påminnelser på dina obetalda fakturor — du godkänner dem på dashboarden.</>,
            } : undefined}
          />
        )}

        {/* D. CSV-import */}
        {view === 'csv' && (
          <>
            <h1 className="ob-headline" style={{ fontSize: 22 }}>Ladda upp kundlista</h1>
            <p className="ob-sub" style={{ marginBottom: 18 }}>CSV eller Excel — vi känner igen kolumnerna åt dig.</p>

            {error && <FallbackNote text={error} />}

            <div
              className={`obi-drop ${dragOver ? 'over' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => !csvBusy && fileInputRef.current?.click()}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault(); setDragOver(false)
                const f = e.dataTransfer.files?.[0]
                if (f) handleCsvFile(f)
              }}
            >
              {csvBusy ? (
                <>
                  <Loader2 size={38} className="animate-spin" style={{ color: 'var(--ob-primary-700)', marginBottom: 12 }} />
                  <div className="obi-drop-title">Läser in dina kunder…</div>
                </>
              ) : (
                <>
                  <div className="obi-drop-ic"><Upload size={38} /></div>
                  <div className="obi-drop-title">Dra och släpp din fil här</div>
                  <div className="obi-drop-or">eller</div>
                  <span className="obi-pickbtn"><FileSpreadsheet size={16} /> Välj fil</span>
                  <div className="obi-hint">Stödjer CSV (komma-, semikolon- eller tab-separerad)</div>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f) }}
            />

            <div className="ob-card obi-tips" style={{ marginTop: 16 }}>
              {[
                'Första raden ska vara kolumnrubriker (Namn, Telefon, …)',
                'Telefonnummer i eget fält (07XXXXXXXX eller +467XXXXXXXX)',
                'Dubbletter uppdateras automatiskt',
              ].map(t => (
                <div key={t} className="obi-tip">
                  <span className="obi-tip-ic"><Check size={16} strokeWidth={2.5} /></span>{t}
                </div>
              ))}
              <button type="button" className="obi-templink" onClick={downloadTemplate}>
                <Download size={15} /> Ladda ner exempelmall
              </button>
            </div>

            <button
              type="button"
              className="obi-skiplink"
              style={{ marginTop: 16 }}
              onClick={() => { setError(null); setView('choose') }}
            >
              <ArrowLeft size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Tillbaka till valen
            </button>
          </>
        )}

        {/* CSV — klart */}
        {view === 'csv-done' && (
          <SuccessView
            title={<><span className="hl">{csvCount} kunder</span> inlästa</>}
            sub="Teamet kan nu jobba på hela din kundbas."
            agent={{
              id: 'hanna',
              text: <><b>Hanna</b> kan nu väcka dina vilande kunder med en reaktiverings-kampanj — starta den på dashboarden.</>,
            }}
          />
        )}
      </div>

      <div className="ob-footer">
        {(view === 'fortnox-done' || view === 'csv-done') && (
          <button type="button" className="ob-cta" onClick={onNext}>
            Fortsätt <ArrowRight size={18} />
          </button>
        )}
      </div>
    </div>
  )
}

/* ─────────── Presentations-hjälpare (obi-*) ─────────── */

function UnlockItem({ id, text }: { id: string; text: React.ReactNode }) {
  return (
    <div className="obi-unlock-item">
      <span className="obi-unlock-av" style={{ backgroundImage: avatarFor(id) ? `url(${avatarFor(id)})` : undefined }} />
      <span className="obi-unlock-text">{text}</span>
    </div>
  )
}

function FallbackNote({ text }: { text: string }) {
  return (
    <div
      style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        background: '#FFFBEB', border: '1px solid #FDE68A',
        borderRadius: 'var(--ob-r-md)', padding: '12px 14px',
        fontSize: 13, color: 'var(--ob-ink-2)', lineHeight: 1.45, marginBottom: 16,
      }}
    >
      <AlertTriangle size={17} style={{ color: 'var(--ob-amber-600)', flexShrink: 0, marginTop: 1 }} />
      <span>{text} Ingen fara — ladda upp en kundlista i stället, eller hoppa över.</span>
    </div>
  )
}

function SuccessView({
  title,
  sub,
  stats,
  agent,
}: {
  title: React.ReactNode
  sub: string
  stats?: Array<{ num: string; label: string; hero?: boolean }>
  agent?: { id: string; text: React.ReactNode }
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100%' }}>
      <div className="obi-success">
        <div className="obi-burst"><Check size={40} strokeWidth={2.6} /></div>
        <h1 className="obi-success-title">{title}</h1>
        <p className="obi-success-sub">{sub}</p>

        {stats && stats.length > 0 && (
          <div className="obi-stats">
            {stats.map((s, i) => (
              <div key={s.label} className={`obi-stat ${s.hero ? 'hero' : ''}`} style={{ animationDelay: `${0.05 + i * 0.07}s` }}>
                <div className="obi-stat-num">{s.num}</div>
                <div className="obi-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {agent && (
          <div className="obi-karin">
            <span className="obi-karin-av" style={{ backgroundImage: avatarFor(agent.id) ? `url(${avatarFor(agent.id)})` : undefined }} />
            <span className="obi-karin-text">{agent.text}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────── CSV-parser + mall (oförändrad logik) ─────────── */

function downloadTemplate() {
  const template =
    'Namn,Telefon,E-post,Adress\nAnna Andersson,0701234567,anna@example.com,Storgatan 1\nErik Eriksson,0709876543,erik@example.com,Lillvägen 5'
  const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'kundimport_mall.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function parseCsvCustomers(
  text: string
): Array<{ name: string; phone_number: string; email: string; address: string }> {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return []

  const delimiter = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ','
  const split = (line: string) => line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''))

  const header = split(lines[0]).map(h => h.toLowerCase())
  const findCol = (keys: string[]) => header.findIndex(h => keys.some(k => h.includes(k)))

  const nameIdx = findCol(['namn', 'name', 'kund', 'företag', 'foretag'])
  const phoneIdx = findCol(['telefon', 'phone', 'mobil', 'tel'])
  const emailIdx = findCol(['e-post', 'epost', 'email', 'mail', 'e-mail'])
  const addrIdx = findCol(['adress', 'address', 'gata'])

  const hasHeader = nameIdx >= 0 || phoneIdx >= 0 || emailIdx >= 0
  const dataLines = hasHeader ? lines.slice(1) : lines

  const out: Array<{ name: string; phone_number: string; email: string; address: string }> = []
  for (const line of dataLines) {
    const cols = split(line)
    const name = nameIdx >= 0 ? cols[nameIdx] ?? '' : cols[0] ?? ''
    const phone = phoneIdx >= 0 ? cols[phoneIdx] ?? '' : cols[1] ?? ''
    const email = emailIdx >= 0 ? cols[emailIdx] ?? '' : ''
    const address = addrIdx >= 0 ? cols[addrIdx] ?? '' : ''
    if (!name && !phone) continue
    out.push({ name, phone_number: phone, email, address })
  }
  return out
}
