'use client'

import Link from 'next/link'
import { Mic } from 'lucide-react'

/**
 * Skrivraden — två lägen (Tur 4 etapp 4).
 *
 * ═══ VARFÖR TVÅ LÄGEN ═══
 *
 * Skrivraden ligger SIST med flit: allt ovanför klaras utan tangentbord, och
 * en textruta som svarar är en sämre meny med extra skrivarbete. Men när kön
 * är LUGN (`beslut <= 1`) är skärmen halvtom — då får raden vara stor och
 * bära chips som är de fyra vanligaste ärendena som färdiga ingångar.
 * När besluten väntar (`beslut >= 2`) krymper den till dagens pill: besluten
 * äger skärmen (samma tröskel som bevakningen).
 *
 * Chipsen är Link-pills till VERIFIERADE rutter — tests/jarvis-hem.spec.ts
 * källskannar att varje href motsvarar en existerande page.tsx, så en flyttad
 * sida blir röd i CI i stället för en död länk i prod.
 *
 * Klick på ytan/micken öppnar befintliga Jobbkompisen (riktiga Matte, med
 * röst) — ingen ny chattbackend.
 */

// Omgjorda 2026-08-11 (Andreas UX-fynd): chipsen navigerade till formulär-
// sidor — men de sitter UNDER Matte-inputen, så förväntan är att de startar
// en delegering till Matte, inte flyr till gamla UI:t. Klick öppnar nu
// Jobbkompisen med en påbörjad mening som hantverkaren fyller i. `href`
// behålls som dokumenterad kanonisk fallback-sida per ärende (CI kräver att
// den finns) men används inte längre som primärklick.
export const SKRIVRAD_CHIPS: Array<{ label: string; href: string; prompt: string }> = [
  { label: 'Ny offert', href: '/dashboard/quotes/new', prompt: 'Skapa en offert till ' },
  { label: 'Boka in ett jobb', href: '/dashboard/schedule', prompt: 'Boka in ett jobb åt ' },
  { label: 'Skicka en faktura', href: '/dashboard/invoices/new', prompt: 'Skicka en faktura till ' },
  { label: 'SMS till en kund', href: '/dashboard/sms-inbox', prompt: 'Skicka ett SMS till ' },
]

export function SkrivRad({
  stor,
  onOppna,
  onRost,
  onChip,
  tourTarget,
}: {
  stor: boolean
  onOppna: () => void
  /** Matte Mobile Voice V1 (2026-08-30): mikrofonen är inte längre kosmetisk.
   *  Klick på mic-cirkeln startar en riktig inspelning (Jobbkompisen öppnas
   *  på Röst-fliken med autostart); klick på textytan öppnar chatten som
   *  förut. Saknas prop:en faller micken tillbaka till onOppna. */
  onRost?: () => void
  onChip?: (prompt: string) => void
  /** Hemturens sista stopp (components/tour/HemTur.tsx) markerar rotelementet
   *  direkt i stället för att wrappas — SkrivRad äger sin egen grid-placering
   *  (lg:row-start-3 lg:col-start-1) och en extern wrapper hade tystat den. */
  tourTarget?: string
}) {
  if (!stor) {
    // Pillen — besluten äger skärmen. Två klickytor: texten → chatt,
    // micken → röst.
    return (
      <div
        data-tour-target={tourTarget}
        className="lg:row-start-3 lg:col-start-1 w-full flex items-center gap-2.5 h-12 pl-[18px] pr-2 bg-white border border-slate-200 rounded-full text-sm text-slate-400 hover:border-slate-300 transition-colors"
      >
        <button
          type="button"
          onClick={onOppna}
          className="flex-1 h-full text-left truncate text-slate-400"
        >
          Säg till Matte — eller tryck. Allt ovanför klaras utan tangentbord.
        </button>
        <button
          type="button"
          onClick={onRost ?? onOppna}
          aria-label="Prata med Matte"
          className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center shrink-0 hover:bg-primary-100 transition-colors"
        >
          <Mic className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div data-tour-target={tourTarget} className="lg:row-start-3 lg:col-start-1 bg-white border border-slate-200 rounded-2xl p-4">
      <div className="w-full flex items-center gap-3 min-h-[52px]">
        {/* Orkestreringen demonstreras där den ANVÄNDS: här delegerar man
            till Matte, som dirigerar specialisterna. Copyn säger det —
            hellre än ett org-diagram som säger samma sak varje dag. */}
        <button
          type="button"
          onClick={onOppna}
          className="flex-1 min-h-[52px] text-left text-[15px] text-slate-400 truncate"
        >
          Säg till Matte — teamet tar det därifrån …
        </button>
        <button
          type="button"
          onClick={onRost ?? onOppna}
          aria-label="Prata med Matte"
          className="w-11 h-11 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shrink-0 shadow-sm hover:opacity-90 transition-opacity"
        >
          <Mic className="w-5 h-5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {SKRIVRAD_CHIPS.map(chip => (
          <button
            key={chip.href}
            type="button"
            onClick={() => onChip?.(chip.prompt)}
            className="inline-flex items-center min-h-[36px] px-3.5 rounded-full border border-slate-200 bg-slate-50 text-[13px] font-medium text-slate-600 hover:border-primary-200 hover:text-primary-700 hover:bg-primary-50 transition-colors"
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default SkrivRad
