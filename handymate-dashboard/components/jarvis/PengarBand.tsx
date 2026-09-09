'use client'

import Link from 'next/link'
import {
  pengarBandPresentation,
  pengarKategoriAntal,
  type PengarSummary,
} from '@/lib/value/pengar-pa-bordet'

function formatKr(n: number): string {
  return `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(Math.round(n))} kr`
}

/**
 * "Pengar just nu" — hemskärmens andra fråga (Matte Command Center,
 * designkontraktet 2026-08-12).
 *
 * Samma sanning som /dashboard/pengar och det gamla Att hämta-kortet, bara
 * grupperad i tre handlingsnivåer (lib/value/pengar-pa-bordet.ts
 * grupperaPengar): Att hämta nu / Möjligheter / Risk. Ingen ny krona räknas
 * här — bandet läser samma PengarSummary som redan hämtas till hemskärmen
 * (JarvisHome äger fetchen och 403-tystnaden; den här komponenten renderas
 * bara när ett svar finns).
 */
export function PengarBand({ summary }: { summary: PengarSummary }) {
  const { grupper, tomt, harKantBelopp } = pengarBandPresentation(summary)

  // En avslutad insats utan säkert belopp är fortfarande arbete som kan vara
  // ofakturerat. Tidigare dolde totalKr-vakten hela kategorin och sade
  // "Inget som kräver uppmärksamhet" trots ett verkligt granskningsbehov.
  if (tomt) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3.5">
        <p className="m-0 text-sm font-medium text-slate-900">Inget som kräver uppmärksamhet just nu</p>
        <p className="mt-0.5 text-xs text-slate-500 m-0">Fakturor och offerter som behöver dig dyker upp här</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <p className="m-0 text-sm text-slate-600">
        {harKantBelopp ? (
          <><b className="font-heading text-lg font-bold text-slate-900">{formatKr(summary.totalKr)}</b>{' '}
          som Handymate tycker kräver uppmärksamhet</>
        ) : (
          <b className="font-heading text-base font-bold text-slate-900">Fakturaunderlag behöver granskas</b>
        )}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {grupper.map(g => (
          <div key={g.key} className="min-w-0">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.titel}</p>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {g.kategorier.map(k => (
                <Link
                  key={k.key}
                  href={k.href}
                  className="flex items-center justify-between gap-2 min-h-[28px] text-[13px] text-slate-600 hover:text-primary-700 transition-colors"
                >
                  <span className="truncate">{k.titel}{pengarKategoriAntal(k) > 0 ? ` (${pengarKategoriAntal(k)})` : ''}</span>
                  {k.summaKr > 0 && (
                    <span className="font-heading font-semibold text-slate-700 shrink-0">{formatKr(k.summaKr)}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default PengarBand
