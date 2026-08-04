'use client'

import { Check } from 'lucide-react'
import { formatDate, formatViewDuration } from '../helpers'
import type { Quote, QuoteTrackingEvent } from '../types'

interface QuoteStatusTimelineProps {
  quote: Quote
  trackingEvents: QuoteTrackingEvent[]
}

type StepStatus = 'done' | 'current' | 'upcoming' | 'declined'

interface Step {
  label: string
  sublabel?: string | null
  date: string | null | undefined
  status: StepStatus
}

/**
 * ETAPP 4 (offert-masterplan.md), punkt 3: verklig händelselogg — inte en
 * hårdkodad 5-stegs-timeline. Bygger på FAKTISK data:
 *  - quote_tracking_events (via trackingEvents-prop, se app/api/quotes/route.ts)
 *    loggas av /api/quotes/track när kunden öppnar/stänger signeringssidan
 *    (app/quote/[token]/page.tsx) — en rad per faktisk öppning.
 *  - quote.view_count/first_viewed_at/total_view_seconds — sammanfattning på
 *    quotes-raden, fallback för offerter från innan detaljerad tracking fanns.
 *
 * UTTALAD BEGRÄNSNING (medveten, inte ett förbiseende): quotes.sent_at
 * skrivs över vid VARJE /api/quotes/send-anrop (även påminnelser) — det
 * finns ingen separat påminnelsehistorik i databasen. "Skickad" visar
 * därför senaste utskicket, aldrig en påminnelseräknare eller -lista.
 *
 * Behåller den vertikala timeline-formen visuellt (samma markör-/
 * linjemönster som tidigare) — bara innehållet är nu grundat i verkligt
 * datat istället för statiska antaganden (bl.a. quote.opened_at, som inte
 * är en kolumn som faktiskt skrivs någonstans i kodbasen, används inte
 * längre — first_viewed_at/trackingEvents är de verkliga källorna).
 */
export function QuoteStatusTimeline({ quote, trackingEvents }: QuoteStatusTimelineProps) {
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

  // Öppningar — riktiga per-event-rader när tracking-data finns, annars
  // en sammanfattande rad från quotes.view_count (offerter innan v16).
  const openedEvents = trackingEvents.filter(e => e.event_type === 'opened')
  const MAX_VISIBLE_OPENS = 4
  if (openedEvents.length > 0) {
    const visible = openedEvents.slice(0, MAX_VISIBLE_OPENS)
    visible.forEach(ev => {
      steps.push({
        label: 'Öppnad',
        date: ev.created_at,
        status: 'done',
      })
    })
    const rest = openedEvents.length - visible.length
    if (rest > 0) {
      steps.push({
        label: `+${rest} öppning${rest === 1 ? '' : 'ar'} till`,
        date: null,
        status: 'done',
      })
    }
    const totalDuration = formatViewDuration(quote.total_view_seconds)
    if (totalDuration) {
      steps.push({
        label: 'Total visningstid',
        sublabel: totalDuration,
        date: null,
        status: 'done',
      })
    }
  } else if (quote.view_count && quote.view_count > 0) {
    steps.push({
      label: `Öppnad${quote.view_count > 1 ? ` (${quote.view_count}×)` : ''}`,
      date: quote.first_viewed_at,
      status: 'done',
    })
  } else {
    steps.push({
      label: 'Öppnad',
      date: null,
      status: quote.status === 'sent' ? 'current' : 'upcoming',
    })
  }

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
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Händelselogg</p>
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
        {step.sublabel ? (
          <p className="text-xs text-slate-400 mt-0.5">{step.sublabel}</p>
        ) : step.date ? (
          <p className="text-xs text-slate-400 mt-0.5 font-mono">{formatDate(step.date)}</p>
        ) : (
          <p className="text-xs text-slate-300 mt-0.5">—</p>
        )}
      </div>
    </li>
  )
}
