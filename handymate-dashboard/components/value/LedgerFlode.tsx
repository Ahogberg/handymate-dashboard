'use client'

import { formatKr } from '@/lib/moments/derive'
import type { ManadsLedger, ManadsLedgerSteg } from '@/lib/value/ledger'
import { periodManad } from './ledger-format'

/**
 * Fyrstegsflödet som mockupens kedja (Etapp B2) + "Föll bort på vägen"-raden
 * (B3). Ren presentation av lib/value/ledger.ts-datat — de fyra stegen är
 * strikt åtskilda sanningsnivåer och summeras aldrig.
 *
 * Desktop: fyra kort med ›-pilar. Mobil (<md): mockupens 4b-variant —
 * vertikala rader med etikett, kronor och progressbar.
 *
 * Progressbaren är stegets kronor som andel av Identifierat. Fakturerat/
 * Betalt är FAKTURANS kronor medan Identifierat är kortens uppskattningar,
 * så andelen kan i teorin passera 100 % — den klampas i visningen (bara
 * bredden, aldrig siffran).
 */

interface StegDef {
  nr: string
  etikett: string
  steg: ManadsLedgerSteg
  antalText: string
  forklaring: string
  betoning: boolean
  barFarg: string
}

function stegDefs(l: ManadsLedger): StegDef[] {
  return [
    {
      nr: '1', etikett: 'Identifierat', steg: l.identifierat,
      antalText: `${l.identifierat.antal} poster`,
      forklaring: 'Möjligheter teamet hittat: ofakturerat, förfallet, ÄTA och lönsamhetsvarningar.',
      betoning: false, barFarg: 'bg-slate-400',
    },
    {
      nr: '2', etikett: 'Agerat', steg: l.agerat,
      antalText: `${l.agerat.antal} poster · du godkände`,
      forklaring: 'Kort du godkänt — åtgärden är utförd.',
      betoning: false, barFarg: 'bg-primary-400',
    },
    {
      nr: '3', etikett: 'Fakturerat', steg: l.fakturerat,
      antalText: `${l.fakturerat.antal} poster`,
      forklaring: 'Fakturan finns och är spårbar till kortet. Fakturans belopp, inte kortets uppskattning.',
      betoning: false, barFarg: 'bg-primary-600',
    },
    {
      nr: '4', etikett: 'Verifierat betalt', steg: l.betalt,
      antalText: `${l.betalt.antal} poster`,
      forklaring: 'Fakturan är markerad betald i bokföringen. Enda siffran vi räknar som värde.',
      betoning: true, barFarg: 'bg-primary-700',
    },
  ]
}

function andelProcent(steg: ManadsLedgerSteg, identifieratKr: number): number {
  if (identifieratKr <= 0) return 0
  return Math.min(100, Math.round((steg.kr / identifieratKr) * 100))
}

export function LedgerFlode({ ledger }: { ledger: ManadsLedger }) {
  const defs = stegDefs(ledger)

  return (
    <section className="bg-white border border-slate-200 rounded-card p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3 mb-5">
        <h2 className="m-0 font-heading text-[17px] font-semibold text-slate-900">
          Från upptäckt till pengar på kontot
        </h2>
        <span className="text-[12.5px] text-slate-400 shrink-0">
          {periodManad(ledger.period)} · {ledger.identifierat.antal} poster
        </span>
      </div>

      {/* Desktop: fyra kort med pilar */}
      <div className="hidden md:grid grid-cols-[1fr_26px_1fr_26px_1fr_26px_1fr] items-stretch">
        {defs.map((d, i) => (
          <StegKortDesktop
            key={d.nr}
            def={d}
            procent={andelProcent(d.steg, ledger.identifierat.kr)}
            sista={i === defs.length - 1}
          />
        ))}
      </div>

      {/* Mobil: mockupens 4b — vertikala rader med progressbar */}
      <div className="md:hidden flex flex-col gap-3.5">
        {defs.map(d => (
          <div key={d.nr}>
            <div className="flex items-baseline justify-between text-[13.5px] mb-1.5 gap-3">
              <span className={d.betoning ? 'text-primary-700 font-semibold' : 'text-slate-500'}>
                {d.nr} · {d.etikett}
              </span>
              <span className={`font-heading font-bold tabular-nums ${d.betoning ? 'text-primary-700' : 'text-slate-900'}`}>
                {formatKr(d.steg.kr)}
              </span>
            </div>
            <div className="h-[7px] bg-slate-100 rounded-full">
              <div
                className={`h-full rounded-full ${d.barFarg}`}
                style={{ width: `${andelProcent(d.steg, ledger.identifierat.kr)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* B3: Föll bort på vägen — renderas bara när något faktiskt föll bort */}
      {ledger.bortfall.avvisade_antal > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100 text-[13px] text-slate-500">
          <strong className="text-slate-700 font-semibold">Föll bort på vägen:</strong>{' '}
          {ledger.bortfall.avvisade_antal} förslag avvisade ·{' '}
          <span className="tabular-nums">{formatKr(ledger.bortfall.avvisade_kr)}</span>
        </div>
      )}
    </section>
  )
}

function StegKortDesktop({
  def,
  procent,
  sista,
}: {
  def: StegDef
  procent: number
  sista: boolean
}) {
  return (
    <>
      <div
        className={
          def.betoning
            ? 'bg-grad-tint border-[1.5px] border-primary-600/40 rounded-[14px] p-4'
            : 'bg-slate-50 border border-slate-200 rounded-[14px] p-4'
        }
      >
        <div
          className={`text-[11px] tracking-[0.14em] uppercase font-semibold mb-2 ${
            def.betoning ? 'text-primary-600' : 'text-slate-400'
          }`}
        >
          {def.nr} · {def.etikett}
        </div>
        <div
          className={`font-heading font-bold tabular-nums text-2xl tracking-[-0.02em] ${
            def.betoning ? 'text-primary-700' : 'text-slate-900'
          }`}
        >
          {formatKr(def.steg.kr)}
        </div>
        <div className={`text-[13px] mt-0.5 ${def.betoning ? 'text-primary-700' : 'text-slate-500'}`}>
          {def.antalText}
        </div>
        <div className={`h-1.5 rounded-full mt-3.5 mb-3 ${def.betoning ? 'bg-primary-100' : 'bg-slate-200'}`}>
          <div className={`h-full rounded-full ${def.barFarg}`} style={{ width: `${procent}%` }} />
        </div>
        <div className={`text-[13px] leading-normal ${def.betoning ? 'text-primary-900/80' : 'text-slate-600'}`}>
          {def.forklaring}
        </div>
      </div>
      {!sista && (
        <div className="grid place-items-center text-slate-300 text-lg select-none" aria-hidden>
          ›
        </div>
      )}
    </>
  )
}
