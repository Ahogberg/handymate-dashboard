'use client'

/**
 * StepGenomgang — "Här är vad teamet hittade i din firma" (onboarding-steg,
 * MELLAN import och betalning; tasks/plan-genomgang-fore-betalning.md,
 * 2026-09-02).
 *
 * Beslut: betalningen ligger EFTER importen och en genomgång av kundens egen
 * firma, byggd på riktiga tal — samma källa och samma buildScanRows som
 * dashboardens Company Scan (lib/onboarding/company-scan-rows.ts) — så
 * kunden betalar för något den redan sett i sina egna siffror. Ingen AI,
 * ingen prova-på: bara räknefrågor mot GET /api/onboarding/company-scan.
 *
 * Tom lista (ny firma, misslyckad läsning, en ägargrindad 403) visar en
 * ärlig "Inget att gå igenom än" — ALDRIG påhittade rader. Ingen skip-länk:
 * genomgången är kort nog att alltid visas, och "Vidare till aktivering" är
 * redan en fortsättning även när listan är tom.
 */

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import OnboardingHeader from './OnboardingHeader'
import { OB_DOTS, OB_DOT_TOTAL } from '../constants'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { buildScanRows, teamGorNarDuAktiverar, type ScanRow } from '@/lib/onboarding/company-scan-rows'
import type { CompanyScanResult } from '@/app/api/onboarding/company-scan/route'
import type { OnboardingFormData } from '../types-redesign'

interface Props {
  onNext: () => void
  onBack: () => void
  data: OnboardingFormData
  setData: (updater: (d: OnboardingFormData) => OnboardingFormData) => void
}

/**
 * Säkerhetsnät (B7-mönstret, samma som Company Scan/instant-value):
 * hämtningen får max 5 s innan vi visar tom-läget i stället för att fastna
 * i "Matte går igenom firman …".
 */
const HANG_TIMEOUT_MS = 5000

export default function StepGenomgang({ onNext, onBack, data, setData }: Props) {
  const [rows, setRows] = useState<ScanRow[] | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    const controller = new AbortController()
    const watchdog = setTimeout(() => controller.abort(), HANG_TIMEOUT_MS)
    fetch('/api/onboarding/company-scan', { signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((json: CompanyScanResult | null) => {
        clearTimeout(watchdog)
        const found = json ? buildScanRows(json) : []
        setRows(found)
        setData(d => ({ ...d, genomgang: found }))
      })
      .catch(() => {
        // Nätverksfel, avbrutet av vakthunden, eller ett fel svar — samma
        // ärliga tom-läge som en 403/ny firma. Aldrig en påhittad rad.
        clearTimeout(watchdog)
        setRows([])
        setData(d => ({ ...d, genomgang: [] }))
      })
    return () => { clearTimeout(watchdog); controller.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="ob-screen">
      <OnboardingHeader step={OB_DOTS.genomgang} total={OB_DOT_TOTAL} onBack={onBack} />
      <div className="ob-body">
        {rows === null ? (
          <div
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', minHeight: '100%', gap: 14,
            }}
          >
            <span className="animate-pulse"><AgentAvatar agentKey="matte" size="lg" /></span>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--ob-ink)' }}>
              Matte går igenom firman …
            </p>
          </div>
        ) : rows.length === 0 ? (
          <>
            <h1 className="ob-headline">Inget att gå igenom än</h1>
            <p className="ob-sub">
              Teamet börjar med din första offert så fort du aktiverat. Har du
              kunder eller fakturor i ett annat system kan du importera dem
              senare under Kunder.
            </p>
          </>
        ) : (
          <>
            <h1 className="ob-headline">Här är vad teamet hittade i din firma</h1>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
              {rows.map(row => {
                const uppfoljning = teamGorNarDuAktiverar(row)
                return (
                  <div
                    key={row.key}
                    className="ob-card"
                    style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}
                  >
                    {row.agent ? (
                      <AgentAvatar agentKey={row.agent} size="sm" />
                    ) : (
                      <span
                        style={{
                          width: 28, height: 28, flexShrink: 0, borderRadius: '50%',
                          background: 'var(--ob-primary-50)', color: 'var(--ob-primary-700)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Check size={15} strokeWidth={2.6} />
                      </span>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ob-ink)' }}>
                        {row.text}
                      </p>
                      {uppfoljning && (
                        <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--ob-muted)', lineHeight: 1.4 }}>
                          {uppfoljning}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
      <div className="ob-footer">
        <button type="button" className="ob-cta" onClick={onNext}>
          Vidare till aktivering <ArrowRight size={18} />
        </button>
      </div>
    </div>
  )
}
