'use client'

/**
 * "Färdig att skicka" — sju rader om vad kunden ser och vad kunden behöver
 * för att kunna betala. Raderna kommer från readyRows() (lib/branding/kundvy),
 * länkarna pekar dit fältet fylls i.
 */
import Link from 'next/link'
import { Check } from 'lucide-react'
import { readyCount, type ReadyRow } from '@/lib/branding/kundvy'

export interface ReadyMeterProps {
  rows: ReadyRow[]
  /** Rader utan href löses på sidan själv (logotypen → filväljaren). */
  onLocalAction?: (rowId: string) => void
}

export function readyScoreText(klara: number, totalt: number): string {
  if (klara >= totalt) return 'Allt på plats. Dina kunder ser ett komplett företag.'
  return `${klara} av ${totalt} på plats. Fyll i resten så blir intrycket komplett.`
}

export default function ReadyMeter({ rows, onLocalAction }: ReadyMeterProps) {
  const { klara, totalt } = readyCount(rows)
  const pct = totalt ? Math.round((klara / totalt) * 100) : 0

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-slate-900">Färdig att skicka</h3>
        <span className="text-[12px] text-slate-500 tabular-nums">{klara} av {totalt}</span>
      </div>
      <div className="mt-2.5 h-1.5 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={klara} aria-valuemin={0} aria-valuemax={totalt}>
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #0F766E, #14B8A6)' }}
        />
      </div>
      <p className="mt-2 text-[12px] text-slate-500 leading-snug">{readyScoreText(klara, totalt)}</p>

      <ul className="mt-3.5 flex flex-col gap-2.5">
        {rows.map((row) => (
          <li key={row.id} className="flex items-start gap-2.5">
            {row.done ? (
              <span className="mt-0.5 w-5 h-5 rounded-full shrink-0 flex items-center justify-center" style={{ background: '#dcfce7', color: '#15803d' }}>
                <Check className="w-3 h-3" strokeWidth={3} />
              </span>
            ) : (
              <span className="mt-0.5 w-5 h-5 rounded-full shrink-0 border-[1.5px] border-slate-300" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[13px] font-medium ${row.done ? 'text-slate-900' : 'text-slate-700'}`}>{row.label}</span>
                {!row.done && row.action && (
                  row.href ? (
                    <Link href={row.href} className="text-[12px] font-medium text-teal-700 hover:underline whitespace-nowrap">
                      {row.action}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onLocalAction?.(row.id)}
                      className="text-[12px] font-medium text-teal-700 hover:underline whitespace-nowrap"
                    >
                      {row.action}
                    </button>
                  )
                )}
              </div>
              <div className="text-[12px] text-slate-500 truncate" title={row.value}>{row.value}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
