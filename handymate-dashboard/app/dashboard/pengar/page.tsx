'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Banknote, Loader2 } from 'lucide-react'
import { formatKr } from '@/lib/moments/derive'
import { Intaktsfynden } from '@/components/pengar/Intaktsfynden'
import { grupperaPengar, type PengarSummary } from '@/lib/value/pengar-pa-bordet'
import type { ManadsLedger } from '@/lib/value/ledger'
import { LedgerHero } from '@/components/value/LedgerHero'
import { LedgerFlode } from '@/components/value/LedgerFlode'
import { LedgerRader } from '@/components/value/LedgerRader'
import { LedgerHistorik, type LedgerHistorikRad } from '@/components/value/LedgerHistorik'
import RevenueWorkQueue from '@/components/pengar/RevenueWorkQueue'

/**
 * /dashboard/pengar — Value Ledger + "Pengar på bordet".
 *
 * ═══ TVÅ HALVOR, TVÅ SANNINGSNIVÅER (Etapp B, 2026-08-17) ═══
 *
 * ÖVRE HALVAN är ledgern (lib/value/ledger.ts): månadens kortkohort följd
 * genom fyra STRIKT åtskilda stadier (identifierat → agerat → fakturerat →
 * betalt) — mörk hero med verifierat betalt, fyrstegsflödet, varje kronas
 * historia och månadshistoriken. Allt där är verifierad kedjedata.
 *
 * NEDRE HALVAN är potentialen: totalsiffran och kategorilänkarna säger
 * rakt ut att de är identifierad potential — inte bokförd intäkt. Att
 * blanda ihop de två halvorna hade gjort båda omöjliga att lita på.
 *
 * Varje block har egen fetch och eget fel-läge — ett trasigt ledger-svar
 * utelämnar bara ledger-blocken, aldrig hela sidan (samma tystnadsregel
 * som hemytans grädde-kort). Multipeln mot månadsavgiften i heron visas
 * bara när avgiften har en säker källa (aktiv Stripe-prenumeration + pris
 * ur billing_plan — ägarrapportens regel); annars utelämnas raden helt.
 */
export default function PengarPaBordetPage() {
  const [data, setData] = useState<PengarSummary | null>(null)
  const [fel, setFel] = useState(false)
  const [laddar, setLaddar] = useState(true)
  const [ledger, setLedger] = useState<ManadsLedger | null>(null)
  const [historik, setHistorik] = useState<LedgerHistorikRad[] | null>(null)
  const [historikLaddar, setHistorikLaddar] = useState(true)
  const [manadsavgiftKr, setManadsavgiftKr] = useState<number | null>(null)

  useEffect(() => {
    let aktiv = true
    fetch('/api/dashboard/pengar')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => { if (aktiv) setData(d) })
      .catch(() => { if (aktiv) setFel(true) })
      .finally(() => { if (aktiv) setLaddar(false) })
    return () => { aktiv = false }
  }, [])

  useEffect(() => {
    let aktiv = true
    fetch('/api/value/ledger')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (aktiv && d?.ledger) setLedger(d.ledger) })
      .catch(() => { /* blocket är extra, aldrig blockerande */ })
    return () => { aktiv = false }
  }, [])

  useEffect(() => {
    let aktiv = true
    fetch('/api/value/ledger/history?months=7')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (aktiv && Array.isArray(d?.historik)) setHistorik(d.historik) })
      .catch(() => { /* staplarna är extra, aldrig blockerande */ })
      .finally(() => { if (aktiv) setHistorikLaddar(false) })
    return () => { aktiv = false }
  }, [])

  useEffect(() => {
    // Månadsavgiften — BARA vid säker källa (ägarrapportens regel):
    // aktiv prenumeration med Stripe-koppling + pris ur billing_plan.
    // Testkonton och driftade cachefält ger null → ingen multipel-rad.
    let aktiv = true
    fetch('/api/billing')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!aktiv || !d) return
        const pris = Number(d?.plan?.price_sek)
        if (
          d?.subscription?.status === 'active' &&
          d?.subscription?.stripe_subscription_id &&
          Number.isFinite(pris) && pris > 0
        ) {
          setManadsavgiftKr(pris)
        }
      })
      .catch(() => { /* ingen avgiftskälla → ingen multipel, aldrig en gissning */ })
    return () => { aktiv = false }
  }, [])

  return (
    <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen">
      <div className="max-w-4xl mx-auto flex flex-col gap-5">
        {/* ═══ Ledger-halvan — verifierad kedjedata ═══ */}
        {ledger && (
          <>
            <LedgerHero ledger={ledger} manadsavgiftKr={manadsavgiftKr} />
            <LedgerFlode ledger={ledger} />
            {ledger.items.length > 0 && <LedgerRader items={ledger.items} />}
            <LedgerHistorik rader={historik} laddar={historikLaddar} />
          </>
        )}

        <RevenueWorkQueue />

        {/* ═══ Potential-halvan — identifierat, inte bokfört ═══ */}
        <div>
          <h1 className="font-heading text-2xl sm:text-[28px] font-bold tracking-[-0.02em] text-slate-900 m-0 mt-2">
            Pengar på bordet
          </h1>
          <p className="mt-1.5 mb-0 text-sm text-slate-500">
            Var ligger pengarna ni annars riskerar att missa? Allt nedan är
            identifierad potential — inte bokförd intäkt.
          </p>
        </div>

        {laddar && (
          <div className="mt-4 flex justify-center">
            <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
          </div>
        )}

        {fel && !laddar && (
          <div className="rounded-card border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            Kunde inte räkna ihop just nu. Ladda om sidan — händer det igen, säg till oss.
          </div>
        )}

        {data && !laddar && (
          data.kategorier.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-card p-8 text-center">
              <span className="inline-flex w-11 h-11 rounded-full bg-primary-50 text-primary-700 items-center justify-center mb-2">
                <Banknote className="w-5 h-5" />
              </span>
              <h2 className="m-0 font-heading text-[15px] font-semibold text-slate-900">Inget ligger på bordet just nu</h2>
              <p className="m-0 mt-1 text-sm text-slate-500">
                Inga aktuella källrader behöver fakturakontroll och inga fakturor är förfallna.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-white border border-slate-200 rounded-card p-6 text-center">
                <span className="block font-heading text-4xl sm:text-5xl font-bold tabular-nums text-slate-900">
                  {formatKr(data.totalKr)}
                </span>
                <span className="block text-sm text-slate-500 mt-1">
                  identifierad potential i {data.kategorier.length} kategorier
                </span>
              </div>

              {/* Trikotomin (A2): samma fem kategorier, grupperade i tre
                  handlingsnivåer — intjänat, potentiellt, hotat. Svarar på
                  "vad gör jag först?", inte bara "var ligger pengarna?". */}
              {grupperaPengar(data).map(grupp => (
                <div key={grupp.key}>
                  <div className="flex items-baseline gap-2 mb-2 px-1">
                    <h2 className="m-0 font-heading text-[15px] font-semibold text-slate-900">{grupp.titel}</h2>
                    {grupp.summaKr > 0 && (
                      <span className={`font-heading text-sm font-bold tabular-nums ${
                        grupp.key === 'risk' ? 'text-red-700' : grupp.key === 'mojligheter' ? 'text-slate-500' : 'text-primary-700'
                      }`}>
                        {formatKr(grupp.summaKr)}
                      </span>
                    )}
                    <span className="text-xs text-slate-400 hidden sm:inline">{grupp.beskrivning}</span>
                  </div>
                  <div className="flex flex-col gap-3">
                    {grupp.kategorier.map(k => (
                      <Link
                        key={k.key}
                        href={k.href}
                        className="flex items-center gap-4 bg-white border border-slate-200 rounded-card p-4 sm:p-5 hover:border-primary-300 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-heading text-xl font-bold tabular-nums text-slate-900">
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
                </div>
              ))}

              <p className="m-0 text-xs text-slate-400 text-center">
                Summorna kommer från källrader i offerter, projekt och fakturor. De är potential tills de har granskats.
              </p>
            </>
          )
        )}

        {/* Revenue Review (X1b): granska fynden HÄR — frågan och handlingen
            hör ihop. Renderar ingenting när inget väntar. */}
        {!laddar && <Intaktsfynden />}
      </div>
    </div>
  )
}
