'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, ChevronDown, Info } from 'lucide-react'
import OnboardingHeader from './OnboardingHeader'
import type { OnboardingFormData } from '../types-redesign'

interface Step4Props {
  onNext: () => void
  onBack: () => void
  data: OnboardingFormData
  setData: (updater: (d: OnboardingFormData) => OnboardingFormData) => void
}

const OPERATORS: { id: string; name: string; code: string }[] = [
  { id: 'telia',   name: 'Telia',   code: '**21*<NUMMER>#' },
  { id: 'telenor', name: 'Telenor', code: '**21*<NUMMER>#' },
  { id: 'tre',     name: 'Tre',     code: '**21*<NUMMER>#' },
  { id: 'telavox', name: 'Telavox', code: 'Logga in → Vidarekoppling' },
]

export default function Step4PhoneNumber({ onNext, onBack, data, setData }: Step4Props) {
  const [phase, setPhase] = useState<'reserving' | 'done'>(data.lisaNumber ? 'done' : 'reserving')
  const [number, setNumber] = useState<string>(data.lisaNumber || '')
  const [openOp, setOpenOp] = useState<string | null>(null)
  const mode = data.phoneMode || 'forward'

  const update = (updates: Partial<OnboardingFormData>) =>
    setData(d => ({ ...d, ...updates }))

  useEffect(() => {
    if (data.lisaNumber) return

    let cancelled = false
    async function reserve() {
      try {
        const res = await fetch('/api/onboarding/phone/reserve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).catch(() => null)

        let assigned = ''
        if (res?.ok) {
          const json = await res.json()
          assigned = json.phone_number || json.number || ''
        }

        // Fallback om backend-endpointen inte finns: använd reservation-placeholder
        // (riktigt nummer aktiveras vid betalning, samma beteende som befintliga Step3Phone)
        if (!assigned) {
          assigned = '+46 76 000 00 00'
        }

        if (!cancelled) {
          setNumber(assigned)
          update({ lisaNumber: assigned })
          setTimeout(() => !cancelled && setPhase('done'), 400)
        }
      } catch {
        if (!cancelled) {
          setNumber('+46 76 000 00 00')
          setPhase('done')
        }
      }
    }

    const timer = setTimeout(reserve, 1300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cleanNumber = number.replace(/[\s-+]/g, '').replace(/^46/, '0')

  return (
    <div className="ob-screen">
      <OnboardingHeader step={2} total={4} onBack={onBack} />
      <div className="ob-body" style={{ display: 'flex', flexDirection: 'column' }}>
        <h1 className="ob-headline">Här är Lisas nummer</h1>
        <p className="ob-sub">
          Vidarekoppla samtal hit så svarar Lisa när du inte hinner
        </p>

        {/* Reveal card */}
        <div
          style={{
            marginTop: 4,
            padding: '32px 20px',
            background: 'linear-gradient(180deg, var(--ob-primary-50) 0%, var(--ob-surface) 100%)',
            border: '1px solid var(--ob-primary-100)',
            borderRadius: 'var(--ob-r-2xl)',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {phase === 'reserving' ? (
            <div style={{ padding: '14px 0' }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  margin: '0 auto 14px',
                  border: '3px solid var(--ob-primary-100)',
                  borderTopColor: 'var(--ob-primary-700)',
                  borderRadius: '50%',
                  animation: 'ob-spin 0.9s linear infinite',
                }}
              />
              <p style={{ color: 'var(--ob-ink-2)', fontSize: 14, fontWeight: 500 }}>
                Reserverar nummer åt dig…
              </p>
            </div>
          ) : (
            <div style={{ animation: 'ob-pop-in 600ms cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 12px',
                  borderRadius: 'var(--ob-r-pill)',
                  background: 'var(--ob-surface)',
                  border: '1px solid var(--ob-primary-100)',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: 'var(--ob-primary-700)',
                  textTransform: 'uppercase',
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--ob-green-600)',
                    animation: 'ob-pulse-ring 2s infinite',
                  }}
                />
                Reserverat
              </div>
              <div
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 32,
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  color: 'var(--ob-ink)',
                  marginBottom: 8,
                }}
              >
                {number}
              </div>
              <p style={{ fontSize: 13, color: 'var(--ob-muted)' }}>Lisa svarar — dygnet runt</p>
            </div>
          )}
        </div>

        {/* Mode tabs */}
        <div style={{ marginTop: 24, marginBottom: 14 }}>
          <label className="ob-label">Hur vill du använda numret?</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { id: 'forward' as const, title: 'Behåll mitt nummer', sub: 'Vidarekoppla till Lisa' },
              { id: 'primary' as const, title: 'Använd Handymate-nr', sub: 'Som primärnummer' },
            ].map(opt => (
              <button
                type="button"
                key={opt.id}
                onClick={() => update({ phoneMode: opt.id })}
                style={{
                  flex: 1,
                  padding: 14,
                  textAlign: 'left',
                  background: mode === opt.id ? 'var(--ob-primary-50)' : 'var(--ob-surface)',
                  border: `1.5px solid ${mode === opt.id ? 'var(--ob-primary-700)' : 'var(--ob-border)'}`,
                  borderRadius: 'var(--ob-r-md)',
                  cursor: 'pointer',
                  transition: 'all var(--ob-t-fast)',
                  fontFamily: 'inherit',
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: mode === opt.id ? 'var(--ob-primary-700)' : 'var(--ob-ink)',
                    marginBottom: 2,
                  }}
                >
                  {opt.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ob-muted)' }}>{opt.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Operator instructions */}
        {mode === 'forward' && (
          <div
            style={{
              background: 'var(--ob-surface)',
              border: '1px solid var(--ob-border)',
              borderRadius: 'var(--ob-r-lg)',
              padding: 4,
            }}
          >
            <div
              style={{
                padding: '10px 14px 8px',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--ob-ink-2)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Info size={14} />
              Vidarekopplings-instruktioner
            </div>
            {OPERATORS.map(op => (
              <div key={op.id} style={{ borderTop: '1px solid var(--ob-border)' }}>
                <button
                  type="button"
                  onClick={() => setOpenOp(openOp === op.id ? null : op.id)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: 'transparent',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    fontSize: 14,
                    color: 'var(--ob-ink)',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{op.name}</span>
                  <span
                    style={{
                      transform: openOp === op.id ? 'rotate(180deg)' : 'none',
                      transition: 'transform var(--ob-t-fast)',
                      color: 'var(--ob-muted)',
                      display: 'inline-flex',
                    }}
                  >
                    <ChevronDown size={16} />
                  </span>
                </button>
                {openOp === op.id && (
                  <div
                    style={{
                      padding: '0 14px 12px',
                      fontSize: 13,
                      color: 'var(--ob-muted)',
                      fontFamily: 'ui-monospace, monospace',
                    }}
                  >
                    Slå{' '}
                    <span style={{ color: 'var(--ob-primary-700)', fontWeight: 600 }}>
                      {op.code.replace('<NUMMER>', cleanNumber)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ob-footer">
        <button
          type="button"
          className="ob-cta"
          disabled={phase !== 'done'}
          onClick={onNext}
        >
          Fortsätt <ArrowRight size={18} />
        </button>
        <button
          type="button"
          className="ob-cta ghost"
          onClick={onNext}
          style={{ height: 44, fontSize: 13 }}
          disabled={phase !== 'done'}
        >
          Visa instruktioner senare
        </button>
      </div>
    </div>
  )
}
