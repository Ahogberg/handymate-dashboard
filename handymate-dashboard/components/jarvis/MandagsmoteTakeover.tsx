'use client'

/**
 * MandagsmoteTakeover — Måndagsmötet som en fullskärms-takeover (Måndagsmötet
 * etapp 2, 2026-08-13). Andreas fynd: Måndagskortet (etapp 1, se
 * lib/jarvis/monday-brief.ts) "stack inte ut" som ett vanligt kort i den
 * generiska godkännande-listan — det ska kännas som ett riktigt veckomöte,
 * inte en rad i en kö.
 *
 * Samma overlay-familj som components/tour/CompanyScan.tsx: mörklagd
 * bakgrund, vitt kort, en stegvis avslöjad rad-för-rad-känsla,
 * prefers-reduced-motion, och ett B7-säkerhetsnät så en avslöjning aldrig kan
 * fastna. Sektionerna själva renderas av MandagskortCard — SAMMA komponent
 * som app/dashboard/approvals/page.tsx redan använder, oförändrad. Den här
 * filen lägger bara den ceremoniella ramen och den stegvisa avslöjningen runt
 * omkring, genom att styra VILKA av de fyra sektionerna som redan är
 * synliga (null tills sin tur) — MandagskortCard rörs inte.
 *
 * Ren presentation: komponenten känner inte till fetch/API. Den anropar bara
 * `onApprove`/`onDismiss` — JarvisHome äger vad de faktiskt gör (samma
 * queueAction/executeSend-väg som varje annat kort, se JarvisHome.tsx).
 */

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { MandagskortCard } from '@/components/jarvis/MandagskortCard'
import { mandagsmoteSectionOrder } from '@/lib/jarvis/mandagsmote'
import type {
  MandagskortResultatRad,
  MandagskortLardomar,
  MandagskortRiskRad,
  MandagskortFortroendeRad,
} from '@/lib/jarvis/monday-brief'

/** Tid mellan varje avslöjad sektion — långsammare än CompanyScans 700 ms
 *  radtakt, för sektionerna här bär mer att läsa var (flera rader var). */
const SECTION_INTERVAL_MS = 500
/** Säkerhetsnät (B7-mönstret, samma konstant som CompanyScan/HemTur). */
const HANG_TIMEOUT_MS = 5000

export interface MandagsmoteApproval {
  id: string
  approval_type: string
  payload: Record<string, unknown>
}

export default function MandagsmoteTakeover({
  approval,
  approveLabel,
  onApprove,
  onDismiss,
}: {
  approval: MandagsmoteApproval
  /** "Jag har läst det" — härledd i JarvisHome via lib/jarvis/approval-view.ts
   *  approveLabel('monday_brief', payload), inte hårdkodad här. */
  approveLabel: string
  /** Kör den RIKTIGA godkänn-vägen (queueAction/executeSend) — komponenten
   *  vet inte hur, bara att den ska. */
  onApprove: () => void
  /** Döljer takeovern UTAN att godkänna något — kortet ligger kvar pending. */
  onDismiss: () => void
}) {
  const pl = (approval.payload || {}) as Record<string, unknown>
  const isoWeek = typeof pl.iso_week === 'number' ? (pl.iso_week as number) : null
  const resultat = (pl.resultat ?? null) as MandagskortResultatRad[] | null
  const lardomar = (pl.lardomar ?? null) as MandagskortLardomar | null
  const risker = (pl.risker ?? null) as MandagskortRiskRad[] | null
  const fortroende = (pl.fortroende ?? null) as MandagskortFortroendeRad[] | null

  const order = mandagsmoteSectionOrder({ resultat, lardomar, risker, fortroende })

  const [reducedMotion, setReducedMotion] = useState(false)
  const [visibleCount, setVisibleCount] = useState(0)
  // onApprove/onDismiss i refs: effekterna nedan (och dubbelklicksspärren)
  // ska inte behöva lista de föränderliga funktionerna som beroende — samma
  // mönster som onCloseRef i CompanyScan.tsx.
  const doneRef = useRef(false)
  const onApproveRef = useRef(onApprove)
  onApproveRef.current = onApprove
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    try {
      setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    } catch { /* saknat stöd — animeras som vanligt */ }
  }, [])

  // Den stegvisa avslöjningen. Reduced motion visar alla sektioner direkt,
  // utan en enda timer i den vägen (samma regel som CompanyScan).
  useEffect(() => {
    if (reducedMotion) { setVisibleCount(order.length); return }
    if (visibleCount >= order.length) return
    const t = setTimeout(() => setVisibleCount(v => v + 1), SECTION_INTERVAL_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, visibleCount, order.length])

  // Säkerhetsnätet (B7-mönstret): en bakgrundsflik eller strypt timer får
  // aldrig fastna på "Går igenom veckans punkter …" för gott.
  useEffect(() => {
    if (reducedMotion) return
    if (visibleCount >= order.length) return
    const t = setTimeout(() => setVisibleCount(v => Math.min(v + 1, order.length)), HANG_TIMEOUT_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, visibleCount, order.length])

  const visibleKeys = new Set(order.slice(0, visibleCount))
  const klart = visibleCount >= order.length

  function handleDismiss() {
    // Escape-luckan: döljer takeovern för den här sessionen. Godkänner
    // INGENTING — kortet ligger kvar pending, precis som "Hoppa över" i
    // CompanyScan lämnar skannen ogjord (fast här utan att spärra
    // återvisning: hm_mandagsmote_sett_* sattes redan vid öppning, av
    // JarvisHome — se komponentens filhuvud).
    if (doneRef.current) return
    doneRef.current = true
    onDismissRef.current()
  }

  function handleApprove() {
    if (doneRef.current) return
    doneRef.current = true
    onApproveRef.current()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/55">
      <div className="w-full max-w-[480px] max-h-[85vh] overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-lg p-5">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={klart || reducedMotion ? '' : 'animate-pulse'}>
              <AgentAvatar agentKey="matte" size="lg" />
            </span>
            <div className="min-w-0">
              <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-primary-700">
                Måndagsmötet
              </p>
              <h2 className="m-0 text-[17px] font-bold text-slate-900 truncate">
                {isoWeek ? `Vecka ${isoWeek}` : 'Veckans sammanfattning'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Stäng"
            className="text-slate-400 hover:text-slate-600 min-h-[36px] min-w-[36px] -mt-1 -mr-1 shrink-0 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!klart && (
          <p className="mt-1 mb-0 text-xs text-slate-400">Går igenom veckans punkter …</p>
        )}

        <MandagskortCard
          resultat={visibleKeys.has('resultat') ? resultat : null}
          lardomar={visibleKeys.has('lardomar') ? lardomar : null}
          risker={visibleKeys.has('risker') ? risker : null}
          fortroende={visibleKeys.has('fortroende') ? fortroende : null}
        />

        <button
          type="button"
          onClick={handleApprove}
          className="w-full mt-4 px-4 py-2.5 rounded-full bg-primary-700 text-white text-sm font-semibold min-h-[44px]"
        >
          {approveLabel}
        </button>
      </div>
    </div>
  )
}
