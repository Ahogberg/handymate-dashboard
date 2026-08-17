'use client'

import { formatKr } from '@/lib/moments/derive'
import type { ManadsLedger } from '@/lib/value/ledger'
import { periodTitel } from './ledger-format'

/**
 * Mörk hero överst på /dashboard/pengar (Etapp B1) — månadens verifierat
 * betalda kronor ur ledgern, mockupens grad-dark-hero-mönster
 * (docs/HANDYMATE_DESIGN_SYSTEM.md §4.0, max EN mörk hero per sida).
 *
 * Sidosiffrorna härleds ur items i STÄLLET för aggregatsubtraktion
 * (fakturerat.kr − betalt.kr): betalt kan innehålla påminnelse-vägen som
 * aldrig passerar fakturerat, och agerat är kortens uppskattningar medan
 * fakturerat är fakturakronor — en rå differens kunde bli negativ eller
 * blanda sorter. Items bär varje korts ärliga steg, så summorna här är
 * exakt "stannade på det steget".
 *
 * Multipeln mot månadsavgiften visas BARA när avgiften har en säker källa
 * (aktiv Stripe-prenumeration + pris ur billing_plan — samma regel som
 * ägarrapporten). Ingen avgift → ingen rad, aldrig en påhittad siffra.
 */
export function LedgerHero({
  ledger,
  manadsavgiftKr,
}: {
  ledger: ManadsLedger
  manadsavgiftKr: number | null
}) {
  const vantarBetalningKr = ledger.items
    .filter(i => i.steg === 'fakturerat')
    .reduce((s, i) => s + i.kr, 0)
  const ageratEjFaktureratKr = ledger.items
    .filter(i => i.steg === 'agerat')
    .reduce((s, i) => s + i.kr, 0)

  const multipel =
    manadsavgiftKr && manadsavgiftKr > 0 && ledger.betalt.kr > 0
      ? ledger.betalt.kr / manadsavgiftKr
      : null

  return (
    <section className="bg-grad-dark-hero rounded-hero p-6 sm:p-8">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 lg:gap-10">
        <div>
          <div className="text-[11px] tracking-[0.14em] uppercase text-primary-300 font-semibold mb-2.5">
            Verifierat betalt · {periodTitel(ledger.period)}
          </div>
          <div className="font-heading font-bold tabular-nums text-white text-4xl sm:text-[52px] leading-none tracking-[-0.02em]">
            {formatKr(ledger.betalt.kr)}
          </div>
          <p className="m-0 mt-2.5 text-sm sm:text-[15px] text-white/60 leading-relaxed max-w-md">
            Pengar där betalningen är bekräftad — fakturan är markerad betald i
            bokföringen. Varje krona går att spåra till kortet som startade den.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-x-8 gap-y-4 lg:pb-1">
          <div>
            <div className="font-heading font-bold tabular-nums text-white text-xl sm:text-2xl">
              {formatKr(vantarBetalningKr)}
            </div>
            <div className="text-[13px] text-white/55 mt-0.5">fakturerat, väntar betalning</div>
          </div>
          <div>
            <div className="font-heading font-bold tabular-nums text-white text-xl sm:text-2xl">
              {formatKr(ageratEjFaktureratKr)}
            </div>
            <div className="text-[13px] text-white/55 mt-0.5">agerat, ej fakturerat</div>
          </div>
          {multipel !== null && (
            <div className="sm:pl-8 sm:border-l sm:border-white/10">
              <div className="font-heading font-bold tabular-nums text-primary-300 text-xl sm:text-2xl">
                {multipel >= 10
                  ? `${Math.round(multipel).toLocaleString('sv-SE')}×`
                  : `${multipel.toLocaleString('sv-SE', { maximumFractionDigits: 1 })}×`}
              </div>
              <div className="text-[13px] text-white/55 mt-0.5">mot månadsavgiften</div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
