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
import { Check } from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { fmt } from '@/lib/onboarding/instant-value'
import type { CompanyScanResult } from '@/app/api/onboarding/company-scan/route'

const SEEN_KEY = 'hm_scan_klar'
/** Tid mellan varje ✓-rad. */
const ROW_INTERVAL_MS = 700
/** Säkerhetsnät (B7-mönstret): både nätverkshämtningen och varje enskild
 *  rad-timer får max 5 s innan skannen tvingas vidare i stället för att
 *  fastna. */
const HANG_TIMEOUT_MS = 5000

interface ScanRow {
  key: string
  text: string
  agent?: 'karin' | 'daniel' | 'lars'
}

/**
 * Bygger raderna ur de råa talen. Bara sanna rader (n>0) — funktionen är
 * ren och testbar utan React/DOM (facit-stilen, se tests/company-scan.spec.ts).
 */
export function buildScanRows(d: CompanyScanResult): ScanRow[] {
  const rows: ScanRow[] = []
  if (d.customerCount > 0) {
    rows.push({ key: 'kunder', text: `${fmt(d.customerCount)} kund${d.customerCount > 1 ? 'er' : ''} hittade` })
  }
  if (d.openInvoicesCount > 0) {
    rows.push({ key: 'fakturor', text: `${fmt(d.openInvoicesCount)} öppna faktur${d.openInvoicesCount > 1 ? 'or' : 'a'} analyserade` })
  }
  if (d.activeProjectsCount > 0) {
    rows.push({ key: 'projekt', text: `${fmt(d.activeProjectsCount)} pågående projekt identifierade` })
  }
  if (d.openQuotesCount > 0) {
    rows.push({ key: 'offerter', text: `${fmt(d.openQuotesCount)} offert${d.openQuotesCount > 1 ? 'er' : ''} hittade` })
  }
  // Karins rad är uttryckligen HENNES fynd — rutten sätter karinHeadline
  // bara när headline verkligen är Karins (förfallet/obetalt > 0), aldrig
  // Daniels/Hannas/Lisas generiska fallback under en Karin-etikett.
  if (d.karinHeadline?.amount_kr) {
    rows.push({ key: 'karin', agent: 'karin', text: `Karin hittade ${fmt(d.karinHeadline.amount_kr)} kr i utestående kundfordringar` })
  }
  if (d.staleQuotesCount > 0) {
    rows.push({ key: 'daniel', agent: 'daniel', text: `Daniel hittade ${fmt(d.staleQuotesCount)} offert${d.staleQuotesCount > 1 ? 'er' : ''} som borde följas upp` })
  }
  if (d.activeProjectsCount > 0) {
    rows.push({ key: 'lars', agent: 'lars', text: `Lars bevakar ${fmt(d.activeProjectsCount)} aktiv${d.activeProjectsCount > 1 ? 'a' : 't'} projekt` })
  }
  // Kön, sist — pekar framåt mot "Det här behöver dig idag".
  if (d.pendingApprovalsCount > 0) {
    rows.push({ key: 'ko', text: `${fmt(d.pendingApprovalsCount)} sak${d.pendingApprovalsCount > 1 ? 'er' : ''} behöver din uppmärksamhet` })
  }
  return rows
}

export default function CompanyScan({ onClose }: { onClose: () => void }) {
  const business = useBusiness()
  const [active, setActive] = useState(false)
  const [data, setData] = useState<CompanyScanResult | null>(null)
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

  const isEmpty = data !== null && data.customerCount === 0
  const rows = data && !isEmpty ? buildScanRows(data) : []

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
              <button
                type="button"
                onClick={finish}
                className="px-4 py-2 rounded-full bg-primary-700 text-white text-sm font-semibold min-h-[40px]"
              >
                Visa mig
              </button>
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
            {finished && (
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
