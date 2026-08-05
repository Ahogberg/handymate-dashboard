'use client'

import { useMemo } from 'react'
import { TrendingUp } from 'lucide-react'
import type { QuoteItem } from '@/lib/types/quote'
import { calculateQuoteMargin, marginTone } from '@/lib/quotes/margin'

interface QuoteMarginCardProps {
  items: QuoteItem[]
}

const kr = (n: number) => n.toLocaleString('sv-SE')

/**
 * Täckningsbidraget medan offerten byggs.
 *
 * De flesta hantverkare offererar utan att veta sin marginal och upptäcker den
 * först i efterkalkylen. Att se siffran i det ögonblick priset sätts är hela
 * poängen — men bara om siffran är ärlig: rader utan inköpspris räknas ALDRIG
 * som noll kostnad, de redovisas som saknade.
 *
 * Självgardande: syns inte alls förrän minst en rad har ett känt inköpspris.
 * Ett kort som säger "vi vet inget" är sämre än inget kort.
 */
export function QuoteMarginCard({ items }: QuoteMarginCardProps) {
  const margin = useMemo(() => calculateQuoteMargin(items), [items])

  if (margin.marginPercent === null) return null

  const tone = marginTone(margin)
  const toneClasses: Record<string, string> = {
    låg: 'text-amber-700',
    ok: 'text-slate-900',
    god: 'text-emerald-700',
    saknas: 'text-slate-900',
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
          <TrendingUp className="w-3.5 h-3.5" />
        </div>
        <h3 className="text-sm font-bold text-slate-900">Din marginal</h3>
      </div>

      <div className="flex items-baseline gap-2">
        <span className={`font-heading text-2xl font-bold tabular-nums ${toneClasses[tone]}`}>
          {margin.marginPercent} %
        </span>
        <span className="text-sm text-slate-600 tabular-nums">
          {kr(margin.contribution)} kr kvar
        </span>
      </div>

      <p className="text-xs text-slate-500 mt-1">
        {kr(margin.knownRevenue)} kr i pris minus {kr(margin.knownCost)} kr i inköp
      </p>

      {margin.isPartial && (
        <p className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-100">
          {margin.rowsWithoutCost === 1
            ? '1 rad saknar inköpspris och ingår inte i siffran'
            : `${margin.rowsWithoutCost} rader saknar inköpspris och ingår inte i siffran`}
          {margin.revenueWithoutCost > 0 && ` (${kr(margin.revenueWithoutCost)} kr).`}
          {' '}Fyll i inköpspris i produktbanken så blir siffran komplett.
        </p>
      )}

      {tone === 'låg' && !margin.isPartial && (
        <p className="text-xs text-amber-700 mt-2 pt-2 border-t border-amber-100">
          Låg marginal på det här jobbet — kontrollera att inget saknas i priset.
        </p>
      )}
    </div>
  )
}
