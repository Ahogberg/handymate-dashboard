'use client'

import { X } from 'lucide-react'
import { ESCAPE_LABELS, type EscapeRoute } from '@/lib/quotes/quick-preferences'

/**
 * "Vill du alltid börja så här?" — frågas EN gång (etapp D2, 2026-08-06).
 *
 * ═══ VARFÖR EN BANDEROLL OCH INTE EN DIALOG ═══
 *
 * Frågan dyker upp precis när hantverkaren tagit sig dit han ville och är på
 * väg att börja jobba. En modal hade stoppat honom för att ställa en fråga han
 * inte bett om — och hela sprinten går ut på att ta bort beslut ur flödet, inte
 * lägga till dem på nya ställen.
 *
 * Banderollen syns, kan besvaras med ett tryck, och kan ignoreras helt. Följer
 * samma idiom som ReservationSuggestionBanner: aldrig avbrytande.
 *
 * ═══ ETT NEJ ÄR OCKSÅ ETT SVAR ═══
 *
 * Alla tre vägarna ut — Ja, Nej tack och ×-knappen — markerar frågan som
 * ställd. Att komma tillbaka efter ett nej, eller efter att någon aktivt
 * stängt rutan, är precis det tjat som får folk att sluta läsa banderoller.
 */

interface QuickStartPreferenceBannerProps {
  route: EscapeRoute
  onAccept: () => void
  onDecline: () => void
}

export function QuickStartPreferenceBanner({ route, onAccept, onDecline }: QuickStartPreferenceBannerProps) {
  return (
    <div className="bg-primary-50 border border-primary-100 rounded-2xl p-4 anim-rise">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            Vill du alltid börja {ESCAPE_LABELS[route]}?
          </p>
          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
            Du har tagit dig hit tre gånger. Vi kan hoppa över mellansteget nästa gång —
            du kan alltid ändra dig.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={onAccept}
              className="px-3.5 py-2 bg-primary-700 hover:bg-primary-600 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Ja, börja här
            </button>
            <button
              type="button"
              onClick={onDecline}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-white rounded-lg transition-colors"
            >
              Nej tack
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onDecline}
          className="flex-shrink-0 p-1 text-slate-400 hover:text-slate-700 transition-colors"
          aria-label="Stäng"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
