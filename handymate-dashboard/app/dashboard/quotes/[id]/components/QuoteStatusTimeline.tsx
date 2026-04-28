'use client'

import { Clock } from 'lucide-react'
import { formatDate } from '../helpers'
import type { Quote } from '../types'

interface QuoteStatusTimelineProps {
  quote: Quote
}

export function QuoteStatusTimeline({ quote }: QuoteStatusTimelineProps) {
  const steps: Array<{ label: string; date: string | null | undefined; done: boolean; isDeadline?: boolean }> = [
    { label: 'Skapad', date: quote.created_at, done: true },
    { label: 'Skickad', date: quote.sent_at, done: !!quote.sent_at },
    { label: 'Öppnad', date: quote.opened_at, done: !!quote.opened_at },
    {
      label: quote.signed_at ? `Signerad av ${quote.signed_by_name}` : 'Signerad',
      date: quote.signed_at,
      done: !!quote.signed_at,
    },
    { label: 'Utgår', date: quote.valid_until, done: false, isDeadline: true },
  ]

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
      <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Clock className="w-5 h-5 text-primary-700" />
        Status
      </h2>
      <div className="relative space-y-0">
        {/* Connector line */}
        <div className="absolute left-[7px] top-3 bottom-3 w-0.5 bg-gray-200" />
        {steps.map((step, i) => (
          <div key={i} className="relative flex items-start gap-3 py-2">
            <div
              className={`relative z-10 w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 mt-0.5 ${
                step.done
                  ? 'bg-primary-600 border-primary-600'
                  : step.isDeadline
                    ? 'bg-white border-gray-300'
                    : 'bg-white border-gray-300'
              }`}
            >
              {step.done && (
                <svg className="w-full h-full text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span className={`text-sm ${step.done ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{step.label}</span>
              {step.date && <span className="text-xs text-gray-400 ml-2">{formatDate(step.date)}</span>}
              {!step.date && !step.isDeadline && <span className="text-xs text-gray-300 ml-2">—</span>}
            </div>
          </div>
        ))}
        {quote.declined_at && (
          <div className="relative flex items-start gap-3 py-2">
            <div className="relative z-10 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <span className="text-sm text-red-600 font-medium">Nekad</span>
              <span className="text-xs text-gray-400 ml-2">{formatDate(quote.declined_at)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
