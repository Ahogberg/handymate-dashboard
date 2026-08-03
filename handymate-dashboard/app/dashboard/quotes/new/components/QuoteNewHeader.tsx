'use client'

import Link from 'next/link'
import { ArrowLeft, Bookmark, Loader2, Send, Sparkles } from 'lucide-react'

interface QuoteNewHeaderProps {
  aiGenerated: boolean
  aiConfidence: number | null
  aiPriceWarning: { message: string; link: string } | null
  aiPhotoCount: number
  // Action-knappar (rendas i sticky top-bar; tidigare i högerkolumnen)
  saving: boolean
  canSend: boolean
  /** ETAPP 1f (offert-masterplan.md): synlig orsakstext när canSend är
      false — härledd av föräldern ur SAMMA villkor som canSend, istället
      för en tyst disabled-knapp utan förklaring. */
  sendDisabledReason?: string
  /** Beskrivningsvarningen (tidigare descriptionWarningShownRef — en
      osynlig "klicka Skicka igen"-vägg): visar en inline-bekräftelse
      vid knappen istället. */
  sendConfirmPending?: boolean
  onConfirmSend?: () => void
  onCancelSend?: () => void
  hasItems: boolean
  onSendQuote: () => void
  onSaveDraft: () => void
  onSaveTemplate: () => void
}

/**
 * Sticky header för ny offert. Visar AI-status (genererad, säkerhet,
 * foto-räknare, prisvarning) som badges + action-knappar (Skicka,
 * Spara utkast, Spara som mall). Backdrop-blur säkerställer läsbarhet.
 */
export function QuoteNewHeader({
  aiGenerated,
  aiConfidence,
  aiPriceWarning,
  aiPhotoCount,
  saving,
  canSend,
  sendDisabledReason,
  sendConfirmPending,
  onConfirmSend,
  onCancelSend,
  hasItems,
  onSendQuote,
  onSaveDraft,
  onSaveTemplate,
}: QuoteNewHeaderProps) {
  return (
    <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 mb-6 px-4 sm:px-6 py-3 bg-slate-50/95 backdrop-blur-md border-b border-slate-200">
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

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {hasItems && (
            <button
              type="button"
              onClick={onSaveTemplate}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
            >
              <Bookmark className="w-3.5 h-3.5" />
              Spara som mall
            </button>
          )}
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={saving}
            className="px-3 py-2 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            Spara utkast
          </button>
          <div className="relative flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={onSendQuote}
              disabled={saving || !canSend}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-700 hover:bg-primary-600 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-sm"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {saving ? 'Sparar…' : 'Skicka offert'}
            </button>
            {/* ETAPP 1f: disabled Skicka-knapp får alltid en synlig orsak
                istället för ett tyst lås. */}
            {!canSend && sendDisabledReason && (
              <span className="text-[10px] text-slate-400 whitespace-nowrap">{sendDisabledReason}</span>
            )}
            {sendConfirmPending && (
              <div className="absolute right-0 top-full mt-2 z-40 w-64 bg-white border border-amber-200 rounded-xl shadow-lg p-3">
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
      </div>
    </div>
  )
}
