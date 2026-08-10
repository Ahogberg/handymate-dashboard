'use client'

import { useEffect, useRef } from 'react'
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

  // Baren äger sin höjd och publicerar den; sidan läser den (2026-08-06).
  //
  // Tidigare fanns tre oberoende gissningar på samma tal — paddingBottom: 260
  // i page.tsx, scroll-margin-top: 96px i modern-css, och barens faktiska
  // innehållsstyrda höjd. Den som gissade fel gjorde summeringen onåbar.
  //
  // Skriver DIREKT på documentElement, aldrig via React-state: en
  // ResizeObserver som triggar en rerender som kan påverka barens höjd är en
  // loop, och Next-overlayen visar dessutom "ResizeObserver loop"-varningen
  // som en röd ruta även när den är harmlös.
  const barRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = barRef.current
    if (!el) return
    const publish = () => {
      document.documentElement.style.setProperty('--qk-review-bar-h', `${el.offsetHeight}px`)
    }
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => {
      ro.disconnect()
      // Måste städas — annars läcker värdet in i översiktsläget där baren är
      // borta och paddingen skulle reservera plats för ingenting.
      document.documentElement.style.removeProperty('--qk-review-bar-h')
    }
  }, [])

  return (
    <div ref={barRef} className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_16px_rgba(15,23,42,0.06)]">
      <div className="max-w-3xl mx-auto px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {/* Progressprickar — tappbara, aldrig en grind. Positionsräknaren
            (designpasset 2026-08-10) ger orientering utan att läsa prickar:
            "2 av 4" säger var man är och hur mycket som återstår. */}
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
          <span className="text-[10px] font-semibold text-slate-400 tabular-nums ml-1">
            {SECTION_ORDER.indexOf(section) + 1} av {SECTION_ORDER.length}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Reserverad minsta höjd: rymmer namn + sammanfattning + varningsrad,
              så baren inte hoppar när en varning dyker upp eller försvinner.
              key= gör varje sektionsbyte till en remount så anim-fade körs på
              det nya innehållet. */}
          <div className="flex-1 min-w-0 min-h-[56px]">
            <div key={section} className="anim-fade">
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

        <p key={section} className="text-xs text-slate-400 mt-2 anim-fade">{SECTION_HINTS[section]}</p>

        {/* Verktygsslotten glider 0 → naturlig höjd i stället för att monteras
            villkorligt. Sektionernas verktyg är olika höga — en textarea vid
            Ej inkluderat, en knapp vid Inkluderat, ingenting vid Prisbild — och
            barens höjd hoppade därför okontrollerat vid varje sektionsbyte.
            Eftersom baren är fäst nedtill flyttade sig hela sidans bottenkant.

            Utgående innehåll försvinner direkt: en exit-animation kräver att
            React behåller det gamla elementet, alltså state eller ett bibliotek.
            Höjdglidningen räcker för att bytet ska läsas som en rörelse. */}
        <div
          className="grid transition-[grid-template-rows] duration-slow ease-standard motion-reduce:transition-none"
          style={{ gridTemplateRows: children ? '1fr' : '0fr' }}
        >
          <div className="overflow-hidden min-h-0">
            {children ? <div className="mt-3">{children}</div> : null}
          </div>
        </div>

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
