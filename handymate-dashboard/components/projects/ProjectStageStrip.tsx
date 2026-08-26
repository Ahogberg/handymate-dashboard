'use client'

import { FileSignature, CalendarCheck, Hammer, Target, Search, FileText, CircleDollarSign, Star, Loader2, type LucideIcon } from 'lucide-react'
import { FLOW_SYSTEM_STAGES } from '@/components/pipeline/unified/flow-constants'
import styles from '@/components/pipeline/unified/flow.module.css'

/**
 * ProjectStageStrip (Etapp 4a.1, 2026-05-22).
 *
 * Horisontell 8-fas-tidslinje. Extraherad från StageBars inuti
 * FlowPipeline.tsx (rad 887-934) så samma visuella mönster kan
 * användas på både Verksamhetsöversikten OCH projekt-förstasidan.
 *
 * Två rader: färgade segment (done/current/upcoming) + ikonrad under.
 *
 * Ikonerna mappas HÄR, lokalt — inte i FLOW_SYSTEM_STAGES (redesign
 * 2026-08-14, punkt 02: emoji renderas olika på Android/iOS/Windows).
 * flow-constants.ts's egen `icon`-sträng rörs medvetet inte: den delas
 * med FLOW_AGENTS/FLOW_CATEGORIES och Flödet-pipelinevyn, utanför den
 * här omgångens Projekt-scope.
 *
 * Klick-interaktion (valfri):
 * - Utan onStageClick → ren visuell strip (samma som pipeline-vyn)
 * - Med onStageClick → varje segment + ikon blir klickbar, anropar
 *   callback med stage-id. UI-konsumenten (projekt-förstasidan)
 *   öppnar ProjectStageModal med vald fas
 */

const STAGE_ICONS: Record<string, LucideIcon> = {
  'ps-01': FileSignature,
  'ps-02': CalendarCheck,
  'ps-03': Hammer,
  'ps-04': Target,
  'ps-05': Search,
  'ps-06': FileText,
  'ps-07': CircleDollarSign,
  'ps-08': Star,
}

interface ProjectStageStripProps {
  currentStageId: string | null | undefined
  density?: 'comfortable' | 'compact'
  /** Om satt: varje fas blir klickbar och callback körs med stage-id */
  onStageClick?: (stageId: string) => void
  /** Visar de korta fasnamnen permanent, avsett för projektsidans header. */
  showStageNames?: boolean
  /** Större header-variant med horisontell scroll på smala skärmar. */
  variant?: 'default' | 'header'
  /** Fas som håller på att sparas. Hindrar dubbelklick och visar spinner. */
  changingStageId?: string | null
}

export function ProjectStageStrip({
  currentStageId,
  density = 'comfortable',
  onStageClick,
  showStageNames = false,
  variant = 'default',
  changingStageId = null,
}: ProjectStageStripProps) {
  // Inget steg = position 0: alla steg "kommande". Tidigare `|| 1` lät ett
  // steglöst projekt (29/34 i prod) se ut som "Kontrakt signerat".
  const currentPos =
    FLOW_SYSTEM_STAGES.find(s => s.id === currentStageId)?.position ?? 0

  const clickable = onStageClick != null

  return (
    <div className={`${styles.projectStageStripScroller} ${variant === 'header' ? styles.projectStageStripScrollerHeader : ''}`}>
      <div
        className={[
          styles.projectStageStrip,
          variant === 'header' ? styles.projectStageStripHeader : '',
          density === 'compact' ? styles.projectStageStripCompact : '',
        ].filter(Boolean).join(' ')}
        data-project-stage-strip
      >
        {FLOW_SYSTEM_STAGES.map(s => {
          const status =
            s.position < currentPos
              ? 'done'
              : s.position === currentPos
                ? 'current'
                : 'upcoming'
          const Icon = STAGE_ICONS[s.id]
          const changing = changingStageId === s.id
          const canSelect = clickable && !changingStageId && s.id !== currentStageId
          const statusLabel = status === 'done' ? 'Klart' : status === 'current' ? 'Pågår' : 'Kommande'

          const activate = () => {
            if (canSelect) onStageClick!(s.id)
          }

          return (
            <div
              key={s.id}
              className={[
                styles.projectStageStep,
                canSelect ? styles.projectStageStepClickable : '',
                changing ? styles.projectStageStepChanging : '',
              ].filter(Boolean).join(' ')}
              style={{
                ['--stage-color' as any]: s.color,
                ['--stage-soft' as any]: `${s.color}18`,
              }}
              onClick={canSelect ? activate : undefined}
              role={canSelect ? 'button' : undefined}
              tabIndex={canSelect ? 0 : undefined}
              aria-current={status === 'current' ? 'step' : undefined}
              aria-label={`${s.position}. ${s.name} · ${statusLabel}${canSelect ? ' · byt till detta steg' : ''}`}
              onKeyDown={canSelect
                ? e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      activate()
                    }
                  }
                : undefined
              }
            >
              <span
                className={[
                  styles.projectStageSegment,
                  status === 'done' ? styles.projectStageSegmentDone : '',
                  status === 'current' ? styles.projectStageSegmentCurrent : '',
                  status === 'upcoming' ? styles.projectStageSegmentUpcoming : '',
                ].filter(Boolean).join(' ')}
              />
              <span
                className={[
                  styles.projectStageIcon,
                  status === 'done' ? styles.projectStageIconDone : '',
                  status === 'current' ? styles.projectStageIconCurrent : '',
                ].filter(Boolean).join(' ')}
              >
                {changing
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />
                  : <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />}
              </span>
              {showStageNames && (
                <span className={styles.projectStageName}>{s.short}</span>
              )}
              <span className={styles.projectStageTooltip} role="tooltip">
                <Icon className="w-4 h-4" strokeWidth={1.8} />
                <span>
                  <strong>Steg {s.position} · {s.name}</strong>
                  <small>{changing ? 'Sparar ändringen…' : canSelect ? `${statusLabel} · klicka för att byta` : statusLabel}</small>
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
