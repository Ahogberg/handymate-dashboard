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
import type { MissionFacit, AgentUtfall } from '@/lib/mission/mission-facit'
import type { LearningRow } from '@/lib/mission/mission-learning'
import { deriveMandateCandidates, deriveDefaultCaps, MANDATE_TARGET_LIST_KEY, type MandateCandidateType } from '@/lib/mandates/create'
import type { MandateRow, MandateActionType } from '@/lib/mandates/mission-mandate'
import type { MandateFacitResult } from '@/lib/mandates/mandate-facit'
import { AUTONOMY_META } from '@/lib/autonomy/earned-autonomy'

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
 *
 * ═══ ETAPP H: TEAM + HISTORIK + LÄRDOMAR ═══
 *
 * Tre nya read-only-sektioner, alla ur EN lazy fetch mot
 * /api/mission/history när panelen öppnas (MissionPanel nedan) — samma svar
 * ger både det aktiva uppdragets per-agent-facit (agentUtfall) och de
 * tidigare uppdragens rader (history) plus lärandesektionen (learning).
 * Panelen förblir annars gated på ett AKTIVT uppdrag (oförändrat från Etapp
 * G) — historik utan ett pågående uppdrag är V3, inte byggt här.
 *
 * agentUtfall-raderna läser UTESLUTANDE AgentUtfall-fälten (ansvarar_steg/
 * utforda/vantar/kunde_inte_verifieras) — aldrig plan_snapshot-stegen direkt.
 * De två källorna (plan vs. utfört) delas aldrig ihop här, exakt som i
 * lib/mission/mission-facit.ts.
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

/** Etapp H — historikradens statuschip. 'active' ingår för typfullständighet
    men förekommer aldrig i praktiken (MissionPanel filtrerar bort det
    aktiva uppdraget ur historiklistan innan den skickas hit). */
const HISTORY_STATUS_BADGE: Record<MissionFacit['status'], { text: string; className: string }> = {
  completed: { text: 'Slutfört', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { text: 'Avbrutet', className: 'bg-slate-50 text-slate-600 border-slate-200' },
  expired: { text: 'Utgånget', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  active: { text: 'Pågår', className: 'bg-primary-50 text-primary-700 border-primary-200' },
}

/** Etapp H — historikradens slutgap, per uppdragets EGEN goal_type. Läser
    bara MissionFacit-fälten (aldrig progressParts/gap_kr direkt) — historik-
    raden har inget MissionProgress-objekt, bara det frusna facitet.
    Etapp I lägger till kontaktmål-grenen (slutgap_count, "N kontakter
    kvar" — aldrig kr/timmar). */
function formatSlutgap(f: MissionFacit): string {
  if (f.goal_type === 'capacity') {
    if (f.slutgap_hours == null) return 'kapacitet ej konfigurerad'
    return f.slutgap_hours === 0 ? 'målet nått' : `${f.slutgap_hours.toLocaleString('sv-SE')} timmar kvar`
  }
  if (f.goal_type === 'contact') {
    if (f.slutgap_count == null) return '—'
    return f.slutgap_count === 0 ? 'målet nått' : `${f.slutgap_count.toLocaleString('sv-SE')} kontakter kvar`
  }
  if (f.slutgap_kr == null) return '—'
  return f.slutgap_kr === 0 ? 'målet nått' : `${f.slutgap_kr.toLocaleString('sv-SE')} kr kvar`
}

export type MissionResolveAction = 'cancel' | 'complete'

// ─────────────────────────────────────────────────────────────────
// Etapp X — Mission Mandates V1, ägarens upplevelse.
// ─────────────────────────────────────────────────────────────────

/** Ägarens formulärutkast (kryssrutor + tak) medan mandatdialogen är öppen —
    lever bara i MissionPanel-behållarens state, se filhuvudet. */
export interface MandateDraft {
  selectedTypes: MandateActionType[]
  daily_cap: number
  total_cap: number
  /** Rå strängen ur inputfältet — tomt = "standardtaket gäller" (aldrig taklöst). */
  amount_cap_kr: string
  expires_at: string
}

/** Strukturellt sant, inte en ofullständig lista: bara de fyra sändtyperna
    KAN mandateras (lib/autonomy/earned-autonomy.ts ALLOWLIST), så varje
    handling som SKAPAR eller ÄNDRAR något — eller flyttar pengar eller
    adresserar en ny mottagare — kräver alltid ett separat godkännande.
    Renderas ALLTID i mandatdialogen (aldrig bakom en till-knapp) — Codex
    "förtroende byggs av synlighet". */
const MANDATE_ALWAYS_SEPARATE = ['Fakturaskapande', 'Prisändringar', 'ÄTA', 'Nya mottagare', 'Pengaförflyttningar']

const MANDATE_PAUSE_REASON_LABEL: Record<string, string> = {
  delivery_failures: 'Mandatet pausades automatiskt efter upprepade leveransfel.',
  plan_changed: 'Planen ändrades sedan mandatet gavs, så mandatet pausades automatiskt.',
}

function formatMandateAmountCap(amountCapKr: number | null): string {
  return amountCapKr == null ? 'standardtak gäller' : `${amountCapKr.toLocaleString('sv-SE')} kr per handling`
}

function formatMandateExpires(expiresAt: string): string {
  return new Date(expiresAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })
}

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

/** Etapp X — mätningsraderna, en per typ mandatet omfattar. Döljs helt
    (returnerar null) tills API:t svarat med en facit. */
function MandateFacitLines({ facit }: { facit: MandateFacitResult | null }) {
  if (!facit) return null
  return (
    <ul className="m-0 p-0 list-none space-y-1">
      {facit.per_type.map(row => (
        <li key={row.action_type} className="text-xs text-slate-600 tabular-nums">
          {AUTONOMY_META[row.action_type].label}: {row.utforda} utförda · {row.leveransfel} leveransfel · {row.stopp_inom_7d} STOPP inom 7 dagar
        </li>
      ))}
    </ul>
  )
}

/** Etapp X — återkalla-knappen, alltid nåbar från active/paused. Samma
    tvåstegs-"Säker?"-idiom som Avsluta uppdraget-flödet nedan i den här filen. */
function MandateRevokeControl({
  confirmRevoke,
  actionPending,
  onRequestRevoke,
  onCancelRevoke,
  onConfirmRevoke,
}: {
  confirmRevoke: boolean
  actionPending: boolean
  onRequestRevoke?: () => void
  onCancelRevoke?: () => void
  onConfirmRevoke?: () => void
}) {
  if (!confirmRevoke) {
    return (
      <button
        type="button"
        disabled={actionPending}
        onClick={onRequestRevoke}
        className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        Återkalla mandatet
      </button>
    )
  }
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
      <span className="text-sm text-amber-900">
        Säker? Mandatet återkallas — teamet väntar på ditt godkännande för varje handling igen.
      </span>
      <div className="flex gap-1.5 shrink-0">
        <button
          type="button"
          disabled={actionPending}
          onClick={onConfirmRevoke}
          className="px-3 py-1.5 bg-primary-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
        >
          Ja, återkalla
        </button>
        <button
          type="button"
          disabled={actionPending}
          onClick={onCancelRevoke}
          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 disabled:opacity-50"
        >
          Avbryt
        </button>
      </div>
    </div>
  )
}

/** Etapp X — mandatdialogens fält. Kryssrutorna är EN per kandidat-typ
    (aldrig per enskilt mål — ägaren väljer TYPER, planen ger målen, se
    lib/mandates/create.ts:s filhuvud). "Kräver alltid separat godkännande"
    renderas ALLTID här, aldrig bakom en till-knapp. */
function MandateFormFields({
  candidates,
  draft,
  deadline,
  submitting,
  onToggleType,
  onDailyCapChange,
  onTotalCapChange,
  onAmountCapChange,
  onExpiresChange,
  onSubmit,
  onCancel,
}: {
  candidates: MandateCandidateType[]
  draft: MandateDraft | null
  deadline: string
  submitting: boolean
  onToggleType?: (type: MandateActionType) => void
  onDailyCapChange?: (value: number) => void
  onTotalCapChange?: (value: number) => void
  onAmountCapChange?: (value: string) => void
  onExpiresChange?: (value: string) => void
  onSubmit?: () => void
  onCancel?: () => void
}) {
  if (!draft) return null
  return (
    <div className="border border-slate-200 rounded-xl p-3 space-y-3">
      <div className="space-y-2">
        {candidates.map(c => (
          <label key={c.type} className="flex items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={draft.selectedTypes.includes(c.type)}
              onChange={() => onToggleType?.(c.type)}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="block font-medium">{AUTONOMY_META[c.type].label}</span>
              <span className="block text-xs text-slate-500 truncate">{c.targets.map(t => t.title).join(', ')}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-600">
          Per dag (max)
          <input
            type="number"
            min={1}
            max={25}
            value={draft.daily_cap}
            onChange={e => onDailyCapChange?.(Number(e.target.value))}
            className="mt-1 w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
          />
        </label>
        <label className="text-xs text-slate-600">
          För hela mandatet (max)
          <input
            type="number"
            min={1}
            max={200}
            value={draft.total_cap}
            onChange={e => onTotalCapChange?.(Number(e.target.value))}
            className="mt-1 w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
          />
        </label>
      </div>

      <label className="block text-xs text-slate-600">
        Beloppstak per handling (kr)
        <input
          type="number"
          min={1}
          value={draft.amount_cap_kr}
          placeholder="standardtak gäller"
          onChange={e => onAmountCapChange?.(e.target.value)}
          className="mt-1 w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
        />
      </label>

      <label className="block text-xs text-slate-600">
        Sista giltighetsdag
        <input
          type="date"
          max={deadline.slice(0, 10)}
          value={draft.expires_at}
          onChange={e => onExpiresChange?.(e.target.value)}
          className="mt-1 w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
        />
      </label>

      <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl">
        <p className="m-0 mb-1 text-xs font-semibold text-slate-600">Kräver alltid separat godkännande</p>
        <ul className="m-0 pl-4 text-xs text-slate-500 space-y-0.5">
          {MANDATE_ALWAYS_SEPARATE.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={onSubmit}
          className="flex-1 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          Ge mandatet
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={onCancel}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 disabled:opacity-50"
        >
          Avbryt
        </button>
      </div>
    </div>
  )
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
  agentUtfall = [],
  history = [],
  learning = null,
  mandate = null,
  mandateFacit = null,
  mandateFormOpen = false,
  mandateDraft = null,
  mandateSubmitting = false,
  mandateError = null,
  mandateConfirmRevoke = false,
  mandateActionPending = false,
  onOpenMandateForm,
  onCloseMandateForm,
  onToggleMandateType,
  onMandateDailyCapChange,
  onMandateTotalCapChange,
  onMandateAmountCapChange,
  onMandateExpiresChange,
  onSubmitMandate,
  onRequestRevokeMandate,
  onCancelRevokeMandate,
  onConfirmRevokeMandate,
  onResumeMandate,
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
  /** Etapp H — det AKTIVA uppdragets per-agent-facit (lib/mission/mission-facit.ts).
      Tom lista tills /api/mission/history hunnit svara — sektionen döljs då tyst. */
  agentUtfall?: AgentUtfall[]
  /** Etapp H — tidigare uppdrag (aktiva uppdraget är redan uteslutet av anroparen). */
  history?: MissionFacit[]
  /** Etapp H — null när /api/mission/history inte hunnit svara ELLER felade;
      lärdomssektionen renderas då aldrig (se filhuvudet). */
  learning?: { rows: LearningRow[]; forTidigt: boolean; antalEligible: number } | null
  /** Etapp X — mandatet kopplat till uppdraget, OAVSETT status. null = aldrig
      givet något mandat (se lib/mandates/mission-mandate.ts:loadActiveMandateForMission). */
  mandate?: MandateRow | null
  /** Etapp X — mätningen (lib/mandates/mandate-facit.ts). null tills API:t
      svarat, eller när inget mandate finns. */
  mandateFacit?: MandateFacitResult | null
  /** Etapp X — mandatdialogens öppna/stängda-state (ägs av MissionPanel-behållaren). */
  mandateFormOpen?: boolean
  /** Etapp X — formulärutkastet. Krävs bara när mandateFormOpen är true. */
  mandateDraft?: MandateDraft | null
  mandateSubmitting?: boolean
  /** Etapp X — senaste avvisningsorsaken från POST/PATCH, på svenska. */
  mandateError?: string | null
  /** Etapp X — "Säker?"-läget för återkallelsen (samma tvåstegsidiom som confirmAction). */
  mandateConfirmRevoke?: boolean
  /** Etapp X — en revoke/resume-begäran pågår, inaktiverar knapparna. */
  mandateActionPending?: boolean
  onOpenMandateForm?: () => void
  onCloseMandateForm?: () => void
  onToggleMandateType?: (type: MandateActionType) => void
  onMandateDailyCapChange?: (value: number) => void
  onMandateTotalCapChange?: (value: number) => void
  onMandateAmountCapChange?: (value: string) => void
  onMandateExpiresChange?: (value: string) => void
  onSubmitMandate?: () => void
  onRequestRevokeMandate?: () => void
  onCancelRevokeMandate?: () => void
  onConfirmRevokeMandate?: () => void
  onResumeMandate?: () => void
}) {
  const goalType = resolveGoalType(mission.goal_type)
  const headline = buildMissionHeadline(
    mission.goal_kr ?? 0,
    mission.deadline.slice(0, 10),
    goalType === 'capacity'
      ? { goalType, goalHours: mission.goal_hours ?? undefined }
      : goalType === 'contact'
        ? { goalType, goalCount: mission.goal_count ?? undefined }
        : undefined,
  )
  const deadlineLabel = new Date(mission.deadline).toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const steps = Array.isArray(mission.plan_snapshot?.steps) ? mission.plan_snapshot.steps : []
  const sections = groupStepsByClass(steps)
  // Etapp X: vilka typer/mål planen ens KAN mandateras för — samma härledning
  // som servern (app/api/mission/[id]/mandate/route.ts) gör om vid POST,
  // aldrig en egen kopia av logiken.
  const mandateCandidates: MandateCandidateType[] = deriveMandateCandidates(steps)
  // Etapp D/F/I-facit: gap_kr/gap_hours/gap_count är ömsesidigt uteslutande
  // — "klart" är ETT av de tre, aldrig en gissning från de andra fälten.
  const gapClosed = goalType === 'capacity'
    ? progress.gap_hours === 0
    : goalType === 'contact'
      ? progress.gap_count === 0
      : progress.gap_kr === 0

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

        {/* Etapp X — Mandat. Bara relevant när planen faktiskt innehåller
            minst ett steg av en mandaterbar typ (mandateCandidates); en
            plan utan sådana steg har inget att delegera och sektionen
            renderas då inte alls. */}
        {mandateCandidates.length > 0 && (
          <div>
            <h3 className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Mandat</h3>
            {mandateError && (
              <p className="m-0 mb-2 text-xs text-red-600">{mandateError}</p>
            )}

            {!mandate && (
              mandateFormOpen ? (
                <MandateFormFields
                  candidates={mandateCandidates}
                  draft={mandateDraft}
                  deadline={mission.deadline}
                  submitting={mandateSubmitting}
                  onToggleType={onToggleMandateType}
                  onDailyCapChange={onMandateDailyCapChange}
                  onTotalCapChange={onMandateTotalCapChange}
                  onAmountCapChange={onMandateAmountCapChange}
                  onExpiresChange={onMandateExpiresChange}
                  onSubmit={onSubmitMandate}
                  onCancel={onCloseMandateForm}
                />
              ) : (
                <button
                  type="button"
                  onClick={onOpenMandateForm}
                  className="w-full py-2.5 px-3 border border-primary-200 bg-primary-50 text-primary-700 rounded-xl text-sm font-semibold hover:bg-primary-100 transition-colors"
                >
                  Låt teamet genomföra inom mina gränser
                </button>
              )
            )}

            {mandate && mandate.status === 'active' && (
              <div className="space-y-2">
                <p className="m-0 text-xs text-slate-600">
                  {mandate.allowed_action_types.map(t => AUTONOMY_META[t].label).join(', ')} · {mandate.daily_cap} per dag ·{' '}
                  {mandate.total_cap} för hela mandatet · giltigt t.o.m. {formatMandateExpires(mandate.expires_at)} ·{' '}
                  {formatMandateAmountCap(mandate.amount_cap_kr)}
                </p>
                <MandateFacitLines facit={mandateFacit} />
                <MandateRevokeControl
                  confirmRevoke={mandateConfirmRevoke}
                  actionPending={mandateActionPending}
                  onRequestRevoke={onRequestRevokeMandate}
                  onCancelRevoke={onCancelRevokeMandate}
                  onConfirmRevoke={onConfirmRevokeMandate}
                />
              </div>
            )}

            {mandate && mandate.status === 'paused' && (
              <div className="space-y-2">
                <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
                  <p className="m-0">
                    {(mandate.pause_reason && MANDATE_PAUSE_REASON_LABEL[mandate.pause_reason]) ?? 'Mandatet är pausat.'}
                  </p>
                  {mandate.pause_reason === 'plan_changed' ? (
                    <p className="m-0 mt-1 text-xs">Skapa ett nytt mandat för den nya planen.</p>
                  ) : (
                    <button
                      type="button"
                      disabled={mandateActionPending}
                      onClick={onResumeMandate}
                      className="mt-2 px-3 py-1.5 bg-primary-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                    >
                      Starta om mandatet
                    </button>
                  )}
                </div>
                <MandateFacitLines facit={mandateFacit} />
                <MandateRevokeControl
                  confirmRevoke={mandateConfirmRevoke}
                  actionPending={mandateActionPending}
                  onRequestRevoke={onRequestRevokeMandate}
                  onCancelRevoke={onCancelRevokeMandate}
                  onConfirmRevoke={onConfirmRevokeMandate}
                />
              </div>
            )}

            {mandate && (mandate.status === 'revoked' || mandate.status === 'expired' || mandate.status === 'completed') && (
              <div className="space-y-2">
                <p className="m-0 text-xs text-slate-500">
                  {mandate.status === 'revoked' && 'Mandatet är återkallat.'}
                  {mandate.status === 'expired' && 'Mandatets giltighetstid har gått ut.'}
                  {mandate.status === 'completed' && 'Mandatet är avslutat.'}
                </p>
                <MandateFacitLines facit={mandateFacit} />
                {mandateFormOpen ? (
                  <MandateFormFields
                    candidates={mandateCandidates}
                    draft={mandateDraft}
                    deadline={mission.deadline}
                    submitting={mandateSubmitting}
                    onToggleType={onToggleMandateType}
                    onDailyCapChange={onMandateDailyCapChange}
                    onTotalCapChange={onMandateTotalCapChange}
                    onAmountCapChange={onMandateAmountCapChange}
                    onExpiresChange={onMandateExpiresChange}
                    onSubmit={onSubmitMandate}
                    onCancel={onCloseMandateForm}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={onOpenMandateForm}
                    className="w-full py-2.5 px-3 border border-primary-200 bg-primary-50 text-primary-700 rounded-xl text-sm font-semibold hover:bg-primary-100 transition-colors"
                  >
                    Ge teamet ett nytt mandat
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Etapp H — teamet på DET AKTIVA uppdraget. Läser bara agentUtfall
            (AgentUtfall-fälten) — aldrig plan_snapshot-stegen igen, se
            filhuvudet. Döljs helt tills /api/mission/history svarat. */}
        {agentUtfall.length > 0 && (
          <div>
            <h3 className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Teamet</h3>
            <ul className="m-0 p-0 list-none space-y-2">
              {agentUtfall.map(a => (
                <li key={a.agent_key} className="flex items-center gap-2.5">
                  {renderAgentChip(a.agent_key)}
                  <span className="text-sm text-slate-700 tabular-nums">
                    {`ansvarar ${a.ansvarar_steg} steg · ${a.utforda} utförda · ${a.vantar} väntar`}
                    {a.kunde_inte_verifieras > 0 && ` · ${a.kunde_inte_verifieras} kunde inte verifieras`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Etapp H — tidigare uppdrag. Aktiva uppdraget är redan uteslutet
            av anroparen (MissionPanel nedan). */}
        {history.length > 0 && (
          <div>
            <h3 className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Tidigare uppdrag</h3>
            <ul className="m-0 p-0 list-none space-y-2">
              {history.map(f => {
                const badge = HISTORY_STATUS_BADGE[f.status]
                return (
                  <li key={f.mission_id} className="border border-slate-200 rounded-xl p-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${badge.className}`}>
                        {badge.text}
                      </span>
                      <span className="text-sm text-slate-900 truncate">{f.headline}</span>
                    </div>
                    <p className="m-0 text-xs text-slate-500 tabular-nums">
                      {`${formatSlutgap(f)} · ${f.verifierat_betalt_kr.toLocaleString('sv-SE')} kr verifierat betalt`}
                    </p>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Etapp H — Mission Learning-läslagret. Renderas ALDRIG när
            /api/mission/history-anropet felat (learning === null) — se
            filhuvudet och lib/mission/mission-learning.ts. */}
        {learning && (
          <div>
            <h3 className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Lärdomar</h3>
            {learning.forTidigt ? (
              <p className="m-0 text-sm text-slate-400">
                {`För tidigt att se mönster — ${learning.antalEligible} genomförda uppdrag hittills.`}
              </p>
            ) : (
              <ul className="m-0 p-0 list-none space-y-2">
                {learning.rows.map((r, i) => (
                  <li key={i}>
                    <p className="m-0 text-sm text-slate-700">{r.text}</p>
                    <p className="m-0 text-xs text-slate-400">{r.grund}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

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
  const { mission, progress, decisions, mandate, mandateFacit, panelOpen, setPanelOpen, refresh } = useMission()
  const { setActiveTab, setIsOpen } = useJobbuddy()
  const [confirmAction, setConfirmAction] = useState<MissionResolveAction | null>(null)
  const [resolving, setResolving] = useState(false)
  // Etapp H — team/historik/lärdomar. null tills /api/mission/history svarat
  // (eller vid fel — se filhuvudets learning===null-regel).
  const [history, setHistory] = useState<{
    facit: MissionFacit[]
    learning: { rows: LearningRow[]; forTidigt: boolean; antalEligible: number }
  } | null>(null)

  // Etapp X — mandatdialogens formulärstate. mandate/mandateFacit själva
  // kommer ur useMission() (samma /api/mission/active-svar som mission/
  // progress/decisions) — den här behållaren äger bara UI-utkastet och
  // in-flight-flaggorna för POST/PATCH-anropen.
  const [mandateFormOpen, setMandateFormOpen] = useState(false)
  const [mandateDraft, setMandateDraft] = useState<MandateDraft | null>(null)
  const [mandateSubmitting, setMandateSubmitting] = useState(false)
  const [mandateError, setMandateError] = useState<string | null>(null)
  const [mandateConfirmRevoke, setMandateConfirmRevoke] = useState(false)
  const [mandateActionPending, setMandateActionPending] = useState(false)

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

  // Etapp X — samma nollställning för mandatdialogen: en halvifylld dialog
  // eller ett kvarglömt "Säker?" på återkallelsen ska inte möta hantverkaren
  // nästa gång panelen öppnas.
  useEffect(() => {
    if (!panelOpen) {
      setMandateFormOpen(false)
      setMandateDraft(null)
      setMandateError(null)
      setMandateConfirmRevoke(false)
    }
  }, [panelOpen])

  // Etapp H — EN lazy fetch mot /api/mission/history varje gång panelen
  // öppnas (inte per render): samma svar ger både det aktiva uppdragets
  // per-agent-facit och historik-/lärdomsraderna, se filhuvudet. Ett
  // nätverksfel eller ett icke-ok-svar lämnar history som null — de tre
  // sektionerna döljer sig då tyst i MissionPanelView.
  useEffect(() => {
    if (!panelOpen) return
    let aktiv = true
    fetch('/api/mission/history')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!aktiv) return
        if (d && Array.isArray(d.facit) && d.learning) {
          setHistory({ facit: d.facit, learning: d.learning })
        } else {
          setHistory(null)
        }
      })
      .catch(() => {
        if (aktiv) setHistory(null)
      })
    return () => {
      aktiv = false
    }
  }, [panelOpen])

  if (!panelOpen) return null
  if (!mission || mission.status !== 'active' || !progress) return null

  // Etapp H: det aktiva uppdragets egen rad ur samma /api/mission/history-
  // svar (normalt facit[0] eftersom bara ETT uppdrag kan vara aktivt åt
  // gången, men letas upp på mission_id i stället för att anta index) ger
  // per-agent-facitet; resten av raderna är historiken.
  const aktivFacit = history?.facit.find(f => f.mission_id === mission.id) ?? null
  const agentUtfall = aktivFacit?.per_agent ?? []
  const tidigareUppdrag = (history?.facit ?? []).filter(f => f.mission_id !== mission.id)

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

  // Etapp X — mandatdialogen. Öppnas med FÄRSKT härledda kandidater/defaults
  // ur den aktiva planen (samma härledning servern gör om vid POST — se
  // MissionPanelView ovan), aldrig ett kvarhållet gammalt utkast.
  function openMandateForm() {
    const steps = Array.isArray(mission?.plan_snapshot?.steps) ? mission!.plan_snapshot.steps : []
    const candidates = deriveMandateCandidates(steps)
    const caps = deriveDefaultCaps(candidates)
    setMandateDraft({
      selectedTypes: candidates.map(c => c.type),
      daily_cap: caps.daily_cap,
      total_cap: caps.total_cap,
      amount_cap_kr: '',
      expires_at: mission!.deadline.slice(0, 10),
    })
    setMandateError(null)
    setMandateFormOpen(true)
  }

  function closeMandateForm() {
    setMandateFormOpen(false)
    setMandateDraft(null)
    setMandateError(null)
  }

  function toggleMandateType(type: MandateActionType) {
    setMandateDraft(d => {
      if (!d) return d
      const included = d.selectedTypes.includes(type)
      return { ...d, selectedTypes: included ? d.selectedTypes.filter(t => t !== type) : [...d.selectedTypes, type] }
    })
  }

  async function submitMandate() {
    if (!mandateDraft || !mission) return
    const steps = Array.isArray(mission.plan_snapshot?.steps) ? mission.plan_snapshot.steps : []
    const candidates = deriveMandateCandidates(steps)
    // Ägaren väljer TYPER (kryssrutorna); målen för varje vald typ är ALLA
    // planens namngivna mål för den typen — aldrig fritext, aldrig ett
    // enskilt mål ägaren skrivit in (se lib/mandates/create.ts:s filhuvud).
    const targets: Record<string, string[]> = {}
    for (const type of mandateDraft.selectedTypes) {
      const candidate = candidates.find(c => c.type === type)
      if (!candidate) continue
      targets[MANDATE_TARGET_LIST_KEY[type]] = candidate.targets.map(t => t.ref_id)
    }
    setMandateSubmitting(true)
    setMandateError(null)
    try {
      const res = await fetch(`/api/mission/${mission.id}/mandate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allowed_action_types: mandateDraft.selectedTypes,
          targets,
          daily_cap: mandateDraft.daily_cap,
          total_cap: mandateDraft.total_cap,
          amount_cap_kr: mandateDraft.amount_cap_kr === '' ? null : Number(mandateDraft.amount_cap_kr),
          expires_at: mandateDraft.expires_at,
        }),
      })
      if (res.ok) {
        refresh()
        closeMandateForm()
      } else {
        const data = await res.json().catch(() => null)
        setMandateError(data?.error ?? 'Kunde inte skapa mandatet.')
      }
    } catch {
      setMandateError('Kunde inte skapa mandatet — kontrollera anslutningen och försök igen.')
    } finally {
      setMandateSubmitting(false)
    }
  }

  async function confirmRevokeMandate() {
    if (!mission) return
    setMandateActionPending(true)
    try {
      const res = await fetch(`/api/mission/${mission.id}/mandate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke' }),
      })
      if (res.ok) refresh()
    } catch {
      // Best effort — panelen stannar öppen så ägaren kan försöka igen.
    } finally {
      setMandateActionPending(false)
      setMandateConfirmRevoke(false)
    }
  }

  async function resumeMandate() {
    if (!mission) return
    setMandateActionPending(true)
    try {
      const res = await fetch(`/api/mission/${mission.id}/mandate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume' }),
      })
      if (res.ok) refresh()
    } catch {
      // Best effort — panelen stannar öppen så ägaren kan försöka igen.
    } finally {
      setMandateActionPending(false)
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
        agentUtfall={agentUtfall}
        history={tidigareUppdrag}
        learning={history?.learning ?? null}
        mandate={mandate}
        mandateFacit={mandateFacit}
        mandateFormOpen={mandateFormOpen}
        mandateDraft={mandateDraft}
        mandateSubmitting={mandateSubmitting}
        mandateError={mandateError}
        mandateConfirmRevoke={mandateConfirmRevoke}
        mandateActionPending={mandateActionPending}
        onOpenMandateForm={openMandateForm}
        onCloseMandateForm={closeMandateForm}
        onToggleMandateType={toggleMandateType}
        onMandateDailyCapChange={v => setMandateDraft(d => (d ? { ...d, daily_cap: v } : d))}
        onMandateTotalCapChange={v => setMandateDraft(d => (d ? { ...d, total_cap: v } : d))}
        onMandateAmountCapChange={v => setMandateDraft(d => (d ? { ...d, amount_cap_kr: v } : d))}
        onMandateExpiresChange={v => setMandateDraft(d => (d ? { ...d, expires_at: v } : d))}
        onSubmitMandate={submitMandate}
        onRequestRevokeMandate={() => setMandateConfirmRevoke(true)}
        onCancelRevokeMandate={() => setMandateConfirmRevoke(false)}
        onConfirmRevokeMandate={confirmRevokeMandate}
        onResumeMandate={resumeMandate}
      />
    </div>
  )
}
