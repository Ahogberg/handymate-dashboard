'use client'

import { useEffect, useState } from 'react'

/**
 * Väntan medan AI:n bygger utkastet (etapp C2, 2026-08-06).
 *
 * ═══ VARFÖR INTE BARA EN SPINNER ═══
 *
 * Svaret kommer i ETT stycke — det finns ingen ström att visa. En spinner
 * hade varit ärlig men innehållslös, och 10-20 sekunders tomhet efter att man
 * beskrivit ett jobb känns som att appen tappat bort sig.
 *
 * I stället renderas dokumentets SKELETT direkt med det som redan är känt
 * (företagsnamn, kund, datum) och skimmer där innehållet ska landa. Då ser man
 * vad man väntar på.
 *
 * ═══ STATUSRADEN ÄR ÄRLIG ═══
 *
 * De tre lägena beskriver vad som FAKTISKT sker i tur och ordning: prompten
 * skickas med beskrivningen, prislistan ligger i kontexten, och modellen
 * svarar med raderna. Vi hittar inte på fler steg för att fylla tiden — och
 * går det över 25 sekunder byter texten till ett ärligt "tar längre än
 * vanligt" i stället för att fortsätta låtsas att allt är normalt.
 */

const STAGES = [
  { after: 0, text: 'Läser din beskrivning…' },
  { after: 3500, text: 'Hämtar dina priser…' },
  { after: 8000, text: 'Bygger offerten…' },
]

const SLOW_AFTER_MS = 25000

interface QuickBuildingProps {
  businessName: string
  customerName: string | null
  /** Formaterat datum, samma som dokumentet visar. */
  issuedDate: string
}

export function QuickBuilding({ businessName, customerName, issuedDate }: QuickBuildingProps) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const started = performance.now()
    const timer = setInterval(() => setElapsed(performance.now() - started), 250)
    return () => clearInterval(timer)
  }, [])

  const slow = elapsed > SLOW_AFTER_MS
  const stage = STAGES.filter(s => elapsed >= s.after).pop() ?? STAGES[0]

  return (
    <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
      <style>{`
        @keyframes qb-shimmer { 0% { opacity: .45 } 50% { opacity: .9 } 100% { opacity: .45 } }
        .qb-skel { background: #E2E8F0; border-radius: 6px; animation: qb-shimmer 1.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .qb-skel { animation: none; } }
      `}</style>

      <div className="max-w-xl mx-auto min-h-screen flex flex-col px-4 py-8 sm:py-12">
        {/* Statusraden — det enda som faktiskt säger något */}
        {/* key= gör varje textbyte till en remount så anim-fade körs.
            Statusraden är ärlig — den beskriver vad som faktiskt sker — och en
            mjuk övergång gör att bytet läses som ett STEG i ett förlopp i
            stället för som ett ryck. */}
        <div className="mb-6">
          <p
            key={slow ? 'slow' : stage.text}
            className="font-heading text-xl font-bold text-slate-900 tracking-tight anim-fade"
          >
            {slow ? 'Tar längre än vanligt…' : stage.text}
          </p>
          <p key={slow ? 'sub-slow' : 'sub-normal'} className="text-sm text-slate-500 mt-1 anim-fade">
            {slow
              ? 'Vi väntar fortfarande på svaret. Du kan lämna sidan — utkastet går förlorat, men inget har sparats.'
              : 'Du får granska allt innan något skickas.'}
          </p>
        </div>

        {/* Dokumentskelettet: det vi redan VET renderas skarpt, resten skimrar */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="font-heading text-sm font-bold text-slate-900">{businessName}</p>
              <p className="text-xs text-slate-400 mt-0.5">{issuedDate}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Till</p>
              <p className="text-sm text-slate-900">{customerName || 'Kund väljs senare'}</p>
            </div>
          </div>

          <div className="qb-skel h-6 w-2/3 mb-2" />
          <div className="qb-skel h-3 w-full mb-1.5" style={{ animationDelay: '.1s' }} />
          <div className="qb-skel h-3 w-4/5 mb-6" style={{ animationDelay: '.15s' }} />

          <div className="border-t border-slate-100 pt-4 space-y-3">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-4">
                <div className="qb-skel h-3 flex-1" style={{ animationDelay: `${i * 0.08}s` }} />
                <div className="qb-skel h-3 w-12" style={{ animationDelay: `${i * 0.08 + 0.04}s` }} />
                <div className="qb-skel h-3 w-16" style={{ animationDelay: `${i * 0.08 + 0.08}s` }} />
              </div>
            ))}
          </div>

          <div className="border-t border-slate-100 mt-5 pt-4 flex justify-end">
            <div className="qb-skel h-7 w-32" style={{ animationDelay: '.5s' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
