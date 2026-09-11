'use client'

import { ReactNode, useCallback, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check } from 'lucide-react'
import { formatSEK } from '@/lib/format-price'
import ProjectApprovalsBlock from '@/components/projects/ProjectApprovalsBlock'
import ProjectReceiptsBlock from '@/components/projects/ProjectReceiptsBlock'
import type { ProjectApprovalsReadState } from '@/components/projects/ProjectApprovalsBlock'
import { useBusiness } from '@/lib/BusinessContext'
import { projectAdministrationSummary, type ProjectReceiptReadSummary } from '@/lib/projects/administration-summary'

/**
 * ProjectTodoBlock — "Att göra" (Projektvy Fas 1, 2026-07-31).
 *
 * Ordning enligt DESIGN-NOTES.md: primärknapp → röd över-budget-alert
 * (bara i over_budget-läge) → godkänn-kort (ProjectApprovalsBlock) →
 * åtgärdsrader → tomt-läge (bara om helt inget att visa).
 */

/** Typen och etiketterna bor sedan 2026-08-26 i lib/projects/derive-todo.ts
    (ren modul — delas med GET /api/projects så projektlistan visar EXAKT
    samma "nästa steg" som den här knappen: "samma åtgärd, aldrig två olika
    primärer", HANDOFF.md). Re-exporteras här för befintliga importer. */
import { TODO_PRIMARY_LABEL, type TodoMode } from '@/lib/projects/derive-todo'
export { TODO_PRIMARY_LABEL }
export type { TodoMode }

export interface TodoRow {
  id: string
  dotClass: string
  text: ReactNode
  actionLabel: string
  onAction: () => void
}

export interface OverBudgetAlert {
  belopp: number
  moment: string
  timmar: number
}

interface ProjectTodoBlockProps {
  projectId: string
  mode: TodoMode
  primaryHref?: string
  onPrimaryClick?: () => void
  overBudgetAlert?: OverBudgetAlert | null
  actionRows: TodoRow[]
  /** Etapp D1: vidarebefordrar godkännandekortens antal till sidan så
      twin-stripens "Nästa steg" kan visa "X förslag väntar" — samma
      räkning som badgen här, aldrig en egen hämtning. */
  onApprovalsCount?: (count: number) => void
  /** Statusbandet-layouten (2026-08-26): primärknappen bor i sidhuvudet —
      då renderas den INTE här ("samma åtgärd, aldrig två knappar"). */
  hidePrimary?: boolean
}

function ProjectTodoScope({
  projectId,
  mode,
  primaryHref,
  onPrimaryClick,
  overBudgetAlert,
  actionRows,
  onApprovalsCount,
  hidePrimary = false,
}: ProjectTodoBlockProps) {
  const [approvalsCount, setApprovalsCount] = useState(0)
  const [approvalsStatus, setApprovalsStatus] = useState<ProjectApprovalsReadState['status']>('loading')
  const [receiptRead, setReceiptRead] = useState<ProjectReceiptReadSummary>({ status: 'loading', receipts: [], hasMore: false })
  const administration = projectAdministrationSummary({ status: approvalsStatus, count: approvalsCount }, receiptRead)

  const totalCount = approvalsCount + actionRows.length
  const showEmpty = approvalsStatus === 'complete' && totalCount === 0 && !overBudgetAlert
  const handleApprovalsState = useCallback((state: ProjectApprovalsReadState) => {
    setApprovalsCount(state.count)
    setApprovalsStatus(state.status)
    if (state.status === 'complete') onApprovalsCount?.(state.count)
  }, [onApprovalsCount])

  const primaryLabel = TODO_PRIMARY_LABEL[mode]
  const primaryButtonCls =
    'w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 h-[52px] bg-primary-700 hover:bg-primary-800 text-white text-[15px] font-semibold rounded-xl shadow-sm shadow-primary-700/20 transition-colors'

  return (
    <>
    <section aria-labelledby="project-administration-heading" className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <h2 id="project-administration-heading" className="text-sm font-semibold text-slate-950">Administration kring jobbet</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">Handymates förslag och sparade resultat för projektet. Nästa steg och underlag finns nedan.</p>
      <dl className="mt-4 space-y-3 text-sm" aria-live="polite">
        <div><dt className="font-semibold text-slate-900">Behöver din granskning</dt><dd className="mt-1 text-slate-600">{administration.pending}</dd></div>
        <div><dt className="font-semibold text-slate-900">Sparat och skickat</dt><dd className="mt-1 text-slate-600">{administration.handled}</dd></div>
        <div><dt className="font-semibold text-slate-900">Väntar eller behöver kontrolleras</dt><dd className="mt-1 text-slate-600">{administration.waiting}</dd></div>
      </dl>
    </section>
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {/* 2026-08-27: "Att göra" är nu hantverkarens uppgifter (ProjectTasksBlock);
            det här blocket är agenternas förslag + nästa steg som väntar på ägaren. */}
        <h2 className="text-[15px] font-semibold text-gray-900">Projektets ärenden</h2>
        {approvalsCount > 0 && approvalsStatus === 'complete' && (
          <span className="font-heading text-xs font-bold bg-primary-700 text-white rounded-full min-w-[21px] h-[21px] px-1.5 inline-flex items-center justify-center">
            {approvalsCount}
          </span>
        )}
      </div>

      {/* Primärknapp. DESIGN-NOTES beskriver att läge B (klart_ofakturerat)
          "ersätts" av godkänn-kortets egen knapp NÄR ett sådant kort råkar
          finnas — men det kan inte garanteras (godkänn-kortet kommer från
          en fristående pending_approvals-rad). Primärknappen visas därför
          alltid så åtgärden aldrig blir onåbar; se handoff-rapporten. */}
      {!hidePrimary && (primaryHref ? (
        <Link href={primaryHref} className={primaryButtonCls}>
          {primaryLabel}
        </Link>
      ) : (
        <button type="button" onClick={onPrimaryClick} className={primaryButtonCls}>
          {primaryLabel}
        </button>
      ))}

      {overBudgetAlert && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700">
              Nedlagt överstiger offererat med {formatSEK(overBudgetAlert.belopp)}
            </p>
            <p className="text-xs text-red-700/90 mt-1 leading-relaxed">
              Lars flaggade: {overBudgetAlert.moment} tog {overBudgetAlert.timmar} tim mer än kalkylen. Merarbete som
              kunden beställt muntligt bör bli en ÄTA — annars betalar du det själv.
            </p>
          </div>
        </div>
      )}

      <ProjectApprovalsBlock
        projectId={projectId}
        onReadStateChange={handleApprovalsState}
      />

      {actionRows.length > 0 && (
        <h3 className="pt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Nästa steg</h3>
      )}
      {actionRows.map(row => (
        <div
          key={row.id}
          className="bg-white border border-[#E2E8F0] rounded-xl px-4 py-3 min-h-[44px] flex items-center gap-3"
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${row.dotClass}`} />
          <span className="flex-1 min-w-0 text-sm text-gray-700">{row.text}</span>
          <button
            type="button"
            onClick={row.onAction}
            className="text-sm font-semibold text-primary-700 hover:text-primary-800 flex-shrink-0"
          >
            {row.actionLabel}
          </button>
        </div>
      ))}

      {showEmpty && (
        <div className="border border-dashed border-gray-300 rounded-xl px-5 py-7 text-center">
          <span className="w-11 h-11 rounded-full bg-primary-50 text-primary-700 inline-flex items-center justify-center mb-2">
            <Check className="w-5 h-5" strokeWidth={2.5} />
          </span>
          <h3 className="font-semibold text-gray-900">Inga ärenden eller nästa steg visas här</h3>
          <p className="text-sm text-gray-500 mt-0.5 max-w-xs mx-auto">
            Nya förslag visas här för granskning. Kontrollera även kvittona nedan för tidigare utfall.
          </p>
        </div>
      )}
    </div>
    <div className="mt-5">
      <ProjectReceiptsBlock projectId={projectId} onReadStateChange={setReceiptRead} />
    </div>
    </>
  )
}

export default function ProjectTodoBlock(props: ProjectTodoBlockProps) {
  const business = useBusiness()
  return <ProjectTodoScope key={`${business?.business_id || 'loading'}:${props.projectId}`} {...props} />
}
