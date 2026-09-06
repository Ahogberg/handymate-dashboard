'use client'

import { useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import {
  SECTION_LABELS,
  sortSectionsByAttention,
  type QuoteSection,
  type SectionSummary,
} from '@/lib/quotes/quote-completeness'

interface QuoteBuilderBottomBarProps {
  /** Samma completeness-sammanfattning som header-radens QuoteCompletenessStrip
      (desktop) — se sortSectionsByAttention för varför RENDERINGEN skiljer sig
      (horisontell scroll, amber-chips först) trots samma underliggande data. */
  summaries: Record<QuoteSection, SectionSummary>
  /** DESIGN-SPEC.md ("Helt tomt läge", offertskaparen-polish): styr BARA
      chip-raden ovanför knapparna — Spara utkast/Skicka offert ska förbli
      monterade och användbara även på en helt tom offert (annars kan
      hantverkaren aldrig spara sig ur ett tomt utkast på mobil). `summaries`
      förblir required: föräldern räknar fortfarande fram sammanfattningen
      varje render (den behövs så fort hasQuoteContent blir true), den
      används bara inte för att RENDERA chip-raden när detta är false. */
  hasQuoteContent: boolean
  onSelect: (section: QuoteSection) => void
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
  summaries,
  hasQuoteContent,
  onSelect,
  saving,
  canSend,
  sendDisabledReason,
  sendConfirmPending,
  onConfirmSend,
  onCancelSend,
  onSendQuote,
  onSaveDraft,
}: QuoteBuilderBottomBarProps) {
  const [showAllSections, setShowAllSections] = useState(false)
  const orderedSections = sortSectionsByAttention(summaries)

  return (
    <div
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] px-3 pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      {/* Chip-raden — horisontellt scrollbar, amber (attention) chips
          först (sortSectionsByAttention), sedan lugna slate-chips i
          SECTION_ORDER. Samma klick-beteende som QuoteCompletenessStrip:
          scrollar till ämnet i dokumentet.

          DESIGN-SPEC.md ("Helt tomt läge"): hela raden döljs (inte bara
          attention-styling) när offerten saknar innehåll — utan detta
          visade en helt ny, tom offert en amber "Inkluderat — Offerten har
          inga rader"-chip här SAMTIDIGT som canvasen bredvid visade Fas E:s
          lugna tomt-läge, två motsägande budskap på samma skärm. Knapparna
          nedan förblir OVILLKORLIGT monterade — bara chip-raden gates. */}
      {hasQuoteContent && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2.5">
          {(showAllSections ? orderedSections : orderedSections.slice(0, 1)).map(section => {
            const summary = summaries[section]
            const hasAttention = !!summary.attention
            return (
              <button
                key={section}
                type="button"
                onClick={() => onSelect(section)}
                title={`${SECTION_LABELS[section]} — tryck för att hoppa dit`}
                className={`shrink-0 min-h-[40px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${
                  hasAttention
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                <span
                  aria-hidden
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${hasAttention ? 'bg-amber-500' : 'bg-primary-600'}`}
                />
                {SECTION_LABELS[section]}
                <span className={hasAttention ? 'text-amber-700' : 'text-slate-400'}>
                  {summary.attention || summary.text}
                </span>
              </button>
            )
          })}
          <button type="button" aria-expanded={showAllSections} onClick={() => setShowAllSections(!showAllSections)} className="min-h-[44px] shrink-0 px-2 text-xs font-medium text-teal-800 underline">{showAllSections ? 'Visa nästa' : 'Alla delar'}</button>
        </div>
      )}

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
