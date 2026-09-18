'use client'

// "Varifrån kommer siffran?" — raderna en kategorisumma består av.
//
// Summan RÄKNAS UR de här posterna (lib/value/pengar-pa-bordet.ts), så det
// här är inte en extra uppgift vid sidan av talet — det ÄR talet, uppdelat.
// Därför får komponenten aldrig räkna om något själv: den visar posternas
// belopp som de kommer, och en post utan belopp sägs vara utan belopp.

import Link from 'next/link'
import type { PengarPost } from '@/lib/value/pengar-pa-bordet'

function formatKr(n: number): string {
  return `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(Math.round(n))} kr`
}

/** Så många rader visas innan listan klipps. Resten räknas i en slutrad. */
const TAK = 12

export function PengarPoster({ poster }: { poster: PengarPost[] }) {
  if (poster.length === 0) return null
  const visade = poster.slice(0, TAK)
  const kvar = poster.length - visade.length

  return (
    <details className="mt-2 group">
      <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 min-h-[44px] text-[13px] text-primary-700 hover:text-primary-800">
        <span className="transition-transform group-open:rotate-90">›</span>
        Varifrån kommer siffran?
      </summary>
      <ul className="mt-1.5 flex flex-col divide-y divide-slate-100 border-t border-slate-100">
        {visade.map(post => (
          <li key={post.id}>
            <Link
              href={post.href}
              className="flex items-baseline justify-between gap-3 min-h-[44px] py-2 text-[13px] hover:bg-slate-50 transition-colors"
            >
              <span className="min-w-0">
                <span className="block truncate text-slate-700">{post.etikett}</span>
                {post.detalj && <span className="block truncate text-xs text-slate-400">{post.detalj}</span>}
              </span>
              <span className="flex-none tabular-nums text-slate-900">
                {typeof post.belopp === 'number' && post.belopp > 0
                  ? formatKr(post.belopp)
                  : <span className="text-slate-400">belopp saknas</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {kvar > 0 && (
        <p className="m-0 mt-1.5 text-xs text-slate-400">
          + {kvar} rader till — öppna listan för alla
        </p>
      )}
    </details>
  )
}
