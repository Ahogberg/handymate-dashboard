'use client'

import Link from 'next/link'
import { ArrowLeft, Sparkles } from 'lucide-react'

interface QuoteNewHeaderProps {
  aiGenerated: boolean
  aiConfidence: number | null
  aiPriceWarning: { message: string; link: string } | null
  aiPhotoCount: number
}

/**
 * Sticky header för ny offert. Visar AI-status (genererad, säkerhet,
 * foto-räknare, prisvarning) som badges. Backdrop-blur säkerställer att
 * texten är läsbar när kort scrollar förbi.
 */
export function QuoteNewHeader({
  aiGenerated,
  aiConfidence,
  aiPriceWarning,
  aiPhotoCount,
}: QuoteNewHeaderProps) {
  return (
    <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 mb-6 px-4 sm:px-6 py-3 bg-slate-50/80 backdrop-blur-md border-b border-slate-200/60">
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/dashboard/quotes"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Offerter
        </Link>
        <div className="h-4 w-px bg-slate-300" aria-hidden />
        <h1 className="font-heading text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
          Ny offert
        </h1>
        {aiGenerated && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary-50 text-primary-700 border border-primary-100">
            <Sparkles className="w-3 h-3" />
            AI-genererad{aiConfidence ? ` · ${aiConfidence}%` : ''}
          </span>
        )}
        {aiPriceWarning && (
          <a
            href={aiPriceWarning.link}
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100 transition-colors"
          >
            {aiPriceWarning.message.length > 40
              ? 'Priser saknas — uppdatera prislista →'
              : aiPriceWarning.message}
          </a>
        )}
        {aiPhotoCount > 1 && (
          <span className="text-[11px] text-slate-400">Baserad på {aiPhotoCount} foton</span>
        )}
      </div>
    </div>
  )
}
