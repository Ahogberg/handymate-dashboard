'use client'

/**
 * Minitidslinjen på Lars schemakort.
 *
 * ═══ VARFÖR DEN FINNS ═══
 *
 * Kortet beskrev krocken i text: "AI försökte boka 14 aug kl 09:30 men det
 * krockar med: Schema: Ekbacken 3 (09:00-12:00)". Den meningen är sann men
 * kräver att hantverkaren håller två klockslag i huvudet och räknar ut
 * överlappet själv — stående på ett tak, med handskar på.
 *
 * Två block på en timaxel svarar på samma fråga utan att man räknar.
 *
 * ═══ VARFÖR MAN INTE KAN DRA I DEN ═══
 *
 * Mockupen har ett block man drar för att flytta jobbet. Det är snyggt och
 * fel: en dragning med handskar på en telefon i solljus flyttar ett riktigt
 * kundbesök, och ångra hinner sällan fram. Besluten ligger kvar som knappar
 * på kortet. Tidslinjen visar — den ändrar inget.
 */

/** Ett block på axeln. Minuter från midnatt, så jämförelser blir triviala. */
export interface Tidsblock {
  titel: string
  startMin: number
  slutMin: number
}

const AXEL_START = 7 * 60
const AXEL_SLUT = 18 * 60

/**
 * Plockar ut krockande block ur konfliktsträngarna.
 *
 * Formatet — `Schema: <titel> (09:00-12:00)` — genereras i
 * lib/approve-actions.ts och är därför stabilt. Kopplingen är avsiktlig och
 * dokumenterad på båda sidor: ändras formatet där ritar tidslinjen inget,
 * och kortet faller tillbaka på texten i stället för att visa fel tider.
 *
 * Ren funktion — facit i tests/schedule-timeline.spec.ts.
 */
export function parseKonflikter(konflikter: string[] | null | undefined): Tidsblock[] {
  if (!Array.isArray(konflikter)) return []
  const ut: Tidsblock[] = []
  for (const rad of konflikter) {
    if (typeof rad !== 'string') continue
    const m = rad.match(/^(?:[^:]+:\s*)?(.*?)\s*\((\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})\)\s*$/)
    if (!m) continue
    const startMin = Number(m[2]) * 60 + Number(m[3])
    const slutMin = Number(m[4]) * 60 + Number(m[5])
    // Ett block som slutar innan det börjar är trasig data, inte ett block.
    if (!(slutMin > startMin)) continue
    ut.push({ titel: m[1].trim() || 'Bokat', startMin, slutMin })
  }
  return ut
}

/** Minuter från midnatt ur en ISO-tid. Ogiltigt datum ger null. */
export function minuterFranIso(iso: string | null | undefined): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.getHours() * 60 + d.getMinutes()
}

function procent(min: number): number {
  const v = ((min - AXEL_START) / (AXEL_SLUT - AXEL_START)) * 100
  return Math.max(0, Math.min(100, v))
}

function klocka(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

export function ScheduleTimeline({
  bokat,
  onskad,
}: {
  /** Det som redan ligger i kalendern. */
  bokat: Tidsblock[]
  /** Tiden AI:n försökte boka — den som krockar. */
  onskad: Tidsblock | null
}) {
  // Utan minst ett block finns ingenting att visa. Hellre ingen tidslinje än
  // en tom axel som ser ut som en trasig komponent.
  if (bokat.length === 0 && !onskad) return null

  const timmar = [7, 9, 11, 13, 15, 17]

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3">
      <div className="flex justify-between text-[10px] text-slate-400 mb-1.5 tabular-nums">
        {timmar.map(t => <span key={t}>{String(t).padStart(2, '0')}</span>)}
      </div>

      <div className="relative" style={{ height: bokat.length > 0 && onskad ? 58 : 26 }}>
        {bokat.map((b, i) => (
          <div
            key={`${b.titel}-${i}`}
            className="absolute top-0 h-[26px] rounded-lg bg-primary-100 border border-primary-300 flex items-center px-2.5 overflow-hidden"
            style={{ left: `${procent(b.startMin)}%`, width: `${Math.max(procent(b.slutMin) - procent(b.startMin), 8)}%` }}
            title={`${b.titel} ${klocka(b.startMin)}–${klocka(b.slutMin)}`}
          >
            <span className="text-[11px] font-semibold text-primary-900 truncate">
              {b.titel} · {klocka(b.startMin)}–{klocka(b.slutMin)}
            </span>
          </div>
        ))}

        {onskad && (
          <div
            className="absolute h-[26px] rounded-lg bg-white border-[1.5px] border-dashed border-slate-300 flex items-center px-2.5 overflow-hidden"
            style={{
              top: bokat.length > 0 ? 32 : 0,
              left: `${procent(onskad.startMin)}%`,
              width: `${Math.max(procent(onskad.slutMin) - procent(onskad.startMin), 8)}%`,
            }}
            title={`${onskad.titel} ${klocka(onskad.startMin)}–${klocka(onskad.slutMin)}`}
          >
            <span className="text-[11px] font-semibold text-slate-600 truncate">
              {onskad.titel} · {klocka(onskad.startMin)}
            </span>
          </div>
        )}
      </div>

      <p className="m-0 mt-2 text-[11px] text-slate-400">
        Streckat är tiden som föreslogs — fyllt är det som redan står i kalendern.
      </p>
    </div>
  )
}

export default ScheduleTimeline
