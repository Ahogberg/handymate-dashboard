'use client'

import { ArrowLeft } from 'lucide-react'

interface HeaderProps {
  step?: number
  total?: number
  onBack?: (() => void) | null
  onSkip?: (() => void) | null
  hideProgress?: boolean
}

/**
 * Återanvändbar onboarding-header: bakåt-knapp + progress-prickar + skip.
 * Per Claude Designs spec — fyra prickar för fyra interaktiva steg
 * (Step 1 är passivt välkomstskärm utan progress).
 */
export default function OnboardingHeader({
  step = 0,
  total = 4,
  onBack,
  onSkip,
  hideProgress = false,
}: HeaderProps) {
  return (
    <div className="ob-header">
      <button
        type="button"
        className="ob-back"
        onClick={onBack || undefined}
        disabled={!onBack}
        aria-label="Tillbaka"
      >
        <ArrowLeft size={18} />
      </button>
      {!hideProgress && (
        <div className="ob-progress">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className={`ob-progress-dot ${i === step ? 'active' : i < step ? 'done' : ''}`}
            />
          ))}
        </div>
      )}
      {hideProgress && <div style={{ flex: 1 }} />}
      {onSkip ? (
        <button type="button" className="ob-skip" onClick={onSkip}>
          Hoppa över
        </button>
      ) : (
        <div style={{ width: 36 }} />
      )}
    </div>
  )
}
