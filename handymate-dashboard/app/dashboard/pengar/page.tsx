'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Banknote, Loader2 } from 'lucide-react'
import { formatKr } from '@/lib/moments/derive'
import type { PengarSummary } from '@/lib/value/pengar-pa-bordet'

/**
 * /dashboard/pengar — "Pengar på bordet".
 *
 * Säljdemons återsamlingspunkt och ägarens veckorutin: en totalsiffra och
 * fem kategorier, var och en med en väg till ytan där man agerar. Sidan
 * ÄR sammanställningen — allt arbete sker på länkmålen.
 *
 * Totalsiffran är POTENTIAL och sidan säger det rakt ut. Att blanda ihop
 * den med bekräftat värde (Mattes värdeband) hade gjort båda siffrorna
 * omöjliga att lita på.
 */
export default function PengarPaBordetPage() {
  const [data, setData] = useState<PengarSummary | null>(null)
  const [fel, setFel] = useState(false)
  const [laddar, setLaddar] = useState(true)

  useEffect(() => {
    let aktiv = true
    fetch('/api/dashboard/pengar')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => { if (aktiv) setData(d) })
      .catch(() => { if (aktiv) setFel(true) })
      .finally(() => { if (aktiv) setLaddar(false) })
    return () => { aktiv = false }
  }, [])

  return (
    <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen">
      <div className="max-w-3xl mx-auto">
        <h1 className="font-heading text-2xl sm:text-[28px] font-bold tracking-[-0.02em] text-slate-900 m-0">
          Pengar på bordet
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Var ligger pengarna ni annars riskerar att missa? Allt nedan är
          identifierad potential — inte bokförd intäkt.
        </p>

        {laddar && (
          <div className="mt-10 flex justify-center">
            <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
          </div>
        )}

        {fel && !laddar && (
          <div className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            Kunde inte räkna ihop just nu. Ladda om sidan — händer det igen, säg till oss.
          </div>
        )}

        {data && !laddar && (
          data.kategorier.length === 0 ? (
            <div className="mt-10 bg-white border border-dashed border-slate-200 rounded-2xl p-8 text-center">
              <span className="inline-flex w-11 h-11 rounded-full bg-primary-50 text-primary-700 items-center justify-center mb-2">
                <Banknote className="w-5 h-5" />
              </span>
              <h2 className="m-0 text-[15px] font-semibold text-slate-900">Inget ligger på bordet just nu</h2>
              <p className="m-0 mt-1 text-sm text-slate-500">
                Alla offerter är färska, allt klart arbete är fakturerat och inga fakturor är förfallna.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-6 bg-white border border-slate-200 rounded-2xl p-6 text-center">
                <span className="block font-heading text-4xl sm:text-5xl font-bold text-slate-900">
                  {formatKr(data.totalKr)}
                </span>
                <span className="block text-sm text-slate-500 mt-1">
                  identifierad potential i {data.kategorier.length} kategorier
                </span>
              </div>

              <div className="mt-4 flex flex-col gap-3">
                {data.kategorier.map(k => (
                  <Link
                    key={k.key}
                    href={k.href}
                    className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 hover:border-primary-300 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-heading text-xl font-bold text-slate-900">
                          {k.summaKr > 0 ? formatKr(k.summaKr) : `${k.antal} st`}
                        </span>
                        <span className="text-sm font-semibold text-slate-700">{k.titel}</span>
                      </div>
                      <p className="m-0 mt-0.5 text-[13px] text-slate-500 leading-relaxed">
                        {k.beskrivning}
                        {k.antalUtanBelopp ? (
                          <span className="text-slate-400">
                            {' '}+ {k.antalUtanBelopp} utan känt belopp
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </Link>
                ))}
              </div>

              <p className="mt-5 text-xs text-slate-400 text-center">
                Summorna räknas direkt ur dina offerter, projekt och fakturor — ingenting är uppskattat.
              </p>
            </>
          )
        )}
      </div>
    </div>
  )
}
