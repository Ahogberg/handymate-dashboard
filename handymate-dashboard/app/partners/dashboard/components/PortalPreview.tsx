'use client'

// "Så ser portalen ut när du har kunder" — visas BARA i tomma läget
// (2026-09-08, Andreas beslut inför partnerdemon).
//
// Varför den finns: en ny partner har noll hänvisningar, och då renderar
// portalen ingenting av det som svarar på partnerns första fråga — vad tjänar
// jag och när får jag det? Hero, statrad, kundlista och underlag är alla tomma.
// Blocket visar samma vyer med påhittade kunder, så att partnern (och den som
// får portalen demonstrerad) ser vad som väntar.
//
// Sanningsregler:
//  - Siffrorna är MÄRKTA som exempel, på blocket och i varje delrubrik.
//    Ingen av dem får kunna förväxlas med partnerns egna.
//  - Satsen och antalet månader är partnerns EGNA värden ur payloaden —
//    exemplet räknar aldrig på en sats partnern inte har.
//  - Månadsbeloppet härleds ur PLAN_PRICES_SEK (Firman), inte ur en
//    hårdkodad siffra som kan glida ifrån prislistan.
//  - Beloppen går ihop: utbetalt + upplupet = summan av kundraderna.
//  - Inget i blocket är klickbart. Det är en bild, inte en yta.

import { PLAN_PRICES_SEK } from '@/lib/feature-gates'
import { formatSek, formatProcent } from './types'

interface Props {
  /** Partnerns faktiska sats (0–1). */
  rate: number
  /** Partnerns faktiska provisionsperiod i kalendermånader. */
  ladderMonths: number
}

/** Exempelkunder: månad = hur många månader kunden betalat. */
const EXEMPELKUNDER: { namn: string; manader: number; etikett: string }[] = [
  { namn: 'Nordströms El AB', manader: 7, etikett: 'Aktiv kund' },
  { namn: 'Rörjouren Väst AB', manader: 5, etikett: 'Aktiv kund' },
  { namn: 'Sjöbergs Måleri AB', manader: 2, etikett: 'Aktiv kund' },
  { namn: 'Bygg & Kakel i Sollentuna', manader: 0, etikett: 'Onboardar' },
]

export default function PortalPreview({ rate, ladderMonths }: Props) {
  const manadspris = PLAN_PRICES_SEK.professional
  const manadsprovision = Math.round(manadspris * rate)

  const aktiva = EXEMPELKUNDER.filter(k => k.manader > 0)
  // Innevarande månad är upplupen, tidigare månader är utbetalda.
  const upplupet = aktiva.length * manadsprovision
  const utbetalt = aktiva.reduce((s, k) => s + (k.manader - 1) * manadsprovision, 0)

  return (
    <section
      aria-label="Exempel på hur portalen ser ut när du har kunder"
      className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-100/60 p-4 sm:p-5 flex flex-col gap-4"
    >
      <div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <p className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">Exempel</p>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white text-slate-500 border border-dashed border-slate-300">
            Inte dina siffror
          </span>
        </div>
        <h2 className="text-[17px] font-semibold text-slate-900 mt-1">
          Så ser portalen ut när du har kunder
        </h2>
        <p className="text-[13px] text-slate-500 mt-1 max-w-2xl leading-relaxed">
          Påhittade kunder, riktig räkning: {formatProcent(rate)} av {formatSek(manadspris)} i månaden
          per kund på Firman — det är {formatSek(manadsprovision)} per kund och månad, kundens
          första {ladderMonths} månader.
        </p>
      </div>

      <div className="flex flex-col gap-3 opacity-95">
        {/* Hero — samma vy som med kunder, i exempelform */}
        <div className="bg-[#0f2e2a] text-white rounded-xl p-5 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] font-semibold tracking-widest text-teal-300 uppercase">
              Upplupen provision · exempel
            </p>
            <div className="text-[34px] font-bold tracking-tight mt-1.5 leading-none">
              {formatSek(upplupet)}
            </div>
            <p className="text-white/60 text-[13px] mt-2">
              {aktiva.length} aktiva kunder × {formatSek(manadsprovision)} — ackruerat den här månaden,
              betalas när självfakturan är hanterad
            </p>
          </div>
          {/* Etiketten i eyebrown räcker på mobil — pillen skulle läsas som en knapp. */}
          <span className="hidden sm:inline-flex flex-none text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10 text-white/70 border border-white/20">
            Exempel
          </span>
        </div>

        {/* Statrad */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Hänvisade företag', value: String(EXEMPELKUNDER.length) },
            { label: 'Aktiva kunder', value: String(aktiva.length) },
            { label: 'Utbetalt totalt', value: formatSek(utbetalt) },
          ].map(s => (
            <div key={s.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3">
              <p className="text-[13px] text-slate-500">{s.label}</p>
              <p className="text-[22px] font-bold tracking-tight text-slate-900 mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Kundlista */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <p className="text-sm font-semibold text-slate-900">Dina kunder · exempel</p>
            <p className="text-[13px] text-slate-500 mt-0.5">
              Du ser din intjäning per kund — aldrig vad kunden betalar.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {EXEMPELKUNDER.map(k => (
              <div key={k.namn} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{k.namn}</p>
                  <p className="text-[13px] text-slate-500">
                    {k.etikett}
                    {k.manader > 0 && ` · kund i ${k.manader} ${k.manader === 1 ? 'månad' : 'månader'}`}
                  </p>
                </div>
                <span className="flex-none text-sm font-semibold text-slate-900 tabular-nums">
                  {k.manader > 0 ? formatSek(k.manader * manadsprovision) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[13px] text-slate-500 leading-relaxed">
        Dina egna siffror fylls i automatiskt när din första kund börjar betala — du behöver inte
        rapportera något. Provisionen räknas på vad kunden faktiskt betalar, exklusive moms, och
        betalas månadsvis i efterskott genom självfakturering.
      </p>
    </section>
  )
}
