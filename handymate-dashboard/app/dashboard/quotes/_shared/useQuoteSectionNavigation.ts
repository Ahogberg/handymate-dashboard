'use client'
import { useCallback, useEffect, useState } from 'react'

/**
 * RIVNING PAKET C (2026-09-17, rad 2.16): `QuoteSection` bodde i
 * `lib/quotes/quote-completeness.ts`, som är borttagen med completeness-
 * remsan/chip-raden. Typen flyttar hit — den beskriver fortfarande
 * `data-section`-attributen i QuoteDocument.tsx, och den här filen är den
 * enda återstående läsaren.
 */
export type QuoteSection = 'inkluderat' | 'exkluderat' | 'reservationer' | 'prisbild'

/**
 * Scrollar till en sektion i dokumentet via dess `data-section`-attribut.
 *
 * Väntar en bildruta innan scrollningen: sektionen kan ha monterats i samma
 * render som klicket. Nollställ först INUTI bildrutan — en tidigare
 * nollställning kör cleanup och avbryter scrollningen.
 *
 * RIVNINGEN PAKET A (2026-09-17): tog tidigare emot ett `showDocument`-anrop
 * som växlade bort från listvyn först, eftersom `data-section` bara finns i
 * canvas-renderingen. Listvyn är borta och dokumentet är alltid ytan, så det
 * finns inget att växla till.
 *
 * RIVNING PAKET C (2026-09-17, rad 2.16): completeness-chipparna som
 * anropade denna (header-remsan, bottenfältets chip-rad) är borttagna —
 * hooken lever kvar, oanropad av UI just nu, som den enda vägen in i
 * dokumentets `data-section`-attribut.
 */
export function useQuoteSectionNavigation() {
  const [pendingSection, setPendingSection] = useState<QuoteSection | null>(null)
  const navigate = useCallback((section: QuoteSection) => {
    setPendingSection(section)
  }, [])
  useEffect(() => {
    if (!pendingSection) return
    const frame = requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-section="${pendingSection}"]`)
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setPendingSection(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [pendingSection])
  return navigate
}
