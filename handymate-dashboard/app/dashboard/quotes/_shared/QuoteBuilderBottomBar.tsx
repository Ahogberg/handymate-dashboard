'use client'

import { Loader2, Send } from 'lucide-react'

interface QuoteBuilderBottomBarProps {
  saving: boolean
  canSend: boolean
  /** Create-läge ENDAST — samma fält som QuoteBuilderHeader redan har, se
      dess docblock. Edit-läget skickar aldrig dessa (undefined), och knappen
      beter sig då precis som i edit-lägets egen header idag: ingen
      orsakstext, ingen bekräftelse-popover. */
  sendDisabledReason?: string
  sendConfirmPending?: boolean
  onConfirmSend?: () => void
  onCancelSend?: () => void
  onSendQuote: () => void
  onSaveDraft: () => void
}

/**
 * Mobilens fasta bottenfält (Fas B, offertskaparen-design-polish,
 * 2026-08-31). `lg:hidden` — synlig ENDAST under `lg`-brytpunkten.
 * QuoteBuilderHeader.tsx:s egen knappgrupp blev i SAMMA pass `hidden
 * lg:flex`, så exakt EN uppsättning Spara/Skicka-knappar är monterad
 * synlig vid varje bredd, aldrig båda samtidigt — se kodkommentaren i
 * QuoteBuilder.tsx (2026-08-06) om den gamla dubbla Skicka-knappen som
 * fick tas bort.
 *
 * Knapparnas disabled-/bekräftelselogik är MEDVETET duplicerad (inte
 * extraherad till en delad hook/komponent) från QuoteBuilderHeader.tsx —
 * samma villkor, samma handlers, bara egen JSX anpassad för en bredare,
 * 52px hög touch-yta i stället för headerns kompakta knappar. Ändras
 * villkoren i ena filen måste de speglas i den andra.
 */
export function QuoteBuilderBottomBar({
  saving,
  canSend,
  sendDisabledReason,
  sendConfirmPending,
  onConfirmSend,
  onCancelSend,
  onSendQuote,
  onSaveDraft,
}: QuoteBuilderBottomBarProps) {
  return (
    <div
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] px-3 pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      {/* RIVNING PAKET C (2026-09-17, rad 2.16): chip-raden ("nästa sak att
          kontrollera", QuoteCompletenessStrip/summaries/sortSectionsByAttention)
          är borttagen — Skicka-knappens egen orsakstext nedan räcker. */}

      {/* ETAPP 1f-motsvarigheten till headerns orsakstext: renderas i NORMALT
          flöde (inte absolut positionerad) ovanför knapparna. Fas B-
          granskningsfix (2026-08-31): en tidigare `absolute -top-5`-variant
          här flöt in i chip-radens nedre padding och riskerade att krocka
          visuellt med den — normalt flöde knuffar i stället bara ner
          knapparna en rad, aldrig en overlap. */}
      {!canSend && sendDisabledReason && (
        <p className="text-[10px] text-slate-400 mb-1.5 px-0.5">{sendDisabledReason}</p>
      )}

      {/* Spara utkast / Skicka offert — samma handlers/villkor som
          QuoteBuilderHeader.tsx:s (nu desktop-only) knappar. */}
      <div className="relative flex items-stretch gap-2">
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={saving}
          className="flex-1 min-h-[52px] inline-flex items-center justify-center px-4 bg-white border border-slate-200 active:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
        >
          Spara utkast
        </button>
        <button
          type="button"
          onClick={onSendQuote}
          disabled={saving || !canSend}
          className="flex-[1.4] min-h-[52px] inline-flex items-center justify-center gap-1.5 px-4 bg-primary-700 active:bg-primary-800 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-sm"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {saving ? 'Sparar…' : 'Granska och skicka'}
        </button>

        {sendConfirmPending && (
          <div className="absolute right-0 bottom-full mb-2 z-40 w-64 bg-white border border-amber-200 rounded-xl shadow-lg p-3">
            <p className="text-xs text-slate-700 mb-2.5 leading-relaxed">
              Beskrivning saknas — skicka ändå?
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCancelSend}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={onConfirmSend}
                className="px-3 py-1.5 text-xs font-semibold bg-primary-700 hover:bg-primary-600 text-white rounded-lg transition-colors"
              >
                Skicka ändå
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
