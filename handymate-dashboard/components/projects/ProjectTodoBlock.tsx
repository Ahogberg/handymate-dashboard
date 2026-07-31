'use client'

import { ReactNode, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check } from 'lucide-react'
import { formatSEK } from '@/lib/format-price'
import ProjectApprovalsBlock from '@/components/projects/ProjectApprovalsBlock'

/**
 * ProjectTodoBlock — "Att göra" (Projektvy Fas 1, 2026-07-31).
 *
 * Ordning enligt DESIGN-NOTES.md: primärknapp → röd över-budget-alert
 * (bara i over_budget-läge) → godkänn-kort (ProjectApprovalsBlock) →
 * åtgärdsrader → tomt-läge (bara om helt inget att visa).
 */

export type TodoMode = 'nystartat' | 'pagaende' | 'klart_ofakturerat' | 'over_budget'

/** Exporterad så sidhuvudets dubblerade primärknapp (Del 3c) alltid visar
    exakt samma etikett som knappen här — "samma åtgärd, aldrig två olika
    primärer" (HANDOFF.md). */
export const TODO_PRIMARY_LABEL: Record<TodoMode, string> = {
  nystartat: 'Boka första besök',
  pagaende: 'Rapportera tid',
  klart_ofakturerat: 'Godkänn & skicka',
  over_budget: 'Skapa ÄTA',
}

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
}

export default function ProjectTodoBlock({
  projectId,
  mode,
  primaryHref,
  onPrimaryClick,
  overBudgetAlert,
  actionRows,
}: ProjectTodoBlockProps) {
  const [approvalsCount, setApprovalsCount] = useState(0)
  const [approvalsReady, setApprovalsReady] = useState(false)

  const totalCount = approvalsCount + actionRows.length
  const showEmpty = approvalsReady && totalCount === 0 && !overBudgetAlert

  const primaryLabel = TODO_PRIMARY_LABEL[mode]
  const primaryButtonCls =
    'w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 h-[52px] bg-primary-700 hover:bg-primary-800 text-white text-[15px] font-semibold rounded-xl shadow-sm shadow-primary-700/20 transition-colors'

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-[15px] font-semibold text-gray-900">Att göra</h2>
        {totalCount > 0 && (
          <span className="font-heading text-xs font-bold bg-primary-700 text-white rounded-full min-w-[21px] h-[21px] px-1.5 inline-flex items-center justify-center">
            {totalCount}
          </span>
        )}
      </div>

      {/* Primärknapp. DESIGN-NOTES beskriver att läge B (klart_ofakturerat)
          "ersätts" av godkänn-kortets egen knapp NÄR ett sådant kort råkar
          finnas — men det kan inte garanteras (godkänn-kortet kommer från
          en fristående pending_approvals-rad). Primärknappen visas därför
          alltid så åtgärden aldrig blir onåbar; se handoff-rapporten. */}
      {primaryHref ? (
        <Link href={primaryHref} className={primaryButtonCls}>
          {primaryLabel}
        </Link>
      ) : (
        <button type="button" onClick={onPrimaryClick} className={primaryButtonCls}>
          {primaryLabel}
        </button>
      )}

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
        onCountChange={count => {
          setApprovalsCount(count)
          setApprovalsReady(true)
        }}
      />

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
          <h3 className="font-semibold text-gray-900">Inget väntar på dig här</h3>
          <p className="text-sm text-gray-500 mt-0.5 max-w-xs mx-auto">
            När teamet förbereder något för projektet dyker det upp här — du godkänner med ett tryck.
          </p>
        </div>
      )}
    </div>
  )
}
