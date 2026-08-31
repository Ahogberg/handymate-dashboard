'use client'

import { X } from 'lucide-react'

/**
 * FAS D (offertskaparen-design-polish, 2026-09-01): ReservationSuggestionBanner
 * (den fristående "N reservationer matchar dina offertrader"-bannern) är
 * borttagen härifrån — förslagen renderas nu inuti dokumentets egen
 * Reservationer-sektion (QuoteDocument.tsx, `reservationSuggestions`-proppen),
 * inte i assistentkolumnen utanför dokumentet. Discovery-vägen är i stället
 * completeness-chippen (redan amber+räknare, se lib/quotes/quote-completeness.ts).
 *
 * ReservationMutedNotice nedan är en ANNAN, orelaterad affordans (inlärningens
 * tystnings-kvitto) och lämnas orörd i samma fil.
 */

interface MutedNoticeProps {
  title: string
  onUndo: () => void
  onClose: () => void
}

/**
 * Visas EN gång när inlärningen tystat en reservation. Att systemet slutar
 * föreslå något ska aldrig ske i tysthet — då upplevs det som en bugg.
 */
export function ReservationMutedNotice({ title, onUndo, onClose }: MutedNoticeProps) {
  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-700">
            Okej — jag slutar föreslå «{title}». Du kan ändra det under Inställningar → Förbehåll.
          </p>
          <button
            type="button"
            onClick={onUndo}
            className="mt-2 min-h-[36px] inline-flex items-center px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors"
          >
            Ångra
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Stäng"
          className="p-1.5 -m-1 text-slate-400 hover:text-slate-700 rounded-lg transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
