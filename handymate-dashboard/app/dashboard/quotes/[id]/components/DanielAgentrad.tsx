'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import type { QuoteIntelligence } from '@/lib/daniel-intelligence'
import {
  buildAgentradSentence,
  formatDeltaHours,
  formatHours,
  formatMonthYear,
  formatShortDate,
  readAgentradVisibility,
  shouldShowAgentrad,
  snoozeUntil,
  writeAgentradState,
  type AgentradChoice,
  type AgentradEvidence,
  type AgentradVisibility,
} from '@/lib/daniel-agentrad'

/**
 * Daniels agentrad — agentnärvaro i kontext på offertsidan.
 *
 * Skiss: docs/design/skisser-2026-09-06/agentnarvaro-offert.dc.html (bara
 * "agentrad"-mönstret). Sitter under QuoteHeader, ovanför dokumentet — samma
 * plats på varje sida. Teal är chrome; Daniels färg sitter bara på avataren.
 *
 * Raden finns bara när verklighetskontrollen (lib/daniel-intelligence.ts)
 * varnar på minst tre jämförbara avslutade jobb och offerten fortfarande är
 * ett utkast. Bevisen ligger bakom "Visa varför" (docs/design/SYNLIG-
 * INTELLIGENS.md). Inga timmar ändras här — "Lägg till N h" öppnar
 * redigeraren med ?buffert=N, där hantverkaren själv lägger timmarna på
 * arbetsraden. Snooza/avfärda minns per offert och webbläsare
 * (localStorage, aldrig DB).
 */

type AgentradPayload = QuoteIntelligence & { agentrad?: AgentradEvidence | null }

interface DanielAgentradProps {
  quoteId: string
  quoteStatus: string | null | undefined
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function DanielAgentrad({ quoteId, quoteStatus }: DanielAgentradProps) {
  const router = useRouter()
  const [visibility, setVisibility] = useState<AgentradVisibility | null>(null)
  const [payload, setPayload] = useState<AgentradPayload | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [decision, setDecision] = useState<AgentradChoice | null>(null)

  // Minnet läses först på klienten så servern och första klientrenderingen
  // säger samma sak (null → ingen rad) tills vi vet.
  useEffect(() => {
    setVisibility(readAgentradVisibility(quoteId, safeStorage(), Date.now()))
  }, [quoteId])

  // En hämtning per offert — och bara när en rad över huvud taget kan bli
  // aktuell (utkast, inte snoozad/avfärdad).
  useEffect(() => {
    if (visibility !== 'visible' || quoteStatus !== 'draft') return
    let active = true
    fetch(`/api/quotes/intelligence?quoteId=${encodeURIComponent(quoteId)}`)
      .then(async response => {
        const data = await response.json().catch(() => null)
        if (active && data && typeof data.status === 'string') setPayload(data as AgentradPayload)
      })
      .catch(() => {
        // Tyst degradering — ingen rad är bättre än en rad utan bevis.
      })
    return () => {
      active = false
    }
  }, [quoteId, quoteStatus, visibility])

  if (visibility !== 'visible' || !payload || !payload.analysis || !payload.agentrad) return null
  const analysis = payload.analysis
  const evidence = payload.agentrad
  if (!shouldShowAgentrad({
    status: payload.status,
    show_warning: payload.show_warning,
    similar_jobs: analysis.similar_jobs,
    quote_status: quoteStatus,
  })) return null

  const buffer = analysis.suggested_buffer_hours
  if (!(buffer > 0)) return null
  const sampleCount = evidence.sample_count > 0 ? evidence.sample_count : analysis.similar_jobs
  const sentence = buildAgentradSentence({
    sample_count: sampleCount,
    over_count: evidence.over_count,
    suggested_buffer_hours: buffer,
    quoted_hours: analysis.quoted_hours,
    lesson: evidence.lesson,
  })

  const recordDecision = (choice: AgentradChoice) => {
    try {
      void fetch('/api/quotes/intelligence/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId,
          choice,
          suggested_hours: buffer,
          quoted_hours: analysis.quoted_hours,
        }),
      }).catch(() => {})
    } catch {
      // Inlärningen är ett kvitto, aldrig ett hinder för hantverkaren.
    }
  }

  const onAddBuffer = () => {
    recordDecision('lagg_till')
    setDecision('lagg_till')
    router.push(`/dashboard/quotes/${encodeURIComponent(quoteId)}/edit?buffert=${encodeURIComponent(String(buffer))}`)
  }

  const onKeepHours = () => {
    recordDecision('behall')
    setDecision('behall')
    setExpanded(false)
  }

  const onSnooze = () => {
    writeAgentradState(quoteId, safeStorage(), { until: snoozeUntil(Date.now()) })
    setVisibility('snoozed')
  }

  const onDismiss = () => {
    writeAgentradState(quoteId, safeStorage(), { dismissed: true })
    setVisibility('dismissed')
  }

  const ghostBtn = 'h-8 px-3 rounded-lg text-[13px] transition-colors hover:bg-primary-700/10'

  return (
    <section
      aria-label="Daniels agentrad"
      className="mb-6 rounded-2xl bg-primary-50 border border-primary-100 overflow-hidden"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3.5 px-4 py-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <AgentAvatar agentKey="daniel" size="md" />
          <p className="text-sm leading-relaxed text-slate-800 min-w-0">
            <span className="font-semibold text-slate-900">Daniel</span>
            <span className="text-slate-400"> · Säljare</span>
            {' — '}
            {sentence}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1 flex-none pl-12 sm:pl-0">
          <button
            type="button"
            onClick={() => setExpanded(open => !open)}
            aria-expanded={expanded}
            className={`${ghostBtn} font-semibold text-primary-700`}
          >
            {expanded ? 'Dölj' : 'Visa varför'}
          </button>
          <button
            type="button"
            onClick={onSnooze}
            className={`${ghostBtn} font-medium text-slate-500`}
          >
            Snooza
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Avfärda"
            className="w-8 h-8 rounded-lg text-slate-400 hover:bg-primary-700/10 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-primary-100 bg-white px-4 py-4 sm:pl-[66px]">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-2.5">
            Så kom Daniel fram till det
          </h3>

          {evidence.examples.length > 0 || evidence.lesson ? (
            <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-w-3xl list-none p-0 m-0">
              {evidence.examples.map(example => {
                const closed = formatMonthYear(example.closed_at)
                return (
                  <li key={example.project_id} className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 min-w-0">
                    <div className="text-xs text-slate-500">
                      {closed ? `Projekt · avslutat ${closed}` : 'Projekt · avslutat'}
                    </div>
                    <div className="text-sm font-semibold text-slate-900 mt-0.5 truncate" title={example.name}>
                      {example.name}
                    </div>
                    <div className={`font-mono text-[13px] font-semibold mt-1.5 ${example.delta_hours > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
                      {formatDeltaHours(example.delta_hours)}
                    </div>
                  </li>
                )
              })}
              {evidence.lesson && (
                <li className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 min-w-0 sm:col-span-3">
                  <div className="text-xs text-slate-500">
                    {formatShortDate(evidence.lesson.created_at)
                      ? `Debrief · ${formatShortDate(evidence.lesson.created_at)}`
                      : 'Debrief'}
                  </div>
                  <p className="text-sm text-slate-800 italic mt-0.5">”{evidence.lesson.lesson_text}”</p>
                </li>
              )}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">
              Räkningen bygger på {sampleCount} avslutade jobb med samma mall eller jobbtyp; exempelprojekten kunde inte visas.
            </p>
          )}

          {decision === 'behall' ? (
            <p className="mt-3.5 text-sm text-slate-600">
              Du behåller {formatHours(analysis.quoted_hours)} h. Daniel har noterat det.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2 mt-3.5">
              <button
                type="button"
                onClick={onAddBuffer}
                className="h-9 px-3.5 rounded-[10px] bg-primary-700 hover:bg-primary-600 text-white text-[13px] font-semibold transition-colors"
              >
                Lägg till {formatHours(buffer)} h
              </button>
              <button
                type="button"
                onClick={onKeepHours}
                className="h-9 px-3.5 rounded-[10px] border border-slate-200 hover:border-slate-300 bg-white text-slate-700 text-[13px] font-medium transition-colors"
              >
                Behåll {formatHours(analysis.quoted_hours)} h
              </button>
              <span className="text-xs text-slate-400 sm:ml-2">Ditt val lär Daniel hur du vill räkna.</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
