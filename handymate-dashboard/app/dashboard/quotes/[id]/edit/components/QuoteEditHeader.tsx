'use client'

import { Loader2 } from 'lucide-react'
import Link from 'next/link'

interface QuoteEditHeaderProps {
  quoteNumber: string
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error'
}

export function QuoteEditHeader({ quoteNumber, autoSaveStatus }: QuoteEditHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center">
        <Link
          href="/dashboard/quotes"
          className="text-[13px] text-[#64748B] hover:text-[#1E293B] transition-colors"
        >
          ← Offerter
        </Link>
        <span className="text-[18px] font-medium text-[#1E293B] ml-3">
          Redigera offert
          {quoteNumber && (
            <span className="ml-1.5 text-[13px] font-normal text-[#94A3B8]">{quoteNumber}</span>
          )}
        </span>
        {autoSaveStatus === 'saving' && (
          <span className="ml-3 text-[11px] text-[#94A3B8] flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Sparar...
          </span>
        )}
        {autoSaveStatus === 'saved' && (
          <span className="ml-3 text-[11px] text-[#0F766E] flex items-center gap-1">✓ Sparad</span>
        )}
        {autoSaveStatus === 'error' && (
          <span className="ml-3 text-[11px] text-red-500">Kunde inte spara</span>
        )}
      </div>
    </div>
  )
}
