'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { A4_WIDTH_PX, computeFitScale } from './format'
import { useIsMobileViewport } from './useIsMobileViewport'

/**
 * ETAPP 3 (offert-masterplan.md), punkt 1: dokumentet (A4, 210mm — fast
 * bredd i modern-css.ts) är bredare än en mobilskärm. Under `lg` skalas det
 * ned till skärmbredd via CSS `transform: scale()` — läsbarhet före
 * pixelperfektion (masterplanens ord): hela dokumentet syns i en enda vy
 * istället för att kräva horisontell scroll genom en 794px-bred yta på en
 * ~380px skärm.
 *
 * Vid `lg` och uppåt är detta ett no-op (`<>{children}</>`) — EXAKT samma
 * rendering som innan E3, så desktop-vyn kan inte regrediera.
 *
 * Tekniken: `transform: scale()` ändrar INTE layoutboxens mått (bara det
 * visuella), så en fast-bred inre wrapper (`A4_WIDTH_PX`) skalas ned
 * visuellt medan `scrollHeight` fortfarande går att mäta oskalat — den
 * mätningen används för att sätta YTTRE containerns höjd till den skalade
 * höjden (annars skulle den oskalade layouthöjden lämna ett tomt gap under
 * det krympta dokumentet).
 */
export function DocumentScaler({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobileViewport()
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [contentHeight, setContentHeight] = useState(0)

  useLayoutEffect(() => {
    if (!isMobile) return
    const containerEl = containerRef.current
    const contentEl = contentRef.current
    if (!containerEl || !contentEl) return

    const measure = () => {
      setScale(computeFitScale(containerEl.clientWidth))
      setContentHeight(contentEl.scrollHeight)
    }
    measure()

    // Observerar BÅDA — containerns bredd kan ändras (rotation, sidopanel
    // som fälls in) och innehållets höjd ändras hela tiden när hantverkaren
    // redigerar (ny rad, längre beskrivning). transform påverkar inte
    // scrollHeight/clientWidth (bara det visuella), så ingen risk för en
    // oändlig mät→skala→mät-loop.
    const ro = new ResizeObserver(measure)
    ro.observe(containerEl)
    ro.observe(contentEl)
    return () => ro.disconnect()
  }, [isMobile])

  if (!isMobile) return <>{children}</>

  return (
    <div ref={containerRef} className="w-full overflow-hidden" style={{ height: contentHeight ? contentHeight * scale : undefined }}>
      <div
        ref={contentRef}
        style={{
          width: A4_WIDTH_PX,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          // ETAPP C3-fix (2026-08-06): skalan publiceras som CSS-variabel så
          // dokumentets egen CSS kan kompensera för den.
          //
          // Allt som ritas inuti transformen krymper med den. På en 375px-skärm
          // är skalan ~0,43, vilket gör en 1px ring till en subpixelhårlinje —
          // sektionslyftet, den enda övergången som ses fyra gånger per offert,
          // hade alltså knappt synts på just den enhet flödet är byggt för.
          // Mått som ska ha konstant SKÄRMstorlek delas med variabeln.
          ['--qd-scale' as any]: scale,
        }}
      >
        {children}
      </div>
    </div>
  )
}
