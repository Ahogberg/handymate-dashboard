'use client'

/**
 * CompanyScan — det allra första som händer på dashboarden efter en
 * importerad firma (tasks/jaunty-pondering-hummingbird.md). Matte sätter upp
 * firman med animerade ✓-rader byggda på RIKTIGA tal ur databasen — aldrig
 * påhittade, aldrig en rad med n=0 (antiklimax utelämnas hellre än visas) —
 * och landar i "Handymate är igång. Här är vad teamet hittade." FÖRST
 * DÄREFTER släpps Hemturen fram: kedjningen bor i
 * components/jarvis/JarvisHome.tsx, som bara renderar <HemTur /> efter att
 * den här komponenten anropat `onClose` (klar, hoppad, eller aldrig
 * aktuell — samma callback i alla tre fallen).
 *
 * GATE: `business_config.welcome_tour_seen IS NULL` (samma fält Hemturen
 * gate:ar på — skannen hör hemma i exakt samma "första besöket"-fönster)
 * OCH `localStorage['hm_scan_klar']` saknas. Skannen skriver ALDRIG
 * welcome_tour_seen — den flaggan äger Hemturen ensam (se HemTur.tsx).
 *
 * FAIL-SAFE: en ägargrindad 403 (anställd utan see_financials), ett
 * nätverksfel eller en hängande request hoppar HELA skannen tyst — utan att
 * skriva hm_scan_klar, så nästa inloggning får ett nytt försök. Bara en
 * skanning användaren faktiskt SÅG (klarmarkerad eller explicit "Hoppa
 * över") räknas som sedd och spärrar återvisning.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { buildScanRows } from '@/lib/onboarding/company-scan-rows'
import type { CompanyScanResult } from '@/app/api/onboarding/company-scan/route'
import type { FirstActionResponse } from '@/app/api/onboarding/first-action/route'

// Flyttad till lib/onboarding/company-scan-rows.ts (2026-09-02) så
// StepGenomgang (onboardingens genomgång FÖRE betalningen) kan återanvända
// exakt samma logik utan att importera en klientkomponent. Re-exporterad
// härifrån OFÖRÄNDRAT så tests/company-scan.spec.ts (som importerar från
// den här filen) fortsätter fungera.
export { buildScanRows } from '@/lib/onboarding/company-scan-rows'

const SEEN_KEY = 'hm_scan_klar'
/**
 * Första verifierade handlingen (2026-08-27): skanningen ber POST
 * /api/onboarding/first-action välja EN riktig sak (Karins förfallna
 * faktura, Daniels väntande offert) och skapa kortet — så slutknappen blir
 * "Börja med Andersson →" i stället för "Visa mig". Kill-switch: false ⇒
 * exakt dagens beteende, inget anrop görs.
 */
const FORSTA_ATGARD_PA = true

export interface CompanyScanCloseResult {
  /** Id på kortet skanningen skapade och kunden valde att börja med. */
  firstActionId?: string
}
/** Tid mellan varje ✓-rad. */
const ROW_INTERVAL_MS = 700
/** Säkerhetsnät (B7-mönstret): både nätverkshämtningen och varje enskild
 *  rad-timer får max 5 s innan skannen tvingas vidare i stället för att
 *  fastna. */
const HANG_TIMEOUT_MS = 5000

export default function CompanyScan({ onClose }: { onClose: (r?: CompanyScanCloseResult) => void }) {
  const business = useBusiness()
  const [active, setActive] = useState(false)
  const [data, setData] = useState<CompanyScanResult | null>(null)
  // null = inget svar än (eller avstängt/misslyckat → dagens "Visa mig").
  const [firstAction, setFirstAction] = useState<FirstActionResponse | null>(null)
  const [visibleCount, setVisibleCount] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const finishedRef = useRef(false)
  // onClose i en ref: effekterna nedan ska inte behöva lista den föränderliga
  // funktionen som beroende (samma mönster som flushRef i JarvisHome.tsx).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    try {
      setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    } catch { /* saknat stöd — animeras som vanligt */ }
  }, [])

  function skipQuiet() {
    // Systeminitierad (grind stängd/redan sedd, 403, nätverksfel, hängande
    // request) — stängs UTAN att skriva hm_scan_klar. Användaren såg aldrig
    // något, så nästa inloggning ska få ett nytt, ärligt försök.
    if (finishedRef.current) return
    finishedRef.current = true
    setActive(false)
    onCloseRef.current()
  }

  function finish() {
    // Användarinitierat avslut (klar med sista raden, eller "Hoppa över") —
    // spärrar återvisning i den här webbläsaren.
    if (finishedRef.current) return
    finishedRef.current = true
    setActive(false)
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch { /* best effort — se HemTur.tsx för samma resonemang */ }
    onCloseRef.current()
  }
  /** Som finish(), men berättar för JarvisHome vilket kort kunden valde att börja med. */
  function finishMed(firstActionId: string) {
    if (finishedRef.current) return
    finishedRef.current = true
    setActive(false)
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch { /* best effort */ }
    onCloseRef.current({ firstActionId })
  }

  // ═══ GRINDEN ═══ — samma fält som Hemturen (business.welcome_tour_seen),
  // egen localStorage-nyckel så skannen och turen kan spåras oberoende.
  useEffect(() => {
    if (finishedRef.current) return
    if (business.welcome_tour_seen) { skipQuiet(); return }
    try {
      if (localStorage.getItem(SEEN_KEY)) { skipQuiet(); return }
    } catch {
      // Trasig/blockerad localStorage — fail-safe: hoppa skannen snarare än
      // en som inte kan komma ihåg att den visats.
      skipQuiet()
      return
    }
    setActive(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.welcome_tour_seen])

  // Hämtningen — ägargrindad precis som instant-value. Ett vakthundstimeout
  // täcker en request som aldrig svarar (varken .then eller .catch triggas).
  useEffect(() => {
    if (!active) return
    let cancelled = false
    const watchdog = setTimeout(() => { if (!cancelled) skipQuiet() }, HANG_TIMEOUT_MS)
    fetch('/api/onboarding/company-scan')
      .then(r => (r.ok ? r.json() : null))
      .then((json: CompanyScanResult | null) => {
        clearTimeout(watchdog)
        if (cancelled) return
        if (!json) { skipQuiet(); return } // 403/annat fel → hoppa hela skannen
        setData(json)
      })
      .catch(() => { clearTimeout(watchdog); if (!cancelled) skipQuiet() })
    return () => { cancelled = true; clearTimeout(watchdog) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // Första verifierade handlingen — parallellt med radanimationen, egen
  // vakthund. Allt annat än ett tydligt svar ⇒ null ⇒ dagens "Visa mig".
  useEffect(() => {
    if (!active || !data || !FORSTA_ATGARD_PA) return
    let cancelled = false
    const watchdog = setTimeout(() => { cancelled = true }, HANG_TIMEOUT_MS)
    fetch('/api/onboarding/first-action', { method: 'POST' })
      .then(r => (r.ok ? r.json() : null))
      .then((json: FirstActionResponse | null) => {
        clearTimeout(watchdog)
        if (cancelled || !json || !json.kind) return
        setFirstAction(json)
      })
      .catch(() => { clearTimeout(watchdog) })
    return () => { cancelled = true; clearTimeout(watchdog) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, data])

  const isEmpty = data !== null && data.customerCount === 0
  const rows = data && !isEmpty ? buildScanRows(data) : []
  const forstaKort = firstAction && firstAction.kind && firstAction.kind !== 'skapa_kund' && firstAction.approvalId ? firstAction : null
  const skapaKund = firstAction && firstAction.kind === 'skapa_kund' && firstAction.href ? firstAction : null

  // Rad-för-rad-avslöjandet. prefers-reduced-motion visar allt direkt, utan
  // en enda timer i den vägen.
  useEffect(() => {
    if (!active || !data || isEmpty) return
    if (reducedMotion) { setVisibleCount(rows.length); return }
    if (visibleCount >= rows.length) return
    const t = setTimeout(() => setVisibleCount(v => v + 1), ROW_INTERVAL_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, data, isEmpty, reducedMotion, visibleCount, rows.length])

  // Säkerhetsnätet (B7-mönstret): hänger en enskild rad-timer kvar över 5 s
  // (bakgrundsflik, strypt timer) tvingas nästa rad fram — skannen får
  // aldrig fastna i "Matte sätter upp firman …" för gott.
  useEffect(() => {
    if (!active || !data || isEmpty || reducedMotion) return
    if (visibleCount >= rows.length) return
    const t = setTimeout(() => setVisibleCount(v => Math.min(v + 1, rows.length)), HANG_TIMEOUT_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, data, isEmpty, reducedMotion, visibleCount, rows.length])

  if (!active) return null

  const finished = data !== null && !isEmpty && visibleCount >= rows.length

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/55">
      <div className="w-full max-w-[420px] bg-white rounded-2xl border border-slate-200 shadow-lg p-5">
        <div className="flex justify-end -mt-1 -mr-1 mb-1">
          <button
            type="button"
            onClick={finish}
            className="text-xs text-slate-400 hover:text-slate-600 min-h-[32px] px-2"
          >
            Hoppa över
          </button>
        </div>

        {!data ? (
          <div className="flex items-center gap-3 py-2">
            <span className={reducedMotion ? '' : 'animate-pulse'}>
              <AgentAvatar agentKey="matte" size="lg" />
            </span>
            <p className="m-0 text-[15px] font-semibold text-slate-900">Matte sätter upp firman …</p>
          </div>
        ) : isEmpty ? (
          <div className="flex items-start gap-3 py-2">
            <AgentAvatar agentKey="matte" size="lg" />
            <div>
              <p className="m-0 text-[15px] font-semibold text-slate-900">Teamet är på plats och redo</p>
              <p className="mt-1 mb-4 text-sm text-slate-500">Lägg till din första kund så börjar de jobba.</p>
              {skapaKund ? (
                <Link
                  href={skapaKund.href!}
                  onClick={finish}
                  className="inline-flex items-center px-4 py-2 rounded-full bg-primary-700 text-white text-sm font-semibold min-h-[40px]"
                >
                  {skapaKund.cta ?? 'Lägg till din första kund'} →
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={finish}
                  className="px-4 py-2 rounded-full bg-primary-700 text-white text-sm font-semibold min-h-[40px]"
                >
                  Visa mig
                </button>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className={finished || reducedMotion ? '' : 'animate-pulse'}>
                <AgentAvatar agentKey="matte" size="lg" />
              </span>
              <p className="m-0 text-[15px] font-semibold text-slate-900">
                {finished ? 'Handymate är igång. Här är vad teamet hittade.' : 'Matte sätter upp firman …'}
              </p>
            </div>
            <ul className="list-none p-0 m-0 flex flex-col gap-2.5 mb-4">
              {rows.slice(0, visibleCount).map(row => (
                <li key={row.key} className="flex items-center gap-2">
                  {row.agent && <AgentAvatar agentKey={row.agent} size="sm" />}
                  <Check className="w-4 h-4 text-primary-700 flex-shrink-0" />
                  <span className="text-sm text-slate-700">{row.text}</span>
                </li>
              ))}
            </ul>
            {finished && forstaKort ? (
              <div>
                {/* Första verifierade handlingen: agentens fynd + knappen som
                    ÄR handlingen. Sekundärlänken ger dagens väg (Hemturen). */}
                <div className="flex items-start gap-2.5 mb-3 pt-3 border-t border-slate-100">
                  {forstaKort.agent && forstaKort.agent !== 'matte' && <AgentAvatar agentKey={forstaKort.agent} size="sm" />}
                  <p className="m-0 text-sm font-medium text-slate-800">{forstaKort.headline}</p>
                </div>
                <button
                  type="button"
                  onClick={() => finishMed(forstaKort.approvalId!)}
                  className="w-full px-4 py-2.5 rounded-full bg-primary-700 text-white text-sm font-semibold min-h-[44px]"
                >
                  {forstaKort.cta ?? 'Börja här'} →
                </button>
                <button
                  type="button"
                  onClick={finish}
                  className="w-full mt-2 text-xs text-slate-500 hover:text-slate-700 min-h-[32px]"
                >
                  Visa mig runt först
                </button>
              </div>
            ) : finished && (
              <button
                type="button"
                onClick={finish}
                className="w-full px-4 py-2.5 rounded-full bg-primary-700 text-white text-sm font-semibold min-h-[44px]"
              >
                Visa mig
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
