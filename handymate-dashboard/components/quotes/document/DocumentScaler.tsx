'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { A4_WIDTH_PX, computeFitScale } from './format'

/**
 * ETAPP 3 (offert-masterplan.md), punkt 1: dokumentet (A4, 210mm — fast
 * bredd i modern-css.ts) är bredare än en mobilskärm. Skalas ned till
 * CONTAINERNS bredd via CSS `transform: scale()` — läsbarhet före
 * pixelperfektion (masterplanens ord): hela dokumentet syns i en enda vy
 * istället för att kräva horisontell scroll genom en 794px-bred yta i en
 * smalare container.
 *
 * RÄTTAT 2026-08-17 (Andreas fynd, "kritisk grej"): skalningen gatades
 * tidigare på appens vanliga mobil-brytpunktshook — ett VIEWPORT-test,
 * "lg och uppåt är ett no-op". Det höll så länge förhandsgranskningen bara
 * levde i gamla editorns breda tvåkolumnslayout (max-w-[1600px]). Samma
 * QuotePreviewPanel/DocumentScaler-kedja monteras nu ÄVEN i det guidade
 * Snabboffert-flödet, i en mycket smalare enkolumns-container
 * (max-w-3xl ≈ 768px) — smalare än A4-bredden, men på en RIKTIG
 * desktopskärm där isMobile alltid är false. Skalningen stängdes då helt
 * av, och dokumentet klipptes/krävde horisontell scroll i en yta som
 * aldrig var tänkt att rymma det oskalat.
 *
 * `computeFitScale` skalar redan ALDRIG upp (max 1, se format.ts) — så
 * att alltid mäta och skala, oavsett viewport, är säkert överallt: en
 * container bredare än A4 ger scale=1 (visuellt identiskt med tidigare
 * beteende på lg+, ingen regression), en smalare container skalar nu
 * ner korrekt oavsett OM den smalheten kommer från en liten skärm eller
 * en smal kolumn på en stor skärm — det är containerns bredd som avgör,
 * inte viewportens.
 *
 * Tekniken: `transform: scale()` ändrar INTE layoutboxens mått (bara det
 * visuella), så en fast-bred inre wrapper (`A4_WIDTH_PX`) skalas ned
 * visuellt medan `scrollHeight` fortfarande går att mäta oskalat — den
 * mätningen används för att sätta YTTRE containerns höjd till den skalade
 * höjden (annars skulle den oskalade layouthöjden lämna ett tomt gap under
 * det krympta dokumentet).
 */
export function DocumentScaler({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [contentHeight, setContentHeight] = useState(0)

  useLayoutEffect(() => {
    const containerEl = containerRef.current
    const contentEl = contentRef.current
    if (!containerEl || !contentEl) return

    const measure = () => {
      setScale(computeFitScale(containerEl.clientWidth))
      setContentHeight(contentEl.scrollHeight)
    }
    measure()

    // Observerar BÅDA — containerns bredd kan ändras (fönsterresize,
    // sidopanel som fälls in, sektionsbyte i granskningen) och innehållets
    // höjd ändras hela tiden när hantverkaren redigerar (ny rad, längre
    // beskrivning). transform påverkar inte scrollHeight/clientWidth (bara
    // det visuella), så ingen risk för en oändlig mät→skala→mät-loop.
    const ro = new ResizeObserver(measure)
    ro.observe(containerEl)
    ro.observe(contentEl)
    return () => ro.disconnect()
  }, [])

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
