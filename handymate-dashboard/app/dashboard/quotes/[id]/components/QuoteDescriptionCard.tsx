'use client'

import type { Quote } from '../types'

interface QuoteDescriptionCardProps {
  quote: Quote
}

/**
 * Renderar beskrivning + inledningstext + avslutningstext som tre separata
 * kort (eyebrow-rubrik + body i DM Sans). Saknas allt tre returneras null.
 */
export function QuoteDescriptionCard({ quote }: QuoteDescriptionCardProps) {
  if (!quote.description && !quote.introduction_text && !quote.conclusion_text) {
    return null
  }

  return (
    <>
      {quote.description && (
        <TextCard label="Beskrivning" body={quote.description} preserveWhitespace={false} />
      )}
      {quote.introduction_text && (
        <TextCard label="Inledning" body={quote.introduction_text} preserveWhitespace />
      )}
      {quote.conclusion_text && (
        <TextCard label="Avslutning" body={quote.conclusion_text} preserveWhitespace />
      )}
    </>
  )
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
