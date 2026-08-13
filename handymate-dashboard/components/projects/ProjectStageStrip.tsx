'use client'

import { FileSignature, CalendarCheck, Hammer, Target, Search, FileText, CircleDollarSign, Star, type LucideIcon } from 'lucide-react'
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
  currentStageId: string
  density?: 'comfortable' | 'compact'
  /** Om satt: varje fas blir klickbar och callback körs med stage-id */
  onStageClick?: (stageId: string) => void
}

export function ProjectStageStrip({
  currentStageId,
  density = 'comfortable',
  onStageClick,
}: ProjectStageStripProps) {
  const currentPos =
    FLOW_SYSTEM_STAGES.find(s => s.id === currentStageId)?.position || 1

  const clickable = onStageClick != null

  return (
    <>
      <div className={`${styles.stageBars} ${density === 'compact' ? styles.stageBarsCompact : ''}`}>
        {FLOW_SYSTEM_STAGES.map(s => {
          const status =
            s.position < currentPos
              ? 'done'
              : s.position === currentPos
                ? 'current'
                : 'upcoming'
          const cls = [
            styles.stageSeg,
            status === 'done' ? styles.stageSegDone : '',
            status === 'current' ? styles.stageSegCurrent : '',
            status === 'upcoming' ? styles.stageSegUpcoming : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <div
              key={s.id}
              className={cls}
              style={{
                background: status === 'upcoming' ? undefined : s.color,
                ['--seg-color' as any]: s.color,
                cursor: clickable ? 'pointer' : undefined,
              }}
              title={`${s.position}. ${s.name}${clickable ? ' (klicka för detaljer)' : ''}`}
              onClick={clickable ? () => onStageClick!(s.id) : undefined}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={clickable
                ? e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onStageClick!(s.id)
                    }
                  }
                : undefined
              }
            />
          )
        })}
      </div>
      <div className={styles.stageBarsLabels}>
        {FLOW_SYSTEM_STAGES.map(s => {
          const status =
            s.position < currentPos
              ? 'done'
              : s.position === currentPos
                ? 'current'
                : 'upcoming'
          const cls = [
            styles.stageBarsLabel,
            status === 'done' ? styles.stageBarsLabelDone : '',
            status === 'current' ? styles.stageBarsLabelCurrent : '',
          ]
            .filter(Boolean)
            .join(' ')
          const Icon = STAGE_ICONS[s.id]
          return (
            <div
              key={s.id}
              className={cls}
              style={{
                ['--stage-current-color' as any]: s.color,
                cursor: clickable ? 'pointer' : undefined,
              }}
              title={`${s.position}. ${s.name}`}
              onClick={clickable ? () => onStageClick!(s.id) : undefined}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={clickable
                ? e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onStageClick!(s.id)
                    }
                  }
                : undefined
              }
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
            </div>
          )
        })}
      </div>
    </>
  )
}
