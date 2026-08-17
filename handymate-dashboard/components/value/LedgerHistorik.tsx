'use client'

import { formatKr } from '@/lib/moments/derive'
import { periodKort } from './ledger-format'

/**
 * Månadsstaplarna (Etapp B5) — verifierat betalt per månad ur
 * /api/value/ledger/history. Teal-skalan mörknar mot innevarande månad
 * (mockupens mönster); höjden är andel av bästa månaden.
 *
 * Summeringsraden säger "Senaste N månaderna", ALDRIG mockupens "Sedan
 * start" — vi har bara räknat om N månader bakåt och påstår inget om tiden
 * före. Not under staplarna: allt är ren omberäkning, inget lagras.
 */

export interface LedgerHistorikRad {
  period: string
  betalt_kr: number
  betalt_antal: number
}

/** Ljusast längst bak, mörkast nu — index räknat från senaste månaden. */
function stapelFarg(avstandFranNu: number): string {
  if (avstandFranNu === 0) return 'bg-primary-700'
  if (avstandFranNu === 1) return 'bg-primary-500'
  if (avstandFranNu === 2) return 'bg-primary-400'
  if (avstandFranNu === 3) return 'bg-primary-300'
  if (avstandFranNu === 4) return 'bg-primary-200'
  return 'bg-primary-100'
}

export function LedgerHistorik({
  rader,
  laddar,
}: {
  rader: LedgerHistorikRad[] | null
  laddar: boolean
}) {
  if (laddar) {
    return (
      <section className="bg-white border border-slate-200 rounded-card p-5 sm:p-6">
        <div className="h-4 w-48 bg-slate-100 rounded animate-pulse" />
        <div className="mt-5 flex items-end gap-2.5 h-[110px]">
          {[35, 55, 45, 70, 50, 80, 60].map((h, i) => (
            <div key={i} className="flex-1 bg-slate-100 rounded-t-[5px] animate-pulse" style={{ height: `${h}%` }} />
          ))}
        </div>
      </section>
    )
  }

  if (!rader || rader.length === 0) return null

  const max = Math.max(...rader.map(r => r.betalt_kr))
  const summa = rader.reduce((s, r) => s + r.betalt_kr, 0)

  return (
    <section className="bg-white border border-slate-200 rounded-card p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="m-0 font-heading text-[15px] font-semibold text-slate-900">
          Verifierat betalt per månad
        </h2>
        {rader.length >= 3 && (
          <span className="text-[12.5px] text-slate-500 shrink-0">
            Senaste {rader.length} månaderna ·{' '}
            <strong className="font-heading tabular-nums text-slate-900">{formatKr(summa)}</strong>
          </span>
        )}
      </div>

      <div className="flex items-end gap-2 sm:gap-2.5 h-[110px]">
        {rader.map((r, i) => {
          const avstand = rader.length - 1 - i
          const hojd = max > 0 ? Math.max(2, Math.round((r.betalt_kr / max) * 100)) : 0
          return (
            <div key={r.period} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1.5">
              {hojd > 0 ? (
                <div
                  className={`w-full rounded-t-[5px] ${stapelFarg(avstand)}`}
                  style={{ height: `${hojd}%` }}
                  title={`${periodKort(r.period)}: ${formatKr(r.betalt_kr)} · ${r.betalt_antal} poster`}
                />
              ) : (
                <div className="w-full h-[2px] bg-slate-200 rounded-full" />
              )}
              <span
                className={`text-[11.5px] ${
                  avstand === 0 ? 'text-primary-700 font-semibold' : 'text-slate-400'
                }`}
              >
                {periodKort(r.period)}
              </span>
            </div>
          )
        })}
      </div>

      <p className="m-0 mt-3.5 pt-3.5 border-t border-slate-100 text-[12.5px] text-slate-400 leading-relaxed">
        Räknas om från källdatan vid varje besök — inget lagras. En betalning
        som bekräftas i dag kan lyfta en tidigare månads kohort i efterhand.
      </p>
    </section>
  )
}
