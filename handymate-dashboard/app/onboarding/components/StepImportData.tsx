'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  Loader2,
  Upload,
  Link2,
  Zap,
} from 'lucide-react'
import OnboardingHeader from './OnboardingHeader'
import type { OnboardingFormData } from '../types-redesign'

/**
 * StepImportData — "Hämta in din verksamhet" (onboarding-steg 5, efter betalning).
 *
 * BACKEND-ÄGD, FUNGERANDE men enkelt stylad. Claude Design äger den visuella
 * ytan (states A–E i tasks/onboarding-import-brief.md) och förfinar layout/copy —
 * men rör INTE logiken eller API-anropen här.
 *
 * Flöde:
 *   - Val-skärm: Koppla Fortnox / Ladda upp kundlista / Hoppa över.
 *   - Fortnox: redirect till OAuth (?return=onboarding). Vid retur landar vi
 *     tillbaka här med ?fortnox=connected → kör kund- + fakturaimport och visar
 *     siffrorna.
 *   - CSV: minimal inline fil→POST /api/customers/import (Design byter senare
 *     till den fullständiga wizarden på /dashboard/customers/import).
 *   - Hoppa över blockerar ALDRIG — alltid tillgängligt.
 */

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

export default function StepImportData({ onNext, onBack, data, setData }: Props) {
  const [view, setView] = useState<View>('choose')
  const [error, setError] = useState<string | null>(null)
  const [fortnoxResult, setFortnoxResult] = useState<FortnoxResult | null>(null)
  const [csvCount, setCsvCount] = useState(0)
  const [csvBusy, setCsvBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importStartedRef = useRef(false)

  /**
   * Kör kund- + fakturaimport i sekvens (kunder FÖRST så fakturor kan kopplas).
   * Aldrig blockerande: fel → mjuk CSV-fallback via felruta + val-skärm.
   */
  const runFortnoxImport = useCallback(async () => {
    setView('fortnox-loading')
    setError(null)
    try {
      const custRes = await fetch('/api/fortnox/import/customers', { method: 'POST' })
      const cust = await custRes.json().catch(() => ({}))
      if (!custRes.ok) {
        throw new Error(cust?.error ?? 'Kunde inte hämta kunder från Fortnox')
      }

      const invRes = await fetch('/api/fortnox/import/invoices', { method: 'POST' })
      const inv = await invRes.json().catch(() => ({}))
      if (!invRes.ok) {
        throw new Error(inv?.error ?? 'Kunde inte hämta fakturor från Fortnox')
      }

      const result: FortnoxResult = {
        customers: Number(cust?.imported ?? 0),
        invoices: Number(inv?.imported ?? 0),
        outstandingKr: Number(inv?.total_outstanding_kr ?? 0),
      }
      setFortnoxResult(result)
      setData(d => ({ ...d, importedCustomers: result.customers, importedInvoices: result.invoices }))
      setView('fortnox-done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Något gick fel vid hämtningen')
      // Mjuk fallback: tillbaka till val-skärmen där CSV finns.
      setView('choose')
    }
  }, [setData])

  // Retur från Fortnox-OAuth: callbacken landar på /onboarding?fortnox=connected.
  // Kör importen automatiskt en gång, städa sedan URL:en.
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
    // Redirect till OAuth med retur till onboarding. Vid retur körs importen.
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
      if (!res.ok) {
        throw new Error(d?.error ?? 'Import misslyckades')
      }
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

  return (
    <div className="ob-screen">
      <OnboardingHeader step={5} total={7} onBack={onBack} onSkip={onNext} />
      <div className="ob-body">
        <h1 className="ob-headline">Låt ditt AI-team börja jobba direkt</h1>
        <p className="ob-sub">
          Hämta in dina kunder och obetalda fakturor — så börjar dina AI-kollegor
          jobba på din verksamhet från minut ett.
        </p>

        {error && (
          <div
            style={{
              background: 'var(--ob-rose-50)',
              border: '1px solid #FECACA',
              borderRadius: 'var(--ob-r-md)',
              padding: 10,
              fontSize: 13,
              color: '#B91C1C',
              marginBottom: 16,
              lineHeight: 1.4,
            }}
          >
            {error} Du kan ladda upp en kundlista i stället, eller hoppa över.
          </div>
        )}

        {/* A. Val-skärm */}
        {view === 'choose' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
              <ChoiceCard
                icon={<Link2 size={22} strokeWidth={2.2} />}
                title="Koppla Fortnox"
                subtitle="Hämtar dina kunder och obetalda fakturor automatiskt."
                badge="Rekommenderat"
                onClick={connectFortnox}
              />
              <ChoiceCard
                icon={<Upload size={22} strokeWidth={2.2} />}
                title="Ladda upp kundlista"
                subtitle="Har du en CSV/Excel-fil? Vi läser in den åt dig."
                onClick={() => setView('csv')}
              />
            </div>

            <UnlockRow />

            <button
              type="button"
              onClick={onNext}
              style={{
                display: 'block',
                margin: '18px auto 0',
                background: 'transparent',
                border: 0,
                color: 'var(--ob-muted)',
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Hoppa över — jag gör det senare
            </button>
          </>
        )}

        {/* B. Fortnox — hämtar */}
        {view === 'fortnox-loading' && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <Loader2
              size={36}
              className="animate-spin"
              style={{ color: 'var(--ob-primary-700)', margin: '0 auto 16px' }}
            />
            <p style={{ fontSize: 15, color: 'var(--ob-ink)', fontWeight: 600 }}>
              Hämtar din verksamhet från Fortnox…
            </p>
            <p style={{ fontSize: 13, color: 'var(--ob-ink-2)', marginTop: 6 }}>
              Vi läser in dina kunder och obetalda fakturor.
            </p>
          </div>
        )}

        {/* C. Fortnox — klart */}
        {view === 'fortnox-done' && fortnoxResult && (
          <SuccessBlock
            lines={[
              `${fortnoxResult.customers} kunder`,
              `${fortnoxResult.invoices} obetalda fakturor`,
              `${fortnoxResult.outstandingKr.toLocaleString('sv-SE')} kr utestående`,
            ]}
            karin={fortnoxResult.invoices > 0}
            karinCount={fortnoxResult.invoices}
          />
        )}

        {/* D. CSV-import (minimal inline) */}
        {view === 'csv' && (
          <div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  fileInputRef.current?.click()
                }
              }}
              style={{
                border: '1.5px dashed var(--ob-border)',
                borderRadius: 'var(--ob-r-lg)',
                padding: '28px 18px',
                textAlign: 'center',
                cursor: csvBusy ? 'default' : 'pointer',
                background: 'var(--ob-surface)',
              }}
            >
              {csvBusy ? (
                <Loader2 size={28} className="animate-spin" style={{ color: 'var(--ob-primary-700)' }} />
              ) : (
                <>
                  <Upload size={28} style={{ color: 'var(--ob-primary-700)', marginBottom: 8 }} />
                  <p style={{ fontSize: 14, color: 'var(--ob-ink)', fontWeight: 600 }}>
                    Välj CSV-fil med dina kunder
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--ob-muted)', marginTop: 4 }}>
                    Kolumner: namn, telefon, e-post, adress
                  </p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handleCsvFile(f)
              }}
            />
            <button
              type="button"
              onClick={() => setView('choose')}
              style={{
                display: 'block',
                margin: '16px auto 0',
                background: 'transparent',
                border: 0,
                color: 'var(--ob-muted)',
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Tillbaka till valen
            </button>
          </div>
        )}

        {/* CSV klart */}
        {view === 'csv-done' && (
          <SuccessBlock lines={[`${csvCount} kunder inlästa`]} karin={false} karinCount={0} />
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

/**
 * Minimal CSV-parser för onboarding-fallbacken. Auto-mappar vanliga svenska/
 * engelska kolumnnamn. Design byter senare till den fullständiga wizarden
 * (/dashboard/customers/import) med drop-zon + kolumnmappning.
 */
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

  // Om ingen header känns igen: anta att raderna redan är data (namn i kol 0).
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

function ChoiceCard({
  icon,
  title,
  subtitle,
  badge,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  badge?: string
  onClick: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        padding: 16,
        background: 'var(--ob-surface)',
        border: '1.5px solid var(--ob-border)',
        borderRadius: 'var(--ob-r-lg)',
        cursor: 'pointer',
        position: 'relative',
        textAlign: 'left',
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          flexShrink: 0,
          borderRadius: 'var(--ob-r-md)',
          background: 'var(--ob-primary-50)',
          color: 'var(--ob-primary-700)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <strong style={{ fontSize: 15, color: 'var(--ob-ink)' }}>{title}</strong>
          {badge && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: '#fff',
                background: 'var(--ob-primary-700)',
                borderRadius: 'var(--ob-r-pill)',
                padding: '2px 8px',
              }}
            >
              {badge}
            </span>
          )}
        </div>
        <p style={{ fontSize: 13, color: 'var(--ob-ink-2)', lineHeight: 1.4 }}>{subtitle}</p>
      </div>
      <ArrowRight size={18} style={{ color: 'var(--ob-muted)', flexShrink: 0, marginTop: 4 }} />
    </div>
  )
}

function UnlockRow() {
  const items = [
    'Karin jagar dina obetalda fakturor',
    'Hanna väcker vilande kunder',
    'Daniel följer upp dina offerter',
  ]
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '12px 14px',
        background: 'var(--ob-primary-50)',
        border: '1px solid var(--ob-primary-100)',
        borderRadius: 'var(--ob-r-md)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ob-primary-700)', marginBottom: 2 }}>
        Det här låser upp
      </div>
      {items.map(t => (
        <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={13} style={{ color: 'var(--ob-primary-700)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--ob-ink-2)' }}>{t}</span>
        </div>
      ))}
    </div>
  )
}

function SuccessBlock({
  lines,
  karin,
  karinCount,
}: {
  lines: string[]
  karin: boolean
  karinCount: number
}) {
  return (
    <div style={{ padding: '8px 0' }}>
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'var(--ob-primary-700)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}
      >
        <Check size={28} strokeWidth={2.5} />
      </div>
      <p style={{ fontSize: 15, color: 'var(--ob-ink)', textAlign: 'center', lineHeight: 1.5 }}>
        Vi hämtade{' '}
        {lines.map((l, i) => (
          <span key={l}>
            <strong>{l}</strong>
            {i < lines.length - 1 ? ' och ' : ''}
          </span>
        ))}
        .
      </p>
      {karin && (
        <div
          style={{
            marginTop: 16,
            padding: '12px 14px',
            background: 'var(--ob-primary-50)',
            border: '1px solid var(--ob-primary-100)',
            borderRadius: 'var(--ob-r-md)',
            fontSize: 13,
            color: 'var(--ob-ink-2)',
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: 'var(--ob-primary-700)' }}>Karin är redan igång.</strong> Hon
          har förberett påminnelser på dina {karinCount} förfallna fakturor — du godkänner dem på
          dashboarden.
        </div>
      )}
    </div>
  )
}
