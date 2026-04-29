'use client'

import Link from 'next/link'
import { Sparkles } from 'lucide-react'

interface QuoteNewHeaderProps {
  aiGenerated: boolean
  aiConfidence: number | null
  aiPriceWarning: { message: string; link: string } | null
  aiPhotoCount: number
}

/**
 * Header för ny-offert-vyn. Skiljer sig från edit-headern på två sätt:
 * 1. Ingen quote-nummer eller autosave (offerten finns inte i DB än)
 * 2. AI-status-badges (genererad, säkerhet, foto-räknare, prisvarning)
 */
export function QuoteNewHeader({ aiGenerated, aiConfidence, aiPriceWarning, aiPhotoCount }: QuoteNewHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center">
        <Link
          href="/dashboard/quotes"
          className="text-[13px] text-[#64748B] hover:text-[#1E293B] transition-colors"
        >
          ← Offerter
        </Link>
        <span className="text-[18px] font-medium text-[#1E293B] ml-3">Ny offert</span>
        {aiGenerated && (
          <span className="ml-2.5 text-[11px] bg-[#CCFBF1] text-[#0F766E] px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            AI-genererad{aiConfidence ? ` · ${aiConfidence}% säkerhet` : ''}
          </span>
        )}
        {aiPriceWarning && (
          <a
            href={aiPriceWarning.link}
            className="ml-2 text-[11px] bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-full hover:bg-amber-100 transition-colors"
          >
            {aiPriceWarning.message.length > 40 ? 'Priser saknas — uppdatera prislista →' : aiPriceWarning.message}
          </a>
        )}
        {aiPhotoCount > 1 && (
          <span className="ml-2 text-[11px] text-gray-400">Baserad på {aiPhotoCount} foton</span>
        )}
      </div>
    </div>
  )
}
