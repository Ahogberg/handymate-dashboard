'use client'

import { useEffect, useState } from 'react'

/**
 * ETAPP 3 (offert-masterplan.md): samma brytpunkt som Tailwinds `lg`
 * (1024px) — dokumentmotorns mobilanpassningar (DocumentScaler.tsx skalar
 * A4 till skärmbredd, QuoteDocumentSurface sätter QuoteDocument i sheetMode)
 * ska växla vid exakt samma gräns som resten av canvas-first-layouten
 * (new/page.tsx + [id]/edit/page.tsx använder `lg:`-prefixet överallt).
 */
const MOBILE_QUERY = '(max-width: 1023.98px)'

/**
 * true under `lg`. matchMedia istället för en egen `resize`-lyssnare +
 * innerWidth-jämförelse — mindre kod, och `change`-eventet triggar bara vid
 * faktisk brytpunktspassage (inte varje pixel under en resize).
 *
 * SSR-säker: returnerar false (matchar serverns markup) tills mount, sätts
 * sedan i en effekt — ingen hydreringsmismatch, men ett µ-ögonblick där en
 * mobil klient initialt renderar desktop-grenen (samma avvägning som all
 * annan matchMedia-baserad CSS-i-JS i React).
 */
export function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  return isMobile
}
