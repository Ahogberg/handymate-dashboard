'use client'

import { AlertTriangle, ArrowRight, Check } from 'lucide-react'
import {
  SECTION_ORDER,
  SECTION_LABELS,
  SECTION_HINTS,
  type QuoteSection,
  type SectionSummary,
} from '@/lib/quotes/section-handlers'

/**
 * Sticky kontrollyta för sektionsgranskningen (etapp C3, 2026-08-06).
 *
 * ═══ GRANSKNINGEN ÄR NAVIGERING, INTE GRINDAR ═══
 *
 * Prickarna är TAPPBARA och "Hoppa till översikt" finns alltid. Offert nummer
 * 40 ska inte kräva samma steg som nummer 1, och en hantverkare som redan vet
 * vad han tittar efter ska kunna gå direkt dit. Ett flöde som tvingar fram
 * fyra klick varje gång blir något man undviker — och då är vi tillbaka i
 * "blir galen".
 *
 * ═══ VARFÖR SAMMANFATTNINGEN STÅR HÄR ═══
 *
 * I A4-skala på en telefon är brödtexten ~5px. Att be någon "kontrollera
 * summan" i det formatet är inte rimligt. Baren säger därför i klartext vad
 * sektionen innehåller ("8 rader · 46 500 kr") så beslutet går att fatta utan
 * att kisa på dokumentet.
 */

interface QuickReviewBarProps {
  section: QuoteSection
  summary: SectionSummary
  /** Sektioner hantverkaren redan sagt "ser bra ut" om. */
  approved: QuoteSection[]
  onSelectSection: (section: QuoteSection) => void
  onApprove: () => void
  onSkipToOverview: () => void
  /** Sektionens eget verktyg, t.ex. "Lägg till rad" eller "Se förslag". */
  children?: React.ReactNode
}

export function QuickReviewBar({
  section,
  summary,
  approved,
  onSelectSection,
  onApprove,
  onSkipToOverview,
  children,
}: QuickReviewBarProps) {
  const isLast = SECTION_ORDER.indexOf(section) === SECTION_ORDER.length - 1

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_16px_rgba(15,23,42,0.06)]">
      <div className="max-w-3xl mx-auto px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {/* Progressprickar — tappbara, aldrig en grind */}
        <div className="flex items-center justify-center gap-2 mb-3">
          {SECTION_ORDER.map(s => {
            const isCurrent = s === section
            const isDone = approved.includes(s)
            return (
              <button
                key={s}
                type="button"
                onClick={() => onSelectSection(s)}
                title={SECTION_LABELS[s]}
                aria-label={SECTION_LABELS[s]}
                aria-current={isCurrent ? 'step' : undefined}
                className={`h-2.5 rounded-full transition-all ${
                  isCurrent
                    ? 'w-8 bg-primary-700'
                    : isDone
                      ? 'w-2.5 bg-primary-300'
                      : 'w-2.5 bg-slate-200 hover:bg-slate-300'
                }`}
              />
            )
          })}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-heading text-base font-bold text-slate-900 tracking-tight leading-tight">
              {SECTION_LABELS[section]}
            </p>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{summary.text}</p>
            {summary.attention && (
              <p className="text-xs text-amber-700 mt-0.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{summary.attention}</span>
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onApprove}
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-3 bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {isLast ? <Check className="w-4 h-4" /> : null}
            {isLast ? 'Klar' : 'Ser bra ut'}
            {!isLast && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>

        <p className="text-xs text-slate-400 mt-2">{SECTION_HINTS[section]}</p>

        {children && <div className="mt-3">{children}</div>}

        <button
          type="button"
          onClick={onSkipToOverview}
          className="w-full mt-2 py-2 text-xs text-slate-400 hover:text-slate-700 transition-colors"
        >
          Hoppa till översikt
        </button>
      </div>
    </div>
  )
}
