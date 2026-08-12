'use client'

/**
 * TourPrimitives — spotlight/placement-mekaniken lyft ur Step6LiveTour
 * (app/onboarding/components/Step6LiveTour.tsx) till en delad, generisk
 * modul (docs/design/FORSTA-30-MINUTERNA.md, DEL 1).
 *
 * Beteendet är BYTE-FÖR-BYTE detsamma som Step6 hade inbyggt — bara flyttat.
 * Färgerna är därför hårdkodade hex/rgba (samma värden som onboardingens
 * --ob-*-tokens i app/onboarding/onboarding.css) i stället för CSS-variabler:
 * onboarding.css laddas bara på /onboarding-rutten, men Step6 OCH Hemturen
 * (som körs på /dashboard) delar den här modulen. En var(--ob-*)-referens
 * hade tystnat på dashboarden.
 *
 * Två sätt att markera en spotlight-target, valfritt beroende på sammanhang:
 *   - TourTarget:        wrappar barnet, äger dim/highlight-opaciteten själv
 *                         (Step6:s mockade, fasta viewport).
 *   - TourHighlightFrame: en fristående ram positionerad efter ett uppmätt
 *                         DOMRect — för RIKTIGA, skrollande sidor där
 *                         elementet inte går att (eller bör) wrappas
 *                         (Hemturen, components/tour/HemTur.tsx).
 * Båda ritar samma ring + "9999px spread"-mörkläggning.
 */

import type { ReactNode } from 'react'

const TEAL = '#0F766E'
const RING_SHADOW = '0 0 0 4px rgba(13,148,136,0.55), 0 0 0 9999px rgba(15,23,42,0.55)'
const SURFACE = '#FFFFFF'
const BORDER = '#E2E8F0'
const INK = '#0F172A'
const MUTED = '#64748B'
const R_LG = '16px'
const R_PILL = '999px'
const SHADOW_LG = '0 12px 32px rgba(15,23,42,0.10), 0 4px 8px rgba(15,23,42,0.04)'

export interface TourStepBase {
  title: string
  body: string
  /**
   * Var tipskortet ligger. Kortet står alltid på MOTSATT sida om det
   * spotlighten visar — annars täcker tipset sitt eget motiv (B7-fyndet).
   */
  placement: 'top' | 'bottom'
}

interface TourTargetProps {
  id: string
  highlight: boolean
  dim: number
  round?: boolean
  children: ReactNode
}

/** Wrappar en spotlight-target. Passar fasta, icke-skrollande ytor (Step6). */
export function TourTarget({ id, highlight, dim, round, children }: TourTargetProps) {
  return (
    <div
      data-tour-target={id}
      style={{
        position: 'relative',
        opacity: highlight ? 1 : dim,
        transition: 'opacity 320ms',
        zIndex: highlight ? 40 : 1,
        borderRadius: round ? '50%' : R_LG,
        boxShadow: highlight ? RING_SHADOW : 'none',
      }}
    >
      {children}
    </div>
  )
}

/**
 * Fristående highlight-ram för ett uppmätt DOMRect — för riktiga, skrollande
 * sidor där elementet redan finns i DOM:en (markerat med en egen
 * data-tour-target-attribut) och inte ska wrappas om. `rect` är null tills
 * elementet är uppmätt eller om det inte gick att hitta — då ritas inget.
 */
export function TourHighlightFrame({ rect, round }: { rect: DOMRect | null; round?: boolean }) {
  if (!rect) return null
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        borderRadius: round ? '50%' : R_LG,
        boxShadow: RING_SHADOW,
        transition: 'top 280ms, left 280ms, width 280ms, height 280ms',
        pointerEvents: 'none',
        zIndex: 40,
      }}
    />
  )
}

interface SpotlightOverlayProps<T extends TourStepBase> {
  step: T
  index: number
  total: number
  onNext: () => void
  onSkip: () => void
  /**
   * 'absolute' (default) — Step6:s fasta mock-viewport, kortet sitter
   * relativt sin förälder. 'fixed' — riktiga, skrollande sidor (Hemturen),
   * kortet sitter relativt själva fönstret oavsett skroll.
   */
  position?: 'absolute' | 'fixed'
  nextLabel?: string
}

/** Tipskortet — samma placering (top/bottom), progressdots och "Hoppa över". */
export function SpotlightOverlay<T extends TourStepBase>({
  step,
  index,
  total,
  onNext,
  onSkip,
  position = 'absolute',
  nextLabel,
}: SpotlightOverlayProps<T>) {
  const isLast = index === total - 1
  return (
    <div
      style={{
        position,
        left: 16,
        right: 16,
        ...(step.placement === 'top' ? { top: 60 } : { bottom: 24 }),
        padding: 16,
        background: SURFACE,
        borderRadius: R_LG,
        boxShadow: SHADOW_LG,
        border: `1px solid ${BORDER}`,
        zIndex: 50,
        animation: 'ob-pop-in 320ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED }}>
          {index + 1} av {total}
        </span>
        <button
          type="button"
          onClick={onSkip}
          style={{
            background: 'none',
            border: 'none',
            color: MUTED,
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Hoppa över
        </button>
      </div>
      <h3 style={{ fontSize: 17, fontWeight: 700, color: INK, marginBottom: 4 }}>{step.title}</h3>
      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, marginBottom: 14 }}>{step.body}</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 4,
                flex: 1,
                borderRadius: 2,
                background: i <= index ? TEAL : BORDER,
              }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onNext}
          style={{
            padding: '9px 18px',
            background: TEAL,
            color: '#fff',
            border: 'none',
            borderRadius: R_PILL,
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {isLast ? 'Klart' : (nextLabel ?? 'Nästa')}
        </button>
      </div>
    </div>
  )
}
