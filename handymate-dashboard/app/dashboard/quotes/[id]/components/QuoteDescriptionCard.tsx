'use client'

import type { Quote } from '../types'

interface QuoteDescriptionCardProps {
  quote: Quote
}

/**
 * Renderar beskrivningen som ett kort (eyebrow-rubrik + body i DM Sans).
 * Inlednings-/avslutningstext (quote.introduction_text/conclusion_text)
 * renderas INTE längre — redundanta mot beskrivningen, som numera är
 * offertens öppningstext (pilot-beslut 2026-07). Fälten kan fortfarande
 * finnas på gamla offerter men visas inte.
 */
export function QuoteDescriptionCard({ quote }: QuoteDescriptionCardProps) {
  if (!quote.description) {
    return null
  }

  return <TextCard label="Beskrivning" body={quote.description} preserveWhitespace={false} />
}

function TextCard({
  label,
  body,
  preserveWhitespace,
}: {
  label: string
  body: string
  preserveWhitespace: boolean
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">{label}</p>
      <p
        className={`text-sm text-slate-700 leading-relaxed font-body ${
          preserveWhitespace ? 'whitespace-pre-wrap' : ''
        }`}
      >
        {body}
      </p>
    </div>
  )
}
