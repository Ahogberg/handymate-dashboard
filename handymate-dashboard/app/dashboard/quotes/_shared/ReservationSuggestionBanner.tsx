'use client'

import { ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'

interface ReservationSuggestionBannerProps {
  count: number
  onReview: () => void
}

/**
 * Den tysta bannern — reservationsmotorns enda uppsökande yta.
 *
 * Designregeln: motorn AVBRYTER ALDRIG. 15 artiklar med 15 träffar ger
 * fortfarande EN banner med en siffra, aldrig 15 dialoger. Hantverkaren
 * öppnar granskningen när han själv vill.
 *
 * Mönstret är QuoteNewEfterkalkylBanner: självgardande (return null när det
 * inte finns något), avfärdbar lokalt (aldrig i databasen — nästa offert ska
 * få förslagen igen), agentavatar.
 */
export function ReservationSuggestionBanner({ count, onReview }: ReservationSuggestionBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (count === 0 || dismissed) return null

  return (
    <div className="mb-4 rounded-xl border border-primary-100 bg-primary-50/60 p-3.5">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-primary-700 text-white flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-900">
            {count === 1
              ? '1 reservation matchar dina offertrader.'
              : `${count} reservationer matchar dina offertrader.`}
          </p>
          <button
            type="button"
            onClick={onReview}
            className="mt-2 min-h-[36px] inline-flex items-center px-3 py-1.5 bg-primary-700 text-white text-xs font-semibold rounded-lg hover:bg-primary-800 transition-colors"
          >
            Granska förslag
          </button>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dölj"
          className="p-1.5 -m-1 text-slate-400 hover:text-slate-700 rounded-lg transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

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
