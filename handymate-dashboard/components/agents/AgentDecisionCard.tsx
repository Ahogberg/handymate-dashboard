'use client'

import type { ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { AGENT_INFO } from '@/components/dashboard/agentPersonas'
import { cardActions, voiceVerb, type CardAction, type Voice } from '@/lib/jarvis/voice'

interface AgentDecisionCardProps {
  agentKey: string
  /** 'foreslar' → Godkänn/Ändra/Avvisa · 'fragar' → likvärdiga svar, aldrig Godkänn. */
  voice: Extract<Voice, 'foreslar' | 'fragar'>
  /** Typtaggen: "Offert", "Faktura", "Schema". */
  typeLabel?: string
  /** "14 min sen". Utelämnad i expanderat läge, där Fäll ihop tar platsen. */
  timeLabel?: string
  title: string
  description?: string | null
  /**
   * Amber vänsterkant. **Endast** när pengar eller tid går förlorade om ingen
   * tittar — en förfallen faktura, inte en ny lead. Blir allt gult slutar man
   * läsa gult.
   */
  attention?: boolean
  /** Faktarutan: beloppssammanställning, citerat SMS, tidsöversikt. */
  children?: ReactNode
  approveLabel?: string
  editable?: boolean
  alternatives?: Array<{ id: string; label: string }>
  onAction: (action: CardAction) => void
  /** "Öppna offerten →" — högerställd, diskret. */
  deepLink?: { label: string; href: string }
  /** Ersätter tidsstämpeln i expanderat läge. */
  headerSlot?: ReactNode
  /** Expanderat läge: teal ram, större padding, tealtonad skugga. */
  expanded?: boolean
  /**
   * Döljer knappraden. Används när kortet är i redigeringsläge och äger sina
   * egna knappar — två uppsättningar Godkänn på samma kort gör valet oklart.
   */
  actionsHidden?: boolean
}

/**
 * AgentDecisionCard — kortet för allt som kräver ett beslut (2026-08-07).
 *
 * ═══ ANATOMIN ÄR BUDSKAPET ═══
 *
 * Ram + knappar betyder "det här är ditt jobb". Nyheter renderas som
 * `AgentNewsRow`: platt rad, ingen ram, inga knappar. Skillnaden bärs alltså
 * av formen, inte av färg — man ska kunna skumma sidan på två sekunder och
 * veta exakt vad som väntar på en.
 *
 * ═══ FÄRGEN BOR I AVATAREN ═══
 *
 * Teal är chrome. Per-agent-färgen sitter bara på avatarcirkeln — aldrig på
 * kortram, bakgrund, rubrik eller knapp. Med den regeln blir sex agenter i
 * följd sex små ansikten i ett lugnt flöde i stället för sex färgade kort.
 * Se docs/HANDYMATE_DESIGN_SYSTEM.md, avsnitt 4b.
 *
 * Knappraden byggs av `cardActions` i lib/jarvis/voice.ts, inte här. Regeln
 * "ett kort som frågar får aldrig ha en Godkänn-knapp" är lätt att bryta i
 * JSX vid en senare ombyggnad; i en ren funktion är den facit-testad.
 */
export function AgentDecisionCard({
  agentKey,
  voice,
  typeLabel,
  timeLabel,
  title,
  description,
  attention,
  children,
  approveLabel,
  editable,
  alternatives,
  onAction,
  deepLink,
  headerSlot,
  expanded,
  actionsHidden,
}: AgentDecisionCardProps) {
  const agent = AGENT_INFO[agentKey]
  const actions = cardActions(voice, { approveLabel, editable, alternatives })
  const verb = voiceVerb(voice)

  return (
    <div
      className={[
        'bg-white rounded-2xl border',
        expanded
          ? 'border-primary-200 p-5 shadow-[0_4px_12px_rgba(15,118,110,0.08)]'
          : 'border-slate-200 p-4',
        attention ? 'border-l-4 border-l-amber-600' : '',
      ].join(' ')}
    >
      <div className={`flex items-center gap-2.5 ${expanded ? 'mb-2.5' : 'mb-2'}`}>
        <AgentAvatar agentKey={agentKey} />
        <span className="text-xs text-slate-500 flex-1 min-w-0 truncate">
          <b className="font-semibold text-slate-900">{agent?.name || 'Teamet'}</b>
          {agent?.role ? ` · ${agent.role}` : ''}{' '}
          {/* Verbet är röstmarkören. Teal och fetat när systemet FRÅGAR — då
              finns inget färdigt svar, och det ska synas innan man läser. */}
          {verb && (
            <b className={voice === 'fragar' ? 'font-semibold text-primary-700' : 'font-normal'}>{verb}</b>
          )}
        </span>
        {typeLabel && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-primary-50 text-primary-700 whitespace-nowrap">
            {typeLabel}
          </span>
        )}
        {headerSlot}
        {!headerSlot && timeLabel && <span className="text-xs text-slate-400 whitespace-nowrap">{timeLabel}</span>}
      </div>

      <h3 className={`font-semibold text-slate-900 leading-snug ${expanded ? 'text-[17px] mb-0.5' : 'text-[15px] mb-0.5'}`}>
        {title}
      </h3>
      {description && <p className="text-[13px] text-slate-500 leading-relaxed mb-2.5">{description}</p>}

      {children}

      {!actionsHidden && (
      <div className="flex items-center gap-2 flex-wrap">
        {actions.map(action => (
          <button
            key={action.id}
            type="button"
            onClick={() => onAction(action)}
            className={[
              'inline-flex items-center justify-center rounded-xl text-sm transition-colors',
              expanded ? 'h-10' : 'h-[38px]',
              action.kind === 'diskret' ? 'px-3 gap-1' : expanded ? 'px-[18px] gap-1.5' : 'px-4 gap-1.5',
              action.kind === 'primar'
                ? 'bg-primary-700 hover:bg-primary-800 text-white font-semibold'
                : action.kind === 'sekundar'
                  ? 'bg-white border border-slate-300 text-slate-700 font-medium hover:bg-slate-50'
                  : 'text-slate-400 font-medium hover:text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            {action.icon === 'check' && <Check className="w-4 h-4" />}
            {action.icon === 'x' && <X className="w-[15px] h-[15px]" />}
            {action.label}
          </button>
        ))}

        {deepLink && (
          <a
            href={deepLink.href}
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-primary-700 transition-colors"
          >
            {deepLink.label}
          </a>
        )}
      </div>
      )}
    </div>
  )
}

/** Faktarutan i ett kort — beloppssammanställning, citerat SMS, översikt. */
export function CardFactBox({ children, quote }: { children: ReactNode; quote?: boolean }) {
  return (
    <div
      className={`bg-slate-50 border border-slate-100 rounded-xl mb-3 ${
        quote ? 'px-3.5 py-2.5 text-[13px] text-slate-600 italic leading-relaxed' : 'px-3.5 py-3'
      }`}
    >
      {children}
    </div>
  )
}
