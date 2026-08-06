'use client'

import { AlertTriangle, Check, Loader2, Send } from 'lucide-react'
import {
  SECTION_ORDER,
  SECTION_LABELS,
  sectionReviewState,
  unreviewedCount,
  type QuoteSection,
  type SectionSummary,
} from '@/lib/quotes/section-handlers'

/**
 * Kvittot ovanför helhetsvyn (etapp C4, 2026-08-06).
 *
 * ═══ VAD DET SVARAR PÅ ═══
 *
 * "Har jag fått med allt?" — Christoffers faktiska oro, ordagrant. En bock per
 * sektion visar vad som är genomgånget; ett amber-chip visar vad som inte är
 * det. Varje chip är en INGÅNG tillbaka till sin sektion, inte bara en
 * varning: att peka på ett problem utan att erbjuda vägen dit gör bara
 * hantverkaren stressad.
 *
 * ═══ VARFÖR SKICKA INTE ÄR SPÄRRAT ═══
 *
 * Amber betyder "titta på det här", inte "du får inte". Hantverkaren kan ha
 * fullgoda skäl att skicka utan personnummer — kunden kanske mejlar det sedan.
 * Produkten föreslår, hantverkaren beslutar. Att spärra Skicka hade gjort oss
 * till en grind i stället för en kollega.
 */

interface QuickReceiptProps {
  summaries: Record<QuoteSection, SectionSummary>
  approved: QuoteSection[]
  amountToPay: string
  customerName: string | null
  onGoToSection: (section: QuoteSection) => void
  onSend: () => void
  onOpenFullEditor: () => void
  sending: boolean
}

export function QuickReceipt({
  summaries,
  approved,
  amountToPay,
  customerName,
  onGoToSection,
  onSend,
  onOpenFullEditor,
  sending,
}: QuickReceiptProps) {
  const attentions = SECTION_ORDER
    .map(s => ({ section: s, attention: summaries[s].attention }))
    .filter((a): a is { section: QuoteSection; attention: string } => !!a.attention)
  const unreviewed = unreviewedCount(summaries, approved)

  return (
    // Kortet monteras samtidigt som dokumentet tänds (sektion → översikt delar
    // DOM-träd), så entrén säger "nytt element" medan dokumentets dimning
    // släpper via sin egen transition.
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm anim-rise">
      <div className="flex items-baseline justify-between mb-4">
        <p className="font-heading text-lg font-bold text-slate-900 tracking-tight">Offerten är klar</p>
        <p className="font-heading text-lg font-bold text-primary-700 tabular-nums">{amountToPay}</p>
      </div>

      <div className="space-y-2 mb-4">
        {SECTION_ORDER.map((section, i) => {
          const summary = summaries[section]
          const state = sectionReviewState(summary, approved.includes(section))
          return (
            <button
              key={section}
              type="button"
              onClick={() => onGoToSection(section)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-left transition-colors"
            >
              {/* Prickas av i läsordning — svaret på "har jag fått med allt?".
                  Ingen konfetti: att skicka en offert är vardag, inte en bragd.

                  TRE tillstånd, inte två (spår A, 2026-08-06). En sektion
                  hantverkaren aldrig öppnat visade tidigare en grå BOCK —
                  samma symbol som en granskad, bara blekare. Att den var
                  dämpad gjorde bara lögnen tystare. Nu en TOM RING: den
                  säger "här finns inget svar än", vilket är sant. */}
              <span
                style={{ animationDelay: `${i * 60 + 150}ms` }}
                className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 anim-pop transition-colors duration-base ease-standard ${
                  state === 'behover-ogon'
                    ? 'bg-amber-100 text-amber-700'
                    : state === 'granskad'
                      ? 'bg-primary-100 text-primary-700'
                      : 'border-2 border-slate-300'
                }`}
              >
                {state === 'behover-ogon' && <AlertTriangle className="w-3 h-3" />}
                {state === 'granskad' && <Check className="w-3 h-3" />}
                {/* 'ogranskad' bär medvetet ingen ikon alls. */}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-slate-900">{SECTION_LABELS[section]}</span>
                <span className={`block text-xs truncate ${state === 'ogranskad' ? 'text-slate-400' : 'text-slate-500'}`}>
                  {state === 'ogranskad' ? 'Inte granskad' : (summary.attention || summary.text)}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {attentions.length > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-4">
          {attentions.length === 1
            ? 'En sak är värd en extra titt innan du skickar — tryck på den för att gå dit.'
            : `${attentions.length} saker är värda en extra titt innan du skickar — tryck på dem för att gå dit.`}
        </p>
      )}

      {/* Det som INTE granskats sägs rakt ut. Neutral ton, inte varnande:
          att hoppa över en del kan vara ett helt medvetet val — men då ska
          det vara ett val, inte något som passerade obemärkt.

          Spärrar INTE Skicka. Amber betyder "titta här", inte "du får inte",
          och det gäller även här. */}
      {unreviewed > 0 && (
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 mb-4">
          {unreviewed === 1
            ? 'Du har inte tittat på en av delarna. Tryck på den om du vill gå igenom den först.'
            : `Du har inte tittat på ${unreviewed} av delarna. Tryck på dem om du vill gå igenom dem först.`}
        </p>
      )}

      <button
        type="button"
        onClick={onSend}
        disabled={sending || !customerName}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 shadow-sm"
      >
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {sending ? 'Skickar…' : customerName ? `Skicka till ${customerName}` : 'Välj kund för att skicka'}
      </button>

      <button
        type="button"
        onClick={onOpenFullEditor}
        className="w-full mt-2.5 py-2.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
      >
        Öppna i fullständiga editorn
      </button>
    </div>
  )
}
