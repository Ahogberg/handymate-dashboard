'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, AlertTriangle, Lightbulb, TrendingDown, TrendingUp } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { formatKronor } from '@/lib/format-price'
import type { EfterkalkylInsight } from '@/lib/efterkalkyl/get-insight'

/**
 * RIVNING PAKET C (2026-09-17, rad 2.17): fyra ytor för en röst
 * (QuoteNewEfterkalkylBanner, QuoteNewPriceWarningsBanner,
 * Daniel-buffertkortet, DanielsBedomning) blir EN — "Matte säger". Ingen ny
 * AI-logik: samma data (aiBedomning/priceWarnings/priceAlts/
 * efterkalkylInsight/daniel_buffert_h) som redan beräknades i
 * QuoteBuilder.tsx, bara en gemensam yta i stället för fyra separata kort.
 *
 * Renderar ingenting när inget av delarna har något att visa — samma
 * "tomt är inte fel"-princip som completeness-chipparna hade (paket C,
 * 2.16), fast här handlar det om att aldrig visa ett tomt Matte-skal.
 *
 * Efterkalkylbannerns egen "stäng"-knapp (lokal per-offert-avfärdning) är
 * inte återskapad — fyra separata avfärdningslägen på EN rad hade blivit
 * svårare att förstå än raden själv. Ett fynd, inte en lucka: skriven upp i
 * natt-rapporten.
 */

interface PriceWarning {
  product_name: string
  quote_price: number
  normal_price: number
  supplier_name: string
  difference_pct: number
}

interface PriceAlt {
  product_name: string
  cheaper_supplier: string
  cheaper_price: number
  savings_pct: number
}

interface AiBedomning {
  reasoning: string | null
  rules: Array<{ observation: string }>
  lessons: Array<{ lesson_text: string }>
  customerFacts: Array<{ content: string }>
}

interface MatteSagerProps {
  /** Kvittoprincipen Fall 1: motorns eget resonemang. */
  aiGenerated: boolean
  aiBedomning: AiBedomning | null
  aiConfidence: number | null
  /** Grossist-prisjämförelse. */
  priceWarnings: PriceWarning[]
  priceAlternatives: PriceAlt[]
  /** Motor 1: lärande prissättning ur tidigare liknande jobb. */
  efterkalkylInsight: EfterkalkylInsight | null
  /** ?buffert=N från Daniels agentrad på detaljsidan (se
      tests/daniel-agentrad.spec.ts) — timmarna läggs ALDRIG på
      automatiskt, notisen pekar bara på arbetsraden. */
  danielBufferHours: number | null
  formatHours: (hours: number) => string
}

const EFTERKALKYL_MIN_COUNT = 3
const EFTERKALKYL_MIN_ABS_PCT = 10

export function MatteSager({
  aiGenerated,
  aiBedomning,
  aiConfidence,
  priceWarnings,
  priceAlternatives,
  efterkalkylInsight,
  danielBufferHours,
  formatHours,
}: MatteSagerProps) {
  const reasoningText = aiGenerated && aiBedomning ? (aiBedomning.reasoning || '').trim() : ''
  const hasReasoning = reasoningText.length > 0
  const harRegel = hasReasoning && aiBedomning!.rules.length > 0
  const [reasoningExpanded, setReasoningExpanded] = useState(harRegel)

  const efterkalkyl = efterkalkylInsight && !efterkalkylInsight.insufficient
    && efterkalkylInsight.count >= EFTERKALKYL_MIN_COUNT
    && efterkalkylInsight.avg_hours_diff_pct != null
    && Math.abs(efterkalkylInsight.avg_hours_diff_pct) >= EFTERKALKYL_MIN_ABS_PCT
    ? efterkalkylInsight
    : null

  const hasAnything = hasReasoning || priceWarnings.length > 0 || priceAlternatives.length > 0
    || !!efterkalkyl || danielBufferHours != null

  if (!hasAnything) return null

  const efterkalkylOver = efterkalkyl && efterkalkyl.avg_hours_diff_pct! > 0
  const efterkalkylPct = efterkalkyl ? Math.round(Math.abs(efterkalkyl.avg_hours_diff_pct!)) : 0
  const efterkalkylText = efterkalkyl
    ? efterkalkylOver
      ? `Dina senaste ${efterkalkyl.count} liknande jobb drog i snitt ${efterkalkylPct} % över offererad tid. Överväg att lägga till marginal i tidsraderna.`
      : `Dina senaste ${efterkalkyl.count} liknande jobb gick i snitt ${efterkalkylPct} % snabbare än offererat — du kan ha utrymme att pressa priset.`
    : null

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 mb-4 space-y-3">
      <div className="flex items-center gap-2.5">
        <AgentAvatar agentKey="matte" size="sm" />
        <span className="text-sm font-semibold text-slate-900">Matte säger</span>
        {hasReasoning && typeof aiConfidence === 'number' && (
          <span className="text-xs text-slate-400">· säkerhet {aiConfidence} %</span>
        )}
      </div>

      {priceWarnings.length > 0 && (
        <div className="space-y-2">
          {priceWarnings.map((w, i) => (
            <div key={`w-${i}`} className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-800 leading-relaxed">
                <strong className="font-semibold">{w.product_name}</strong> är {w.difference_pct}% dyrare än normalpris (
                <span className="tabular-nums">{formatKronor(w.quote_price)}</span> vs{' '}
                <span className="tabular-nums">{formatKronor(w.normal_price)}</span> — {w.supplier_name})
              </p>
            </div>
          ))}
        </div>
      )}

      {priceAlternatives.length > 0 && (
        <div className="space-y-2">
          {priceAlternatives.map((a, i) => (
            <div key={`a-${i}`} className="flex items-start gap-2">
              <Lightbulb className="w-3.5 h-3.5 text-primary-700 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-primary-800 leading-relaxed">
                <strong className="font-semibold">{a.cheaper_supplier}</strong> har {a.product_name} {a.savings_pct}% billigare (
                <span className="tabular-nums">{formatKronor(a.cheaper_price)}</span>)
              </p>
            </div>
          ))}
        </div>
      )}

      {efterkalkylText && (
        <div className="flex items-start gap-2">
          {efterkalkylOver ? (
            <TrendingUp className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-primary-700 mt-0.5 flex-shrink-0" />
          )}
          <p className={`text-xs leading-relaxed ${efterkalkylOver ? 'text-amber-800' : 'text-primary-800'}`}>
            {efterkalkylText}
          </p>
        </div>
      )}

      {danielBufferHours != null && (
        <p className="text-xs leading-relaxed text-slate-700">
          Föreslog +{formatHours(danielBufferHours)} h. Lägg dem på arbetsraden.
        </p>
      )}

      {hasReasoning && (
        reasoningExpanded ? (
          <div className="pt-2.5 border-t border-slate-100">
            <div className="flex items-center justify-between gap-2">
              <p className="m-0 text-[13px] leading-relaxed text-slate-600 italic flex-1 min-w-0">
                &ldquo;{reasoningText}&rdquo;
              </p>
              <button
                type="button"
                onClick={() => setReasoningExpanded(false)}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-primary-700 shrink-0 transition-colors"
              >
                Fäll ihop
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>
            {(aiBedomning!.rules.length > 0 || aiBedomning!.lessons.length > 0 || aiBedomning!.customerFacts.length > 0) && (
              <div className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-1.5">
                {aiBedomning!.rules.map((r, i) => (
                  <p key={`r-${i}`} className="m-0 text-[13px] text-slate-600 flex gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 shrink-0 pt-0.5">Din regel</span>
                    <span className="min-w-0">{r.observation}</span>
                  </p>
                ))}
                {aiBedomning!.lessons.map((l, i) => (
                  <p key={`l-${i}`} className="m-0 text-[13px] text-slate-600 flex gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary-700 shrink-0 pt-0.5">Lärdom</span>
                    <span className="min-w-0">{l.lesson_text}</span>
                  </p>
                ))}
                {aiBedomning!.customerFacts.map((f, i) => (
                  <p key={`f-${i}`} className="m-0 text-[13px] text-slate-600 flex gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 shrink-0 pt-0.5">Kundfakta</span>
                    <span className="min-w-0">{f.content}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setReasoningExpanded(true)}
            className="w-full flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100 text-left"
          >
            <span className="text-xs text-slate-500">Så tänkte Matte om offerten</span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 shrink-0">
              Visa varför
              <ChevronDown className="w-3.5 h-3.5" />
            </span>
          </button>
        )
      )}
    </div>
  )
}
