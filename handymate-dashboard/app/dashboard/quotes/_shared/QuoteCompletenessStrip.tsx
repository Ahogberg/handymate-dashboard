'use client'

import {
  SECTION_ORDER,
  SECTION_LABELS,
  type QuoteSection,
  type SectionSummary,
} from '@/lib/quotes/quote-completeness'

interface QuoteCompletenessStripProps {
  summaries: Record<QuoteSection, SectionSummary>
  onSelect: (section: QuoteSection) => void
}

/**
 * Offertens fullständighet som en alltid synlig, icke-blockerande chip-rad
 * (Fas 1, offert-omtaget 2026-08-31) — ersätter den borttagna
 * steg-för-steg-granskningen (QuickReviewBar/QuickReceipt) som gatade
 * dokumentets fält en sektion i taget.
 *
 * Varje chip visar `sectionSummary()`s text ("8 rader · 46 500 kr") eller,
 * om något behöver ögon, `attention` i stället (amber, samma tvåläges-
 * mönster som "Mer"-radens statusprickar). Ett klick scrollar till
 * ämnet i dokumentet — se `onSelect`/QuoteBuilder.tsx:s `scrollToSection`,
 * som använder QuoteDocuments `data-section`-attribut. Chippen filtrerar
 * ALDRIG bort handlers och blockerar ALDRIG något — det är precis
 * skillnaden mot det borttagna kvittot.
 */
export function QuoteCompletenessStrip({ summaries, onSelect }: QuoteCompletenessStripProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-2 flex flex-wrap items-center gap-1.5">
      <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Läget just nu
      </span>
      {SECTION_ORDER.map(section => {
        const summary = summaries[section]
        const hasAttention = !!summary.attention
        return (
          <button
            key={section}
            type="button"
            onClick={() => onSelect(section)}
            title={`${SECTION_LABELS[section]} — klicka för att hoppa dit`}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 ${
              hasAttention
                ? 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
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
    </div>
  )
}
