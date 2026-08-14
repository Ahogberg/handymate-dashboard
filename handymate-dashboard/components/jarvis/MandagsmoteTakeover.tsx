'use client'

/**
 * MandagsmoteTakeover — Veckomötet som en fullskärms-takeover.
 *
 * Etapp 2 (2026-08-13): Måndagskortet (etapp 1, se lib/jarvis/monday-brief.ts)
 * "stack inte ut" som ett vanligt kort i den generiska godkännande-listan —
 * det skulle kännas som ett riktigt veckomöte, inte en rad i en kö.
 *
 * Etapp 3 — Veckomötet (2026-08-14, Claude Design-projektet "Digital CFO +
 * COO-mötet", importerat via DesignSync-MCP och implementerat pixelnära):
 * sektionslistan blev en dialog. Matte öppnar, sedan en replik i taget från
 * teamet (lib/jarvis/mandagsmote.ts byggVeckomoteRepliker — SAMMA data som
 * MandagskortCard redan visar, bara omskriven till en mening per sektion i
 * stället för en rad-lista), och om dagens Next Best Action-rankning har
 * riktiga kandidater: upp till tre beslutskort man trycker sig igenom.
 *
 * Godkänn/avvisa på ett beslutskort går genom EXAKT samma väg som varje
 * annat kort i kön (queueAction/executeSend, se JarvisHome.tsx) — den här
 * komponenten känner inte till fetch/API, bara callbacks. "Ångra" på ett
 * beslutat kort försvinner efter UNDO_WINDOW_MS: godkännandet är oåterkalleligt
 * efter det fönstret (samma sanning som resten av appen), så knappen ljuger
 * aldrig om vad den kan göra.
 *
 * Skalet (overlay, stegvis avslöjning, prefers-reduced-motion, B7-
 * säkerhetsnätet) är oförändrat från etapp 2 — bara vad som avslöjas är nytt.
 */

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { AGENT_INFO } from '@/components/dashboard/agentPersonas'
import { byggVeckomoteRepliker, beslutText, UNDO_WINDOW_MS, type VeckomoteReplik } from '@/lib/jarvis/mandagsmote'
import type {
  MandagskortResultatRad,
  MandagskortLardomar,
  MandagskortRiskRad,
  MandagskortFortroendeRad,
} from '@/lib/jarvis/monday-brief'
import type { NextBestActionRecommendation } from '@/components/jarvis/GorDettaForst'

/** Tid mellan varje avslöjat steg — långsammare än CompanyScans 700 ms
 *  radtakt, för replikerna här bär mer att läsa var. */
const SECTION_INTERVAL_MS = 500
/** Säkerhetsnät (B7-mönstret, samma konstant som CompanyScan/HemTur). */
const HANG_TIMEOUT_MS = 5000

export interface MandagsmoteApproval {
  id: string
  approval_type: string
  payload: Record<string, unknown>
}

type Steg =
  | { type: 'bubble'; agentId: string; text: string }
  | { type: 'decisions' }

function ReplikBubbla({ agentId, text }: { agentId: string; text: string }) {
  const namn = AGENT_INFO[agentId]?.name ?? agentId
  return (
    <div className="flex gap-2 items-end">
      <AgentAvatar agentKey={agentId} size="sm" />
      <div className="flex flex-col gap-0.5 min-w-0 max-w-[86%]">
        <span className="text-[11px] text-slate-500">
          <b className="font-semibold text-slate-700">{namn}</b>
        </span>
        <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-3.5 py-2.5 shadow-sm text-sm leading-relaxed text-slate-800">
          {text}
        </div>
      </div>
    </div>
  )
}

function BeslutsKort({
  candidate,
  status,
  undoAvailable,
  onYes,
  onNo,
  onUndo,
}: {
  candidate: NextBestActionRecommendation
  status: 'ja' | 'nej' | null
  undoAvailable: boolean
  onYes: () => void
  onNo: () => void
  onUndo: () => void
}) {
  const border = status === 'ja' ? 'border-primary-200' : 'border-slate-200'
  const dot = status === null ? 'bg-amber-500' : status === 'ja' ? 'bg-primary-500' : 'bg-slate-300'
  return (
    <div className={`bg-white border ${border} rounded-2xl p-3.5 shadow-sm flex flex-col gap-2.5`}>
      <div className="flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          <p className="m-0 text-sm font-semibold text-slate-900">{candidate.approval.title}</p>
          <p className="m-0 mt-0.5 text-xs text-slate-500 leading-snug">{candidate.rationale}</p>
        </div>
        <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dot}`} />
      </div>
      {status === null ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onYes}
            className="flex-1 h-11 rounded-xl bg-primary-700 text-white text-sm font-medium hover:bg-primary-800 transition-colors"
          >
            Ja, gör det
          </button>
          <button
            type="button"
            onClick={onNo}
            className="flex-1 h-11 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Inte nu
          </button>
        </div>
      ) : (
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
            status === 'ja' ? 'bg-primary-50 text-primary-800' : 'bg-slate-100 text-slate-500'
          }`}
        >
          <span>{status === 'ja' ? '✓' : '–'}</span>
          <span className="flex-1 min-w-0">{status === 'ja' ? candidate.approval.title : 'Sparas till senare'}</span>
          {undoAvailable && (
            <button type="button" onClick={onUndo} className="text-slate-400 hover:text-slate-600">
              Ångra
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function MandagsmoteTakeover({
  approval,
  greetingName,
  approveLabel,
  decisionCandidates,
  onApprove,
  onDismiss,
  onApproveDecision,
  onRejectDecision,
  onUndoDecision,
}: {
  approval: MandagsmoteApproval
  /** Ägarens förnamn — Mattes öppningsrad ("God morgon {namn}."). Tom sträng
   *  om okänt (t.ex. greetingName saknas) faller tyst tillbaka till "God morgon." */
  greetingName: string
  /** "Jag har läst det" — härledd i JarvisHome via lib/jarvis/approval-view.ts
   *  approveLabel('monday_brief', payload), inte hårdkodad här. */
  approveLabel: string
  /** Dagens Next Best Action-rankning, upp till tre kandidater — samma lista
   *  som /api/next-best-action redan levererar, ingen egen selektion här.
   *  Tom array (ingen rankning idag, eller inga kvar pending) → inga
   *  beslutskort renderas, bara replikerna. */
  decisionCandidates: NextBestActionRecommendation[]
  /** Kör den RIKTIGA godkänn-vägen för HELA veckomötet (queueAction/executeSend)
   *  — komponenten vet inte hur, bara att den ska. */
  onApprove: () => void
  /** Döljer takeovern UTAN att godkänna något — kortet ligger kvar pending. */
  onDismiss: () => void
  /** Ett enskilt beslutskorts "Ja, gör det" — SAMMA godkänn-väg som varje
   *  annat kort (queueAction), bara riktat mot den kandidatens approval. */
  onApproveDecision: (candidate: NextBestActionRecommendation) => void
  onRejectDecision: (candidate: NextBestActionRecommendation) => void
  /** Ångra inom UNDO_WINDOW_MS — samma undo(id) som resten av kön. */
  onUndoDecision: (approvalId: string) => void
}) {
  const pl = (approval.payload || {}) as Record<string, unknown>
  const isoWeek = typeof pl.iso_week === 'number' ? (pl.iso_week as number) : null
  const resultat = (pl.resultat ?? null) as MandagskortResultatRad[] | null
  const lardomar = (pl.lardomar ?? null) as MandagskortLardomar | null
  const risker = (pl.risker ?? null) as MandagskortRiskRad[] | null
  const fortroende = (pl.fortroende ?? null) as MandagskortFortroendeRad[] | null

  const repliker: VeckomoteReplik[] = byggVeckomoteRepliker({ resultat, lardomar, risker, fortroende })

  // Fryst vid mount — INTE den levande propen. Modalen monteras färskt varje
  // gång den öppnas (villkorlig rendering i JarvisHome), så en lazy
  // useState-initierare fångar precis de kandidater som var pending när
  // mötet öppnades. Utan det här hade ett eget Ja/Nej-klick här inne (som
  // lägger id:t i hiddenIds i JarvisHome) fått sitt EGET kort att försvinna
  // ur listan på nästa render — i stället för att visa resultatet.
  const [candidates] = useState(() => decisionCandidates)
  const harBeslut = candidates.length > 0
  const inledning = `God morgon${greetingName ? ` ${greetingName}` : ''}. Tre minuter — alla har med sig en sak var. Vi börjar med förra veckan.`
  const overgang = `Det var fynden. ${beslutText(candidates.length)} på bordet — tryck dig igenom dem.`

  const steg: Steg[] = [
    { type: 'bubble', agentId: 'matte', text: inledning },
    ...repliker.map(r => ({ type: 'bubble' as const, agentId: r.agentId, text: r.text })),
    ...(harBeslut ? [{ type: 'bubble' as const, agentId: 'matte', text: overgang }, { type: 'decisions' as const }] : []),
  ]

  const [reducedMotion, setReducedMotion] = useState(false)
  const [visibleCount, setVisibleCount] = useState(0)
  const [decided, setDecided] = useState<Record<string, 'ja' | 'nej'>>({})
  const [undoExpired, setUndoExpired] = useState<Record<string, boolean>>({})
  const undoTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

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

  // Den stegvisa avslöjningen. Reduced motion visar alla steg direkt,
  // utan en enda timer i den vägen (samma regel som CompanyScan).
  useEffect(() => {
    if (reducedMotion) { setVisibleCount(steg.length); return }
    if (visibleCount >= steg.length) return
    const t = setTimeout(() => setVisibleCount(v => v + 1), SECTION_INTERVAL_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, visibleCount, steg.length])

  // Säkerhetsnätet (B7-mönstret): en bakgrundsflik eller strypt timer får
  // aldrig fastna på "Går igenom veckans punkter …" för gott.
  useEffect(() => {
    if (reducedMotion) return
    if (visibleCount >= steg.length) return
    const t = setTimeout(() => setVisibleCount(v => Math.min(v + 1, steg.length)), HANG_TIMEOUT_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, visibleCount, steg.length])

  // Ångra-timers hör till DENNA modal (bara vad som visas), inte till det
  // faktiska köade beslutet i JarvisHome — att modalen stängs ska aldrig
  // röra det redan köade skicket, bara sluta visa "Ångra"-knappen.
  useEffect(() => {
    return () => { undoTimers.current.forEach(t => clearTimeout(t)) }
  }, [])

  const klart = visibleCount >= steg.length
  const remaining = candidates.filter(c => !decided[c.approval.id]).length
  const allDecided = harBeslut && remaining === 0

  function handleDismiss() {
    // Escape-luckan: döljer takeovern för den här sessionen. Godkänner
    // INGENTING — kortet och ev. obeslutade beslutskort ligger kvar pending.
    if (doneRef.current) return
    doneRef.current = true
    onDismissRef.current()
  }

  function handleApprove() {
    if (doneRef.current) return
    doneRef.current = true
    onApproveRef.current()
  }

  function handleYes(c: NextBestActionRecommendation) {
    const id = c.approval.id
    setDecided(d => ({ ...d, [id]: 'ja' }))
    onApproveDecision(c)
    const t = setTimeout(() => setUndoExpired(u => ({ ...u, [id]: true })), UNDO_WINDOW_MS)
    undoTimers.current.set(id, t)
  }

  function handleNo(c: NextBestActionRecommendation) {
    const id = c.approval.id
    setDecided(d => ({ ...d, [id]: 'nej' }))
    onRejectDecision(c)
    const t = setTimeout(() => setUndoExpired(u => ({ ...u, [id]: true })), UNDO_WINDOW_MS)
    undoTimers.current.set(id, t)
  }

  function handleUndo(id: string) {
    const t = undoTimers.current.get(id)
    if (t) clearTimeout(t)
    undoTimers.current.delete(id)
    setDecided(d => { const n = { ...d }; delete n[id]; return n })
    setUndoExpired(u => { const n = { ...u }; delete n[id]; return n })
    onUndoDecision(id)
  }

  const knappText = remaining > 0 ? `${approveLabel} — ${beslutText(remaining)} kvar` : approveLabel

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/55">
      <div className="w-full max-w-[480px] max-h-[85vh] bg-white rounded-2xl border border-slate-200 shadow-lg flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-1 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={klart || reducedMotion ? '' : 'animate-pulse'}>
              <AgentAvatar agentKey="matte" size="lg" />
            </span>
            <div className="min-w-0">
              <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-primary-700">
                Veckomötet
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
            className="text-slate-400 hover:text-slate-600 min-h-[44px] min-w-[44px] -mt-2 -mr-2 shrink-0 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!klart && (
          <p className="mt-1 mb-0 px-5 text-xs text-slate-400 shrink-0">Går igenom veckans punkter …</p>
        )}

        <div className="overflow-y-auto px-5 pt-3 pb-2 flex flex-col gap-3">
          {steg.slice(0, visibleCount).map((s, i) =>
            s.type === 'bubble' ? (
              <ReplikBubbla key={i} agentId={s.agentId} text={s.text} />
            ) : (
              <div key={i} className="flex flex-col gap-2.5 pl-9">
                {candidates.map(c => (
                  <BeslutsKort
                    key={c.approval.id}
                    candidate={c}
                    status={decided[c.approval.id] ?? null}
                    undoAvailable={!undoExpired[c.approval.id]}
                    onYes={() => handleYes(c)}
                    onNo={() => handleNo(c)}
                    onUndo={() => handleUndo(c.approval.id)}
                  />
                ))}
              </div>
            ),
          )}

          {allDecided && (
            <div className="flex gap-2 items-end">
              <AgentAvatar agentKey="matte" size="sm" />
              <div className="flex flex-col gap-0.5 min-w-0 max-w-[86%]">
                <span className="text-[11px] text-slate-500">
                  <b className="font-semibold text-slate-700">Matte</b>
                </span>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-3.5 py-2.5 shadow-sm text-sm leading-relaxed text-slate-800">
                  <p className="m-0 mb-1.5 font-medium text-slate-900">Bra. Vi tar resten.</p>
                  <div className="flex flex-col gap-0.5 text-xs text-slate-500">
                    {candidates.map(c => (
                      <span key={c.approval.id} className="flex gap-1.5 items-baseline">
                        <span className={decided[c.approval.id] === 'ja' ? 'text-primary-600' : 'text-slate-400'}>
                          {decided[c.approval.id] === 'ja' ? '✓' : '–'}
                        </span>
                        <span>{decided[c.approval.id] === 'ja' ? c.approval.title : 'Sparas till senare'}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 pt-2 pb-5 shrink-0">
          <button
            type="button"
            onClick={handleApprove}
            className="w-full px-4 py-2.5 rounded-full bg-primary-700 text-white text-sm font-semibold min-h-[44px]"
          >
            {knappText}
          </button>
        </div>
      </div>
    </div>
  )
}
