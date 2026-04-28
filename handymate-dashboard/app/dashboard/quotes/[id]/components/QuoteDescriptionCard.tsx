'use client'

import { FileText } from 'lucide-react'
import type { Quote } from '../types'

interface QuoteDescriptionCardProps {
  quote: Quote
}

/**
 * Renderar beskrivning + inledningstext + avslutningstext som tre separata
 * kort. Komponenten visar bara fält som faktiskt har innehåll — saknas allt
 * tre returneras null.
 */
export function QuoteDescriptionCard({ quote }: QuoteDescriptionCardProps) {
  if (!quote.description && !quote.introduction_text && !quote.conclusion_text) {
    return null
  }

  return (
    <>
      {quote.description && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-400" />
            Beskrivning
          </h2>
          <p className="text-gray-700">{quote.description}</p>
        </div>
      )}

      {quote.introduction_text && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-600" />
            Inledning
          </h2>
          <p className="text-gray-700 whitespace-pre-wrap">{quote.introduction_text}</p>
        </div>
      )}

      {quote.conclusion_text && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-400" />
            Avslutning
          </h2>
          <p className="text-gray-700 whitespace-pre-wrap">{quote.conclusion_text}</p>
        </div>
      )}
    </>
  )
}
