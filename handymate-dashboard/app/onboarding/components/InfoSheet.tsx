'use client'

/**
 * InfoSheet — återanvändbar bottom-sheet för förklarande information.
 *
 * Mobile-first slide-up overlay. Används för "Vad är detta?"-länkar i
 * onboarding (Step3 timdebitering, Step4 Lisas nummer, Step5 plan-fördelar).
 *
 * Design (2026-06-03 per tasks/curious-purring-porcupine.md):
 *   - Slide-up från botten, max-height 80vh
 *   - Stäng-triggers: X-knapp, click på dim-overlay, Esc-tangenten
 *   - Body-scroll-lock när öppen
 *   - Drag-handle visuellt (pill) längst upp
 *   - Återanvänder --ob-*-variabler
 */

import { useEffect } from 'react'
import { X } from 'lucide-react'

interface InfoSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export default function InfoSheet({ open, onClose, title, children }: InfoSheetProps) {
  // Stäng på Esc + body-scroll-lock vid open
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      aria-hidden={!open}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      {/* Dim overlay — klick stänger */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.45)',
          animation: 'ob-fade-in 200ms ease',
        }}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 520,
          maxHeight: '80vh',
          background: 'var(--ob-surface)',
          borderTopLeftRadius: 'var(--ob-r-2xl)',
          borderTopRightRadius: 'var(--ob-r-2xl)',
          boxShadow: 'var(--ob-sh-lg)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'ob-sheet-up 280ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* Drag-handle */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            paddingTop: 10,
            paddingBottom: 4,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 'var(--ob-r-pill)',
              background: 'var(--ob-border-strong)',
            }}
          />
        </div>

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 20px 12px',
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: 'var(--ob-ink)',
              margin: 0,
            }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Stäng"
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--ob-r-pill)',
              background: 'var(--ob-bg)',
              border: '1px solid var(--ob-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--ob-muted)',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content (scrollbart) */}
        <div
          style={{
            padding: '4px 20px 24px',
            overflowY: 'auto',
            flex: 1,
            color: 'var(--ob-ink-2)',
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          {children}
        </div>
      </div>

      <style jsx global>{`
        @keyframes ob-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes ob-sheet-up {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
