'use client'

import { AlertTriangle, Check, Loader2, Send } from 'lucide-react'
import {
  SECTION_ORDER,
  SECTION_LABELS,
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

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm">
      <div className="flex items-baseline justify-between mb-4">
        <p className="font-heading text-lg font-bold text-slate-900 tracking-tight">Offerten är klar</p>
        <p className="font-heading text-lg font-bold text-primary-700 tabular-nums">{amountToPay}</p>
      </div>

      <div className="space-y-2 mb-4">
        {SECTION_ORDER.map(section => {
          const summary = summaries[section]
          const isDone = approved.includes(section)
          return (
            <button
              key={section}
              type="button"
              onClick={() => onGoToSection(section)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-left transition-colors"
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                  summary.attention
                    ? 'bg-amber-100 text-amber-700'
                    : isDone
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                {summary.attention
                  ? <AlertTriangle className="w-3 h-3" />
                  : <Check className="w-3 h-3" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-slate-900">{SECTION_LABELS[section]}</span>
                <span className="block text-xs text-slate-500 truncate">
                  {summary.attention || summary.text}
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
