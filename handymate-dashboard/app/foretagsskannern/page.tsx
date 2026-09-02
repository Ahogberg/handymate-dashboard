'use client'

/**
 * Företagsskannern — app.handymate.se/foretagsskannern (pass 1a, 2026-09-02,
 * tasks/plan-foretagsskannern.md). Publik sida, ingen inloggning.
 *
 * Besökaren laddar upp en kundlista-CSV (och valfritt en faktura-CSV från
 * Fortnox/Visma). ALLT parsas i webbläsaren — lib/foretagsskannern/skanna.ts
 * är en ren, DOM-fri modul utan nätverksanrop. Det enda som lämnar
 * webbläsaren är en anonym räknare (POST /api/foretagsskannern/spar, inga
 * personuppgifter, inget filinnehåll) och — om kunden själv väljer det — ett
 * handoff-underlag till onboardingen via sessionStorage (skrivUnderlag).
 *
 * Ingen trial, inga agenter — bara räknefrågor och ett ärligt resultat.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, ChevronDown, Check, ArrowRight, AlertTriangle, RotateCcw } from 'lucide-react'
import { parseCsvCustomers } from '@/lib/customers/csv'
import {
  skannaKundlista,
  skannaFakturor,
  byggFynd,
  skrivUnderlag,
  type SkannadKund,
  type SkannaKundlistaResultat,
  type SkannaFakturorResultat,
  type ForetagsskannernFynd,
} from '@/lib/foretagsskannern/skanna'

const MAX_FIL_BYTES = 2 * 1024 * 1024
const RAD_INTERVALL_MS = 500

type Vy = 'ladda-upp' | 'resultat'

/** Best-effort, anonym räknare — får aldrig blockera eller synas för besökaren om den misslyckas. */
function sparRaknare(steg: 'skannad' | 'konto', kunder: number, fakturor: number) {
  fetch('/api/foretagsskannern/spar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ steg, kunder, fakturor }),
  }).catch(() => { /* tyst — bara en räknare */ })
}

export default function ForetagsskannernPage() {
  const router = useRouter()
  const [vy, setVy] = useState<Vy>('ladda-upp')
  const [visarExportinfo, setVisarExportinfo] = useState(false)

  const [kundFel, setKundFel] = useState<string | null>(null)
  const [kundLaser, setKundLaser] = useState(false)
  const [kundFilnamn, setKundFilnamn] = useState<string | null>(null)
  const [kundRader, setKundRader] = useState<SkannadKund[]>([])
  const [kundResultat, setKundResultat] = useState<SkannaKundlistaResultat | null>(null)

  const [fakturaFel, setFakturaFel] = useState<string | null>(null)
  const [fakturaLaser, setFakturaLaser] = useState(false)
  const [fakturaFilnamn, setFakturaFilnamn] = useState<string | null>(null)
  const [fakturaResultat, setFakturaResultat] = useState<SkannaFakturorResultat | null>(null)

  const [fynd, setFynd] = useState<ForetagsskannernFynd[]>([])
  const [visadeRader, setVisadeRader] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)

  const kundInputRef = useRef<HTMLInputElement>(null)
  const fakturaInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    } catch { /* saknat stöd — animeras som vanligt */ }
  }, [])

  const handleKundFil = useCallback(async (file: File) => {
    setKundFel(null)
    if (file.size > MAX_FIL_BYTES) {
      setKundFel('Filen är för stor (max 2 MB). Exportera en mindre kundlista och försök igen.')
      return
    }
    setKundLaser(true)
    try {
      const text = await file.text()
      const rader = parseCsvCustomers(text)
      if (rader.length === 0) {
        setKundFel('Hittade inga kunder i filen. Kontrollera att första raden har rubriker (Namn, Telefon, …) och att det finns minst en kundrad.')
        setKundRader([]); setKundResultat(null); setKundFilnamn(null)
        return
      }
      setKundRader(rader)
      setKundResultat(skannaKundlista(text))
      setKundFilnamn(file.name)
    } catch (e) {
      setKundFel(e instanceof Error ? e.message : 'Kunde inte läsa filen. Kontrollera att den är en giltig CSV-export.')
      setKundRader([]); setKundResultat(null); setKundFilnamn(null)
    } finally {
      setKundLaser(false)
    }
  }, [])

  const handleFakturaFil = useCallback(async (file: File) => {
    setFakturaFel(null)
    if (file.size > MAX_FIL_BYTES) {
      setFakturaFel('Filen är för stor (max 2 MB).')
      return
    }
    setFakturaLaser(true)
    try {
      const text = await file.text()
      const resultat = skannaFakturor(text)
      if (resultat === null) {
        setFakturaFel('Kunde inte läsa fakturafilen — kontrollera att den har kolumner för fakturanummer, förfallodatum, belopp eller betald-status.')
        setFakturaResultat(null); setFakturaFilnamn(null)
        return
      }
      setFakturaResultat(resultat)
      setFakturaFilnamn(file.name)
    } catch (e) {
      setFakturaFel(e instanceof Error ? e.message : 'Kunde inte läsa fakturafilen. Kontrollera att den är en giltig CSV-export.')
      setFakturaResultat(null); setFakturaFilnamn(null)
    } finally {
      setFakturaLaser(false)
    }
  }, [])

  function startSkanning() {
    if (!kundResultat) return
    const rader = byggFynd(kundResultat, fakturaResultat, new Date())
    setFynd(rader)
    setVisadeRader(reducedMotion ? rader.length : 0)
    setVy('resultat')
    sparRaknare('skannad', kundResultat.kunder, fakturaResultat?.fakturor ?? 0)
  }

  // Rad-för-rad-avslöjandet, samma känsla som components/tour/CompanyScan.tsx
  // — men helt utan nätverk, allt ligger redan i minnet.
  useEffect(() => {
    if (vy !== 'resultat' || reducedMotion) return
    if (visadeRader >= fynd.length) return
    const t = setTimeout(() => setVisadeRader(v => v + 1), RAD_INTERVALL_MS)
    return () => clearTimeout(t)
  }, [vy, reducedMotion, visadeRader, fynd.length])

  function borjaOm() {
    setVy('ladda-upp')
    setKundFel(null); setKundLaser(false); setKundFilnamn(null); setKundRader([]); setKundResultat(null)
    setFakturaFel(null); setFakturaLaser(false); setFakturaFilnamn(null); setFakturaResultat(null)
    setFynd([]); setVisadeRader(0)
    if (kundInputRef.current) kundInputRef.current.value = ''
    if (fakturaInputRef.current) fakturaInputRef.current.value = ''
  }

  function skapaKontoMedUnderlag() {
    skrivUnderlag(kundRader, fynd)
    sparRaknare('konto', kundResultat?.kunder ?? 0, fakturaResultat?.fakturor ?? 0)
    router.push('/registrera?via=skanner')
  }

  const klarAttSkanna = kundResultat !== null && kundResultat.kunder > 0
  const fardigMedAnimation = visadeRader >= fynd.length

  return (
    <div className="ob-page">
      <div className="ob-card-wrap" data-wide="true" style={{ maxWidth: 560 }}>
        <div className="ob-screen">
          <div className="ob-body" style={{ paddingTop: 28 }}>
            {vy === 'ladda-upp' && (
              <>
                <h1 className="ob-headline">Se vad Handymate hittar i din firma. På tio sekunder, utan konto.</h1>
                <p className="ob-sub">Filen läses i din webbläsare och skickas ingenstans.</p>

                <FilRuta
                  titel="Kundlista (CSV)"
                  beskrivning="Obligatorisk — namn, telefon och e-post om du har det."
                  obligatorisk
                  filnamn={kundFilnamn}
                  laser={kundLaser}
                  fel={kundFel}
                  onFil={handleKundFil}
                  inputRef={kundInputRef}
                  antalRader={kundResultat?.kunder}
                />

                <div style={{ marginTop: 16 }}>
                  <FilRuta
                    titel="Fakturor (CSV)"
                    beskrivning="Valfri — från Fortnox eller Visma."
                    filnamn={fakturaFilnamn}
                    laser={fakturaLaser}
                    fel={fakturaFel}
                    onFil={handleFakturaFil}
                    inputRef={fakturaInputRef}
                    antalRader={fakturaResultat?.fakturor}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setVisarExportinfo(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, marginTop: 14,
                    background: 'none', border: 'none', padding: '6px 2px',
                    color: 'var(--ob-primary-700)', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                  aria-expanded={visarExportinfo}
                >
                  <ChevronDown size={16} style={{ transform: visarExportinfo ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                  Så exporterar du från Fortnox/Visma
                </button>
                {visarExportinfo && (
                  <div className="ob-card" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55, color: 'var(--ob-ink-2)' }}>
                    <p style={{ margin: '0 0 8px' }}><b>Fortnox:</b> Register → Kunder → Skriv ut/Exportera → CSV. Fakturor: Fakturering → Fakturor → Exportera.</p>
                    <p style={{ margin: 0 }}><b>Visma:</b> Kund- och leverantörsregister → Exportera. Fakturor: Sök/Bläddra → Exportera till Excel/CSV.</p>
                  </div>
                )}

                <button
                  type="button"
                  className="ob-cta"
                  style={{ marginTop: 22 }}
                  disabled={!klarAttSkanna}
                  onClick={startSkanning}
                >
                  Visa vad vi hittar <ArrowRight size={18} />
                </button>
              </>
            )}

            {vy === 'resultat' && (
              <>
                <h1 className="ob-headline" style={{ fontSize: 22 }}>
                  {fardigMedAnimation ? 'Det här hittade vi i din firma' : 'Skannar din firma …'}
                </h1>
                <p className="ob-sub">Bara det som faktiskt finns i filerna — inget gissat.</p>

                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {fynd.slice(0, visadeRader).map(rad => (
                    <li key={rad.key} className="ob-card" style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <Check size={18} style={{ color: 'var(--ob-primary-700)', flexShrink: 0, marginTop: 1 }} />
                        <div>
                          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: 'var(--ob-ink)' }}>{rad.text}</p>
                          {rad.uppfoljning && (
                            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--ob-muted)' }}>{rad.uppfoljning}</p>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                {fynd.length === 0 && fardigMedAnimation && (
                  <p style={{ color: 'var(--ob-muted)', fontSize: 14 }}>Vi hittade inga tydliga fynd i filen — men kontot väntar när du är redo.</p>
                )}
              </>
            )}
          </div>

          {vy === 'resultat' && fardigMedAnimation && (
            <div className="ob-footer">
              <button type="button" className="ob-cta" onClick={skapaKontoMedUnderlag}>
                Skapa konto och ta med underlaget <ArrowRight size={18} />
              </button>
              <button type="button" className="ob-cta ghost" onClick={borjaOm}>
                <RotateCcw size={16} /> Börja om
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FilRuta({
  titel,
  beskrivning,
  obligatorisk,
  filnamn,
  laser,
  fel,
  onFil,
  inputRef,
  antalRader,
}: {
  titel: string
  beskrivning: string
  obligatorisk?: boolean
  filnamn: string | null
  laser: boolean
  fel: string | null
  onFil: (file: File) => void
  inputRef: React.RefObject<HTMLInputElement>
  antalRader?: number
}) {
  const [dragOver, setDragOver] = useState(false)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ob-ink)' }}>{titel}</span>
        {!obligatorisk && <span style={{ fontSize: 11.5, color: 'var(--ob-subtle)' }}>(valfri)</span>}
      </div>
      <p style={{ margin: '0 0 8px', fontSize: 12.5, color: 'var(--ob-muted)' }}>{beskrivning}</p>
      <div
        className={`obi-drop ${dragOver ? 'over' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f) onFil(f)
        }}
        style={{ padding: '20px 16px', minHeight: 0 }}
      >
        {laser ? (
          <div className="obi-drop-title">Läser filen …</div>
        ) : filnamn ? (
          <>
            <Check size={22} style={{ color: 'var(--ob-primary-700)', marginBottom: 6 }} />
            <div className="obi-drop-title">{filnamn}</div>
            {typeof antalRader === 'number' && (
              <div className="obi-drop-or">{antalRader.toLocaleString('sv-SE')} rader inlästa</div>
            )}
            <span className="obi-pickbtn"><FileSpreadsheet size={14} /> Byt fil</span>
          </>
        ) : (
          <>
            <div className="obi-drop-ic"><Upload size={28} /></div>
            <div className="obi-drop-title">Dra och släpp, eller</div>
            <span className="obi-pickbtn"><FileSpreadsheet size={14} /> Välj fil</span>
            <div className="obi-hint">CSV, max 2 MB</div>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFil(f) }}
      />
      {fel && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8, fontSize: 12.5, color: 'var(--ob-amber-600)' }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{fel}</span>
        </div>
      )}
    </div>
  )
}
