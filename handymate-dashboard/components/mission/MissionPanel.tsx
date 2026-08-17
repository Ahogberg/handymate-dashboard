/** @jsxImportSource react */
// Ingen egen 'use client' — komponenten monteras uteslutande under
// app/dashboard/layout.tsx (redan 'use client'), och pragmat ovan behövs
// för att tests/mission-panel.spec.ts ska kunna renderToStaticMarkup:a
// MissionPanelView i Node (samma fix som components/agents/MissionPlanCard.tsx
// och components/quotes/document/QuoteDocument.tsx bär, av samma anledning).

import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useMission } from '@/lib/mission/MissionProvider'
import { useJobbuddy } from '@/lib/JobbuddyContext'
import { groupStepsByClass } from '@/lib/mission/plan-contract-view'
import { progressParts } from '@/lib/mission/progress-parts'
import { buildMissionHeadline } from '@/lib/mission/mission-summary'
import { resolveGoalType } from '@/lib/mission/goal-type'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { AGENT_INFO } from '@/components/dashboard/agentPersonas'
import type { MissionRow, MissionProgress, MissionDecision } from '@/lib/mission/mission-progress'
import type { TruthClass, PortfolioMeasure } from '@/lib/mission/opportunity-portfolio'

/**
 * MissionPanel — expansionspanelen (Goal-to-Plan V2, Etapp G,
 * tasks/jaunty-pondering-hummingbird.md).
 *
 * Den "större arbetsytan" från originalförslaget, förenklad till V2: en
 * read-only slide-over för det AKTIVA uppdraget. Hero-bandets "Öppna →"
 * (Uppdragsrad.tsx) och bubblans "Uppdrag pågår · öppna"-pill
 * (Jobbkompisen.tsx) öppnar den här panelen i stället för chatten —
 * "kräver beslut"-pillen fortsätter öppna chatten, för beslut är
 * konversationella.
 *
 * ═══ TVÅ DELAR ═══
 *
 * `MissionPanelView` — ren presentation, inga hooks, tar mission/progress/
 * decisions + callbacks som props. Testbar direkt med renderToStaticMarkup
 * (samma idiom som MissionPlanCard.tsx) utan en MissionProvider-context.
 *
 * `MissionPanel` — den context-läsande monteringspunkten (useMission +
 * useJobbuddy), sköter overlay/Escape/scroll-lås och "Avsluta uppdraget"/
 * "Markera klart"-anropet mot /api/mission/[id]/resolve.
 *
 * ═══ ÄRLIGHETSREGLERNA (samma som MissionPlanCard/Uppdragsrad/MatteHero) ═══
 *
 * En kantad sektion per sanningsklass (groupStepsByClass), varje steg med
 * SITT EGET mått — aldrig en klassöverskridande siffra. Gap-statistiken
 * återanvänder progressParts() rakt av (samma facit som MatteHero:s
 * sub-rad). "Vad som inte kunde bedömas" visar bara capacity_unconfigured
 * — degraded_sources lagras aldrig på mission-raden, så den ärligast
 * möjliga texten här är kapacitetsnoten, inte en källista vi inte har.
 */

const CLASS_LABEL: Record<TruthClass, string> = {
  indrivningsbart: 'Indrivningsbart',
  faktureringsklart: 'Faktureringsklart',
  pipeline: 'Pipeline (ej säkrat)',
  ateraktivering: 'Återaktivering',
  marginalskydd: 'Marginalskydd',
}

const CLASS_BADGE: Record<TruthClass, { text: string; className: string }> = {
  indrivningsbart: { text: 'KÄNT', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  faktureringsklart: { text: 'KÄNT', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pipeline: { text: 'PIPELINE', className: 'bg-slate-50 text-slate-600 border-slate-200' },
  ateraktivering: { text: 'ANTAL', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  marginalskydd: { text: 'SKYDD', className: 'bg-amber-50 text-amber-700 border-amber-200' },
}

function formatMeasure(measure: PortfolioMeasure): string {
  return measure.kind === 'kr'
    ? `${measure.amountKr.toLocaleString('sv-SE')} kr`
    : `${measure.count} st`
}

export type MissionResolveAction = 'cancel' | 'complete'

/** Produktionsdefaulten för agent-chippet — AgentAvatar + namn via
    agent_key, precis som resten av teamytorna. Ett eget default-param i
    stället för att anropa AgentAvatar direkt i JSX:en LÅTER
    tests/mission-panel.spec.ts injicera en enkel stubb: AgentAvatar.tsx
    (som alla 'use client'-komponenter utan components/agents/
    MissionPlanCard.tsx:s @jsxImportSource-fix) går inte att
    renderToStaticMarkup:a direkt i Node — samma orsak som pragmat högst upp
    i den här filen finns. Panelen som faktiskt monteras i appen
    (MissionPanel nedan) skickar aldrig in propen, så den äkta avataren
    visas oförändrat i webbläsaren. */
function defaultAgentChip(agentKey: string): ReactNode {
  return <AgentAvatar agentKey={agentKey} size="sm" />
}

export function MissionPanelView({
  mission,
  progress,
  decisions,
  confirmAction,
  resolving,
  onClose,
  onFragaMatte,
  onRequestConfirm,
  onCancelConfirm,
  onConfirmResolve,
  renderAgentChip = defaultAgentChip,
}: {
  mission: MissionRow
  progress: MissionProgress
  decisions: MissionDecision[]
  /** null = inget väntar på bekräftelse; annars vilken åtgärd som väntar på "Säker?". */
  confirmAction: MissionResolveAction | null
  resolving: boolean
  onClose: () => void
  onFragaMatte: () => void
  onRequestConfirm: (action: MissionResolveAction) => void
  onCancelConfirm: () => void
  onConfirmResolve: () => void
  /** Testkrok — se defaultAgentChip. */
  renderAgentChip?: (agentKey: string) => ReactNode
}) {
  const goalType = resolveGoalType(mission.goal_type)
  const headline = buildMissionHeadline(
    mission.goal_kr ?? 0,
    mission.deadline.slice(0, 10),
    goalType === 'capacity' ? { goalType, goalHours: mission.goal_hours ?? undefined } : undefined,
  )
  const deadlineLabel = new Date(mission.deadline).toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const steps = Array.isArray(mission.plan_snapshot?.steps) ? mission.plan_snapshot.steps : []
  const sections = groupStepsByClass(steps)
  // Etapp D-facit: gap_kr/gap_hours är ömsesidigt uteslutande — "klart" är
  // ETT av de två, aldrig en gissning från det andra fältet.
  const gapClosed = goalType === 'capacity' ? progress.gap_hours === 0 : progress.gap_kr === 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Uppdraget"
      className="relative w-full sm:max-w-xl h-full bg-white shadow-2xl flex flex-col overflow-hidden ml-auto"
    >
      {/* Header — mörk, samma bandkontext som MatteHero. */}
      <div className="flex items-start justify-between gap-3 px-5 py-4 bg-primary-700 text-white shrink-0">
        <div className="min-w-0">
          <p className="m-0 text-[11px] uppercase tracking-[0.1em] text-white/70">Aktivt uppdrag</p>
          <h2 className="m-0 mt-0.5 font-heading text-lg sm:text-xl font-bold leading-tight">{headline}</h2>
          <p className="m-0 mt-1 text-xs text-white/70">Deadline {deadlineLabel}</p>
          <p className="m-0 mt-1.5 text-sm text-white/85 tabular-nums">{progressParts(progress).join(' · ')}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Stäng"
          className="p-1.5 -m-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Innehåll */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <div className="space-y-3">
          {sections.map(section => {
            const badge = CLASS_BADGE[section.truth_class]
            return (
              <div key={section.truth_class} className="border border-slate-200 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-xs font-semibold text-slate-700">{CLASS_LABEL[section.truth_class]}</span>
                  <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${badge.className}`}>
                    {badge.text}
                  </span>
                </div>
                <ul className="m-0 p-0 list-none space-y-2.5">
                  {section.steps.map(step => (
                    <li key={step.item_id} className="flex items-start gap-2.5">
                      {renderAgentChip(step.agent_key)}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm text-slate-900 truncate">{step.title}</span>
                          <span className="tabular-nums text-sm font-medium text-slate-700 whitespace-nowrap">
                            {formatMeasure(step.measure)}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400">
                          {AGENT_INFO[step.agent_key]?.name ?? step.agent_key}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        {/* Beslut — uppdragets öppna mission-kort. Plain <a> (inte next/link):
            djuplänk per beslut är V3, en enkel länk till godkännande-sidan
            räcker för V2 — och gör raden testbar med renderToStaticMarkup
            utan Next.js router-context. */}
        <div>
          <h3 className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Beslut</h3>
          {decisions.length === 0 ? (
            <p className="m-0 text-sm text-slate-400">Inget väntar på dig just nu.</p>
          ) : (
            <ul className="m-0 p-0 list-none space-y-1.5">
              {decisions.map(d => (
                <li key={d.id}>
                  <a
                    href="/dashboard/approvals"
                    className="flex items-center justify-between gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900 hover:bg-amber-100 transition-colors"
                  >
                    <span className="truncate">{d.title}</span>
                    <span className="text-xs font-semibold shrink-0">Väntar →</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Vad som inte kunde bedömas — degraded_sources lagras inte på
            mission-raden (bara på portföljen vid planbygget), så den enda
            ärliga degraderingsnoten här är kapacitetsuppdragets. */}
        {progress.capacity_unconfigured && (
          <p className="m-0 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
            Vad som inte kunde bedömas: kapaciteten för målveckan är inte inställd — vi visar inget gissat gap.
          </p>
        )}
      </div>

      {/* Footer — Fråga Matte / Markera klart / Avsluta uppdraget. */}
      <div className="border-t border-slate-100 px-5 py-4 shrink-0">
        {confirmAction ? (
          <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
            <span className="text-sm text-amber-900">
              Säker? {confirmAction === 'cancel' ? 'Uppdraget avslutas som avbrutet.' : 'Uppdraget markeras klart.'}
            </span>
            <div className="flex gap-1.5 shrink-0">
              <button
                type="button"
                disabled={resolving}
                onClick={onConfirmResolve}
                className="px-3 py-1.5 bg-primary-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
              >
                Ja, säker
              </button>
              <button
                type="button"
                disabled={resolving}
                onClick={onCancelConfirm}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 disabled:opacity-50"
              >
                Avbryt
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onFragaMatte}
              className="flex-1 min-w-[130px] py-2.5 px-3 bg-primary-700 text-white rounded-xl text-sm font-semibold hover:bg-primary-800 transition-colors"
            >
              Fråga Matte
            </button>
            {gapClosed && (
              <button
                type="button"
                onClick={() => onRequestConfirm('complete')}
                className="flex-1 min-w-[130px] py-2.5 px-3 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors"
              >
                Markera klart
              </button>
            )}
            <button
              type="button"
              onClick={() => onRequestConfirm('cancel')}
              className="py-2.5 px-3.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Avsluta uppdraget
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Den context-läsande monteringspunkten — monteras EN gång i
 * app/dashboard/layout.tsx, bredvid Jobbkompisen. Läser useMission()/
 * useJobbuddy() direkt (samma mönster som MatteHero/Uppdragsrad), så ingen
 * prop-trädning genom layouten behövs.
 */
export function MissionPanel() {
  const { mission, progress, decisions, panelOpen, setPanelOpen, refresh } = useMission()
  const { setActiveTab, setIsOpen } = useJobbuddy()
  const [confirmAction, setConfirmAction] = useState<MissionResolveAction | null>(null)
  const [resolving, setResolving] = useState(false)

  // Escape stänger + scroll-lås medan panelen är öppen — samma idiom som
  // AddRowSheet/RowEditSheet (components/quotes/document/AddRowSheet.tsx).
  useEffect(() => {
    if (!panelOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPanelOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [panelOpen, setPanelOpen])

  // Nollställ bekräftelsesteget när panelen stängs — annars möts
  // hantverkaren av "Säker?" nästa gång den öppnas.
  useEffect(() => {
    if (!panelOpen) setConfirmAction(null)
  }, [panelOpen])

  if (!panelOpen) return null
  if (!mission || mission.status !== 'active' || !progress) return null

  function fragaMatte() {
    setPanelOpen(false)
    setActiveTab('chat')
    setIsOpen(true)
  }

  async function confirmResolve() {
    if (!confirmAction) return
    setResolving(true)
    try {
      const res = await fetch(`/api/mission/${mission!.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: confirmAction }),
      })
      if (res.ok) {
        refresh()
        setPanelOpen(false)
      }
    } catch {
      // Best effort — panelen stannar öppen så hantverkaren kan försöka igen.
    } finally {
      setResolving(false)
      setConfirmAction(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex">
      <div onClick={() => setPanelOpen(false)} className="absolute inset-0 bg-slate-900/40" aria-hidden />
      <MissionPanelView
        mission={mission}
        progress={progress}
        decisions={decisions}
        confirmAction={confirmAction}
        resolving={resolving}
        onClose={() => setPanelOpen(false)}
        onFragaMatte={fragaMatte}
        onRequestConfirm={setConfirmAction}
        onCancelConfirm={() => setConfirmAction(null)}
        onConfirmResolve={confirmResolve}
      />
    </div>
  )
}
