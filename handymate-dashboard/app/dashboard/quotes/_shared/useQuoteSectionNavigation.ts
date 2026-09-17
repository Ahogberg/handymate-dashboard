'use client'
import { useCallback, useEffect, useState } from 'react'
import type { QuoteSection } from '@/lib/quotes/quote-completeness'

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
