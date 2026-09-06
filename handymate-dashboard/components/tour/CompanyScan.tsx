'use client'

/**
 * CompanyScan — Företagsskanningen, det allra första som händer på
 * dashboarden efter en importerad firma (tasks/jaunty-pondering-hummingbird.md;
 * omritad 2026-09-06 efter docs/design/skisser-2026-09-06/foretagsskanning.dc.html).
 * Matte går igenom det som kopplats, rad för rad byggd på RIKTIGA tal ur
 * databasen — aldrig påhittade, aldrig en rad med n=0 (antiklimax utelämnas
 * hellre än visas) — och landar i "Handymate är igång. Här är vad teamet
 * hittade." FÖRST DÄREFTER släpps Hemturen fram: kedjningen bor i
 * components/jarvis/JarvisHome.tsx, som bara renderar <HemTur /> efter att
 * den här komponenten anropat `onClose` (klar, hoppad, eller aldrig
 * aktuell — samma callback i alla tre fallen).
 *
 * LAYOUT: på desktop (≥1024 px) två paneler — vänster en teal panel med
 * Matte, "Ge mig 40 sekunder." och listan över vad skanningen går igenom
 * (bockas av i takt med raderna); höger själva raderna med en ärlighets-
 * etikett per rad (Importerat / Möjlighet / Uppskattat, satt av
 * buildScanRows — aldrig av vyn), en förloppsstapel, legend och slutkortet
 * "N saker behöver din uppmärksamhet". På mobil en enda kolumn: kompakt
 * teal topp, samma lista, samma kort, samma knapp.
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
import { buildScanRows, KALLA_LABEL, type ScanKalla, type ScanRow, type ScanSource } from '@/lib/onboarding/company-scan-rows'
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

/**
 * Etikettchipet per rad — skissens tre stilar. Teal är chrome: Möjlighet
 * (en agents bedömning) får primary-tonen, Importerat ligger i slate och
 * Uppskattat är vitt med slate-ram så det aldrig läses som "nästan känt"
 * (docs/design/SYNLIG-INTELLIGENS.md, semantikreglerna).
 */
const KALLA_CHIP: Record<ScanKalla, string> = {
  importerat: 'bg-slate-100 text-slate-600 border-slate-200',
  mojlighet: 'bg-primary-100 text-primary-700 border-primary-200',
  uppskattat: 'bg-white text-slate-500 border-slate-300',
}
const KALLA_LEGEND: Record<ScanKalla, string> = {
  importerat: 'bg-slate-200 border-slate-200',
  mojlighet: 'bg-primary-100 border-primary-200',
  uppskattat: 'bg-white border-slate-300',
}
const KALLA_ORDNING: ScanKalla[] = ['importerat', 'mojlighet', 'uppskattat']

/**
 * Vilken rad som "bockar av" en källa i vänsterpanelen: kundregistret och
 * Fortnox när kundraden kommit, fakturorna när fakturaraden kommit.
 */
const KALLA_KLAR_EFTER: Record<ScanSource['key'], string> = {
  kundregister: 'kunder',
  fortnox: 'kunder',
  fakturor: 'fakturor',
}

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
  const allaRader = data && !isEmpty ? buildScanRows(data) : []
  // Kö-raden renderas EN gång — som slutkortet under listan, inte som en
  // rad i den. Listan (och rad-timern) räknar därför utan den.
  const koRad = allaRader.find(r => r.key === 'ko') ?? null
  const rows = allaRader.filter(r => r.key !== 'ko')
  const sources: ScanSource[] = data?.sources ?? []
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
  const progressPct = rows.length > 0 ? Math.round((Math.min(visibleCount, rows.length) / rows.length) * 100) : finished ? 100 : 0
  const avslojade = new Set(rows.slice(0, visibleCount).map(r => r.key))
  const kallaKlar = (s: ScanSource) => finished || avslojade.has(KALLA_KLAR_EFTER[s.key])
  const rubrik = finished ? 'Handymate är igång.' : 'Matte sätter upp firman …'
  const underrubrik = finished ? 'Här är vad teamet hittade.' : 'Läser det som kopplats. Tar under en minut.'
  const mobilStatus = !data
    ? 'Går igenom firman …'
    : isEmpty
      ? 'Redo'
      : finished
        ? 'Klar · här är vad teamet hittade'
        : 'Går igenom firman …'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-900/55">
      <div
        role="dialog"
        aria-labelledby="skanning-rubrik"
        // Flex, inte grid: med max-h på skalet får kolumnen (min-h-0) krympa
        // så att BARA radlistan rullar — rubrik, förlopp, legend och knappen
        // står stilla, precis som i skissen.
        className="w-full max-w-[900px] max-h-[calc(100dvh-1.5rem)] overflow-hidden rounded-2xl sm:rounded-3xl bg-white shadow-lg flex flex-col lg:flex-row"
      >
        {/* ── Vänster panel (desktop): Matte, löftet och vad som gås igenom ── */}
        <aside className="hidden lg:flex flex-col flex-shrink-0 w-[320px] bg-gradient-to-br from-primary-700 to-primary-600 text-white p-6">
          <div className="flex items-center gap-3">
            <span className="rounded-full ring-2 ring-white/90 bg-white/15 p-0.5 flex-shrink-0">
              <AgentAvatar agentKey="matte" size="lg" />
            </span>
            <div>
              <span className="block text-[10px] uppercase tracking-[.08em] text-white/80">Chefsassistent</span>
              <strong className="block text-sm mt-0.5">Matte</strong>
            </div>
          </div>
          <div className="mt-7">
            <h2 className="m-0 text-2xl font-bold tracking-tight text-white">Ge mig 40 sekunder.</h2>
            <p className="mt-2 mb-0 text-sm leading-relaxed text-white/85">
              Jag läser igenom det du kopplat och lämnar över till rätt person i teamet. Du behöver inte göra något.
            </p>
          </div>
          <div className="mt-7 p-4 rounded-2xl border border-white/20 bg-white/10">
            <h3 className="m-0 mb-3 text-xs font-semibold uppercase tracking-[.06em] text-white/85">Går igenom</h3>
            <ul className="list-none m-0 p-0 flex flex-col gap-2.5">
              {data === null ? (
                <li className={`flex items-center gap-2 text-[13px] text-white/75 ${reducedMotion ? '' : 'animate-pulse'}`}>
                  <span className="w-[18px] h-[18px] rounded-full bg-white/25 flex-shrink-0" />
                  Hämtar underlag …
                </li>
              ) : sources.length === 0 ? (
                <li className="text-[13px] text-white/75">Inget system kopplat än</li>
              ) : sources.map(s => {
                const klar = kallaKlar(s)
                return (
                  <li key={s.key} data-kalla-klar={klar ? '1' : '0'} className={`flex items-center gap-2 text-[13px] transition-opacity duration-base ${klar ? 'opacity-100' : 'opacity-70'}`}>
                    <span className={`w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 ${klar ? 'bg-white' : 'bg-white/25'}`}>
                      {klar && <Check className="w-3 h-3 text-primary-700" strokeWidth={3} />}
                    </span>
                    <span className="flex-shrink-0">{s.label}</span>
                    <span className="ml-auto min-w-0 truncate text-[11.5px] text-white/70">{s.meta}</span>
                  </li>
                )
              })}
            </ul>
          </div>
          <p className="mt-auto mb-0 pt-6 text-[11px] leading-snug text-white/65">
            Fakta från dina system märks Importerat. Sådant teamet bedömer märks Möjlighet eller Uppskattat. Vi hittar aldrig på för att det ska se bra ut.
          </p>
        </aside>

        {/* ── Mobil topp: Matte + en rad ── */}
        <div className="lg:hidden flex flex-shrink-0 items-center gap-3 px-4 py-3 bg-gradient-to-br from-primary-700 to-primary-600 text-white">
          <span className={`rounded-full ring-2 ring-white/90 bg-white/15 p-0.5 flex-shrink-0 ${!finished && !reducedMotion && data && !isEmpty ? 'animate-pulse' : ''}`}>
            <AgentAvatar agentKey="matte" size="md" />
          </span>
          <div className="min-w-0">
            <p className="m-0 text-[15px] font-bold leading-tight">Matte</p>
            <p className="m-0 text-xs text-white/85 truncate">{mobilStatus}</p>
          </div>
        </div>

        {/* ── Höger panel: raderna ── */}
        <section className="flex flex-col flex-1 min-w-0 min-h-0 bg-slate-50 p-4 sm:p-5 lg:p-6 lg:min-h-[640px]">
          <div className="flex justify-end -mt-1 -mr-1">
            <button
              type="button"
              onClick={finish}
              className="text-xs text-slate-400 hover:text-slate-600 min-h-[32px] px-2"
            >
              Hoppa över
            </button>
          </div>

          {!data ? (
            <div className="flex flex-col flex-1">
              <h2 id="skanning-rubrik" className="m-0 text-2xl font-bold tracking-tight text-slate-900">Matte sätter upp firman …</h2>
              <p className="mt-1.5 mb-4 text-sm text-slate-500">Hämtar det som kopplats.</p>
              <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden mb-4">
                <div className={`h-full w-1/6 rounded-full bg-grad-brand ${reducedMotion ? '' : 'animate-pulse'}`} />
              </div>
              <div className="flex items-center gap-3 py-2">
                <span className={reducedMotion ? '' : 'animate-pulse'}>
                  <AgentAvatar agentKey="matte" size="lg" />
                </span>
                <p className="m-0 text-sm text-slate-600">Ett ögonblick …</p>
              </div>
            </div>
          ) : isEmpty ? (
            <div className="flex items-start gap-3 py-2">
              <AgentAvatar agentKey="matte" size="lg" />
              <div>
                <p id="skanning-rubrik" className="m-0 text-[15px] font-semibold text-slate-900">Teamet är på plats och redo</p>
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
            <div className="flex flex-col flex-1 min-w-0 min-h-0">
              <h2 id="skanning-rubrik" className="m-0 text-2xl font-bold tracking-tight text-slate-900" aria-live="polite">{rubrik}</h2>
              <p className="mt-1.5 mb-4 text-sm text-slate-500">{underrubrik}</p>

              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPct}
                aria-label="Skanningens förlopp"
                className="h-1.5 rounded-full bg-slate-200 overflow-hidden mb-4"
              >
                <div
                  className="h-full rounded-full bg-grad-brand transition-[width] duration-slow ease-standard"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              {/* Enda rullande ytan: raderna. */}
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden -mx-1 px-1">
              <ul className="list-none p-0 m-0 flex flex-col gap-2">
                {rows.map((row, i) => (
                  <SkanningRad
                    key={row.key}
                    row={row}
                    klar={i < visibleCount}
                    aktiv={i === visibleCount && !finished}
                    reducedMotion={reducedMotion}
                  />
                ))}
              </ul>

              </div>

              {/* Slutkortet: kö-radens innehåll, utanför rullytan så det
                  alltid syns när skanningen är klar. */}
              {finished && koRad && (
                <div className={`flex-shrink-0 mt-3 p-4 rounded-2xl bg-white border border-primary-100 shadow-md ${reducedMotion ? '' : 'anim-rise'}`}>
                  <p className="m-0 text-base font-bold text-slate-900">{koRad.text}</p>
                  <p className="mt-0.5 mb-0 text-[13px] text-slate-500">De ligger i kön där du godkänner eller avvisar. Resten sköter teamet.</p>
                </div>
              )}

              <div className="flex-shrink-0 pt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11.5px] text-slate-500" aria-label="Etiketternas betydelse">
                {KALLA_ORDNING.map(k => (
                  <span key={k} className="inline-flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-[2px] border ${KALLA_LEGEND[k]}`} />
                    {KALLA_LABEL[k]}
                  </span>
                ))}
              </div>

              <div className="flex-shrink-0 mt-3">
                {finished && forstaKort ? (
                  <div>
                    {/* Första verifierade handlingen: agentens fynd + knappen som
                        ÄR handlingen. Sekundärlänken ger dagens väg (Hemturen). */}
                    <div className="flex items-start gap-2.5 mb-3 pt-3 border-t border-slate-200">
                      {forstaKort.agent && forstaKort.agent !== 'matte' && <AgentAvatar agentKey={forstaKort.agent} size="sm" />}
                      <p className="m-0 text-sm font-medium text-slate-800">{forstaKort.headline}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => finishMed(forstaKort.approvalId!)}
                      className="w-full px-4 py-2.5 rounded-2xl bg-primary-700 text-white text-[15px] font-semibold min-h-[48px] shadow-brand"
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
                ) : finished ? (
                  <button
                    type="button"
                    onClick={finish}
                    className="w-full px-4 py-2.5 rounded-2xl bg-primary-700 text-white text-[15px] font-semibold min-h-[48px] shadow-brand"
                  >
                    Visa mig
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-200 text-slate-400 text-[15px] font-semibold min-h-[48px] cursor-not-allowed"
                  >
                    Öppnas när skanningen är klar
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * En rad i listan. Tre lägen som i skissen: klar (etikettchip), aktiv
 * (snurra), väntande (dämpad, grå punkt). Per-agent-färgen bor BARA i
 * avataren; rader utan agent (rena antal) får en neutral bock i primary —
 * en summa är inte en åsikt och får inget ansikte
 * (docs/design/SYNLIG-INTELLIGENS.md, lager 3).
 */
function SkanningRad({ row, klar, aktiv, reducedMotion }: { row: ScanRow; klar: boolean; aktiv: boolean; reducedMotion: boolean }) {
  const ref = useRef<HTMLLIElement>(null)
  // Raden som just nu gås igenom hålls i sikte när listan är längre än
  // rullytan (mobil) — bara så långt som behövs, aldrig ett hopp.
  useEffect(() => {
    if (!aktiv) return
    try {
      ref.current?.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
    } catch { /* äldre webbläsare utan options-stöd — listan rullar manuellt */ }
  }, [aktiv, reducedMotion])
  return (
    <li
      ref={ref}
      data-kalla={row.kalla}
      data-klar={klar ? '1' : '0'}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all duration-base ease-standard ${
        aktiv ? 'bg-primary-50 border-primary-100' : 'bg-white border-slate-200'
      } ${klar || aktiv ? 'opacity-100' : 'opacity-45'}`}
    >
      {row.agent ? (
        <AgentAvatar agentKey={row.agent} size="sm" />
      ) : (
        <span
          className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
            klar || aktiv ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-400'
          }`}
        >
          <Check className="w-3.5 h-3.5" strokeWidth={2.6} />
        </span>
      )}
      <span className={`flex-1 min-w-0 text-[13.5px] leading-snug ${klar || aktiv ? 'text-slate-800' : 'text-slate-500'}`}>
        {row.text}
      </span>
      {klar ? (
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap flex-shrink-0 ${KALLA_CHIP[row.kalla]}`}>
          {KALLA_LABEL[row.kalla]}
        </span>
      ) : aktiv ? (
        <span
          aria-hidden
          className={`w-3.5 h-3.5 rounded-full border-2 border-primary-100 border-t-primary-700 flex-shrink-0 ${reducedMotion ? '' : 'animate-spin'}`}
        />
      ) : (
        <span aria-hidden className="w-2 h-2 rounded-full bg-slate-300 flex-shrink-0" />
      )}
    </li>
  )
}
