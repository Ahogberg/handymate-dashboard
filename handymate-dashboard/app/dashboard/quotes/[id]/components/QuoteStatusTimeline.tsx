'use client'

import { Check } from 'lucide-react'
import { formatDate } from '../helpers'
import type { Quote } from '../types'

interface QuoteStatusTimelineProps {
  quote: Quote
}

type StepStatus = 'done' | 'current' | 'upcoming' | 'declined'

interface Step {
  label: string
  date: string | null | undefined
  status: StepStatus
}

/**
 * Vertikal status-timeline (samma mönster som ProjectStageModal):
 *  - Skapad → Skickad → Öppnad → Signerad → Utgår
 *  - Done-stages: green-check + datum
 *  - Current: pulsande ring runt teal-cirkel
 *  - Upcoming: streckad cirkel
 *  - Declined visas som extra rad i red när det gäller
 */
export function QuoteStatusTimeline({ quote }: QuoteStatusTimelineProps) {
  // Bygg steg-listan baserat på quote-status
  const steps: Step[] = []
  steps.push({
    label: 'Skapad',
    date: quote.created_at,
    status: 'done',
  })
  steps.push({
    label: 'Skickad',
    date: quote.sent_at,
    status: quote.sent_at ? 'done' : quote.status === 'draft' ? 'current' : 'upcoming',
  })
  steps.push({
    label: 'Öppnad',
    date: quote.opened_at,
    status: quote.opened_at ? 'done' : quote.status === 'sent' ? 'current' : 'upcoming',
  })
  steps.push({
    label: quote.signed_at ? `Signerad av ${quote.signed_by_name}` : 'Signerad',
    date: quote.signed_at,
    status: quote.signed_at ? 'done' : quote.status === 'opened' ? 'current' : 'upcoming',
  })
  steps.push({
    label: 'Utgår',
    date: quote.valid_until,
    status: 'upcoming',
  })

  if (quote.declined_at) {
    steps.push({ label: 'Nekad', date: quote.declined_at, status: 'declined' })
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Status-historik</p>
      <ol className="relative space-y-1">
        {steps.map((step, i) => (
          <TimelineRow key={i} step={step} isLast={i === steps.length - 1} />
        ))}
      </ol>
    </div>
  )
}

function TimelineRow({ step, isLast }: { step: Step; isLast: boolean }) {
  const isDone = step.status === 'done'
  const isCurrent = step.status === 'current'
  const isDeclined = step.status === 'declined'

  return (
    <li className="relative flex items-start gap-3 py-1.5">
      {/* Connector line under bubble (utom för sista raden) */}
      {!isLast && <span className="absolute left-[11px] top-7 bottom-0 w-px bg-slate-200" aria-hidden />}

      {/* Marker */}
      <div className="relative z-10 mt-0.5 flex-shrink-0">
        {isDone ? (
          <div className="w-[22px] h-[22px] rounded-full bg-green-600 flex items-center justify-center">
            <Check className="w-3 h-3 text-white" strokeWidth={3} />
          </div>
        ) : isCurrent ? (
          <div className="w-[22px] h-[22px] rounded-full bg-primary-700 ring-4 ring-primary-100 animate-pulse" />
        ) : isDeclined ? (
          <div className="w-[22px] h-[22px] rounded-full bg-red-600" />
        ) : (
          <div className="w-[22px] h-[22px] rounded-full bg-white border-2 border-dashed border-slate-300" />
        )}
      </div>

      {/* Innehåll */}
      <div className="flex-1 min-w-0 pt-0.5">
        <p
          className={`text-sm ${
            isDone || isCurrent
              ? 'text-slate-900 font-medium'
              : isDeclined
                ? 'text-red-700 font-semibold'
                : 'text-slate-500'
          }`}
        >
          {step.label}
        </p>
        {step.date ? (
          <p className="text-xs text-slate-400 mt-0.5 font-mono">{formatDate(step.date)}</p>
        ) : (
          <p className="text-xs text-slate-300 mt-0.5">—</p>
        )}
      </div>
    </li>
  )
}
