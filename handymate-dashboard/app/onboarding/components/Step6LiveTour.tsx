'use client'

import { useEffect, useState } from 'react'
import { ListChecks, Rocket, Target } from 'lucide-react'
import { TEAM } from '@/lib/agents/team'
import type { OnboardingFormData } from '../types-redesign'

interface Step6Props {
  onFinish: () => void
  data: OnboardingFormData
}

interface TourStep {
  id: 'team' | 'matte' | 'approve' | 'setup'
  title: string
  body: string
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'team',
    title: 'Här bor ditt AI-team',
    body: 'Se i realtid vad Lisa, Karin, Daniel, Lars och Hanna jobbar med.',
  },
  {
    id: 'matte',
    title: 'Här pratar du med Matte',
    body: 'Din chefsassistent. Fråga vad som helst — han har koll på allt.',
  },
  {
    id: 'approve',
    title: 'Här godkänner du beslut',
    body: 'AI-teamet jobbar autonomt — du ser bara det som behöver din input.',
  },
  {
    id: 'setup',
    title: 'Här kompletterar du setup',
    body: 'Några sista steg för att låsa upp full automation.',
  },
]

export default function Step6LiveTour({ onFinish, data }: Step6Props) {
  const [tourStep, setTourStep] = useState(-1)
  const [showToast, setShowToast] = useState(true)

  useEffect(() => {
    const t1 = setTimeout(() => setShowToast(false), 2800)
    const t2 = setTimeout(() => setTourStep(0), 1400)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  const next = () =>
    setTourStep(s => (s + 1 >= TOUR_STEPS.length ? -2 : s + 1))
  const skip = () => setTourStep(-2)
  const finished = tourStep === -2

  const highlight =
    tourStep >= 0 && tourStep < TOUR_STEPS.length
      ? TOUR_STEPS[tourStep].id
      : null

  return (
    <div className="ob-screen" style={{ background: 'var(--ob-bg)' }}>
      <MockDashboard highlight={highlight} firstName={data.contactName?.split(' ')[0] || 'där'} companyName={data.companyName || 'Test AB'} />

      {/* Confirmation toast */}
      {showToast && (
        <div
          style={{
            position: 'absolute',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 16px',
            background: 'var(--ob-ink)',
            color: '#fff',
            borderRadius: 'var(--ob-r-pill)',
            fontSize: 13,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: 'var(--ob-sh-lg)',
            animation: 'ob-pop-in 400ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            zIndex: 50,
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--ob-green-600)',
              animation: 'ob-pulse-ring 1.5s infinite',
            }}
          />
          Lisa är på linjen. Karin har koll. Du är live.
        </div>
      )}

      {/* Spotlight overlay tooltip */}
      {tourStep >= 0 && tourStep < TOUR_STEPS.length && (
        <SpotlightOverlay
          step={TOUR_STEPS[tourStep]}
          index={tourStep}
          total={TOUR_STEPS.length}
          onNext={next}
          onSkip={skip}
        />
      )}

      {/* Final CTA */}
      {finished && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: 20,
            background: 'linear-gradient(180deg, transparent, var(--ob-bg) 30%)',
            animation: 'ob-fade-in 400ms',
          }}
        >
          <button type="button" className="ob-cta" onClick={onFinish}>
            Kör igång <Rocket size={18} />
          </button>
        </div>
      )}
    </div>
  )
}

interface MockDashboardProps {
  highlight: string | null
  firstName: string
  companyName: string
}

function MockDashboard({ highlight, firstName, companyName }: MockDashboardProps) {
  const dim = highlight ? 0.4 : 1
  const lit = (id: string) => highlight === id

  const teamRow = TEAM.filter(a => a.id !== 'matte').map(a => ({
    id: a.id,
    name: a.name,
    avatar: a.avatar || '',
    color:
      a.id === 'lisa'
        ? 'var(--ob-sky-500)'
        : a.id === 'karin'
        ? 'var(--ob-blue-600)'
        : a.id === 'daniel'
        ? 'var(--ob-amber-600)'
        : a.id === 'lars'
        ? 'var(--ob-emerald-600)'
        : 'var(--ob-purple-600)',
  }))

  const matte = TEAM.find(a => a.id === 'matte')

  return (
    <div style={{ height: '100%', overflow: 'hidden', position: 'relative' }}>
      {/* Top bar */}
      <div
        style={{
          padding: '14px 16px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--ob-surface)',
          borderBottom: '1px solid var(--ob-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'var(--ob-primary-700)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            H
          </div>
          <strong style={{ fontSize: 14 }}>{companyName}</strong>
        </div>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'var(--ob-primary-50)',
            backgroundImage: matte?.avatar ? `url(${matte.avatar})` : undefined,
            backgroundSize: 'cover',
          }}
        />
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
            Hej, {firstName}!
          </h2>
          <p style={{ fontSize: 12, color: 'var(--ob-muted)', marginTop: 2 }}>
            AI-teamet är på plats
          </p>
        </div>

        {/* Team strip — TOUR TARGET 1 */}
        <TourTarget id="team" highlight={lit('team')} dim={dim}>
          <div
            style={{
              padding: 14,
              background: 'var(--ob-surface)',
              border: '1px solid var(--ob-border)',
              borderRadius: 'var(--ob-r-lg)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <strong style={{ fontSize: 13 }}>Ditt AI-team idag</strong>
              <span style={{ fontSize: 10, color: 'var(--ob-muted)' }}>5 aktiva</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {teamRow.map(a => (
                <div
                  key={a.id}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <div style={{ position: 'relative' }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        backgroundImage: a.avatar ? `url(${a.avatar})` : undefined,
                        backgroundColor: 'var(--ob-primary-50)',
                        backgroundSize: 'cover',
                        border: `1.5px solid ${a.color}`,
                      }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        bottom: -1,
                        right: -1,
                        width: 10,
                        height: 10,
                        background: 'var(--ob-green-600)',
                        border: '2px solid var(--ob-surface)',
                        borderRadius: '50%',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--ob-ink-2)',
                      fontWeight: 500,
                    }}
                  >
                    {a.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </TourTarget>

        {/* Stats */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginTop: 12,
            opacity: dim,
            transition: 'opacity 300ms',
          }}
        >
          {[
            ['Bokningar', '0', 'denna vecka'],
            ['Samtal', '0', 'idag'],
            ['Arbetad tid', '0h', 'denna mån'],
            ['Projekt', '0', 'aktiva'],
          ].map((s, i) => (
            <div
              key={i}
              style={{
                padding: 12,
                background: 'var(--ob-surface)',
                border: '1px solid var(--ob-border)',
                borderRadius: 'var(--ob-r-md)',
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: 'var(--ob-muted)',
                  textTransform: 'uppercase',
                }}
              >
                {s[0]}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{s[1]}</div>
              <div style={{ fontSize: 10, color: 'var(--ob-muted)' }}>{s[2]}</div>
            </div>
          ))}
        </div>

        {/* Approvals — TOUR TARGET 3 */}
        <div style={{ marginTop: 12 }}>
          <TourTarget id="approve" highlight={lit('approve')} dim={dim}>
            <div
              style={{
                padding: 14,
                background: 'var(--ob-surface)',
                border: '1px solid var(--ob-border)',
                borderRadius: 'var(--ob-r-lg)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <ListChecks size={16} />
                <strong style={{ fontSize: 13 }}>Godkännanden</strong>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 8px',
                    background: 'var(--ob-primary-50)',
                    color: 'var(--ob-primary-700)',
                    borderRadius: 'var(--ob-r-pill)',
                  }}
                >
                  Inga än
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ob-muted)' }}>
                Daniel, Karin och Lars frågar dig här när de behöver ditt godkännande
              </div>
            </div>
          </TourTarget>
        </div>

        {/* Setup checklist — TOUR TARGET 4 */}
        <div style={{ marginTop: 12 }}>
          <TourTarget id="setup" highlight={lit('setup')} dim={dim}>
            <div
              style={{
                padding: 14,
                background:
                  'linear-gradient(135deg, var(--ob-primary-50), var(--ob-surface))',
                border: '1px solid var(--ob-primary-100)',
                borderRadius: 'var(--ob-r-lg)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <Target size={16} />
                <strong style={{ fontSize: 13, color: 'var(--ob-primary-700)' }}>
                  Komplettera setup
                </strong>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 10,
                    color: 'var(--ob-muted)',
                  }}
                >
                  2/5 klart
                </span>
              </div>
              <div
                style={{
                  height: 4,
                  background: 'var(--ob-primary-100)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <div style={{ width: '40%', height: '100%', background: 'var(--ob-primary-700)' }} />
              </div>
            </div>
          </TourTarget>
        </div>
      </div>

      {/* Floating Matte button — TOUR TARGET 2 */}
      <div style={{ position: 'absolute', bottom: 16, right: 16 }}>
        <TourTarget id="matte" highlight={lit('matte')} dim={dim} round>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              backgroundImage: matte?.avatar ? `url(${matte.avatar})` : undefined,
              backgroundColor: 'var(--ob-primary-700)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              border: '3px solid var(--ob-surface)',
              boxShadow: 'var(--ob-sh-lg)',
            }}
          />
        </TourTarget>
      </div>
    </div>
  )
}

interface TourTargetProps {
  id: string
  highlight: boolean
  dim: number
  round?: boolean
  children: React.ReactNode
}

function TourTarget({ id, highlight, dim, round, children }: TourTargetProps) {
  return (
    <div
      data-tour-target={id}
      style={{
        position: 'relative',
        opacity: highlight ? 1 : dim,
        transition: 'opacity 320ms',
        zIndex: highlight ? 40 : 1,
        borderRadius: round ? '50%' : 'var(--ob-r-lg)',
        boxShadow: highlight
          ? '0 0 0 4px rgba(13,148,136,0.5), 0 0 0 9999px rgba(15,23,42,0.55)'
          : 'none',
        animation: highlight ? 'ob-pulse-ring 1.8s infinite' : 'none',
      }}
    >
      {children}
    </div>
  )
}

interface SpotlightOverlayProps {
  step: TourStep
  index: number
  total: number
  onNext: () => void
  onSkip: () => void
}

function SpotlightOverlay({ step, index, total, onNext, onSkip }: SpotlightOverlayProps) {
  const isLast = index === total - 1
  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 24,
        padding: 16,
        background: 'var(--ob-surface)',
        borderRadius: 'var(--ob-r-lg)',
        boxShadow: 'var(--ob-sh-lg)',
        border: '1px solid var(--ob-border)',
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
        <span className="ob-eyebrow">
          {index + 1} av {total}
        </span>
        <button
          type="button"
          onClick={onSkip}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--ob-muted)',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Hoppa över
        </button>
      </div>
      <h3
        style={{
          fontSize: 17,
          fontWeight: 700,
          color: 'var(--ob-ink)',
          marginBottom: 4,
        }}
      >
        {step.title}
      </h3>
      <p
        style={{
          fontSize: 13,
          color: 'var(--ob-muted)',
          lineHeight: 1.5,
          marginBottom: 14,
        }}
      >
        {step.body}
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 4,
                flex: 1,
                borderRadius: 2,
                background: i <= index ? 'var(--ob-primary-700)' : 'var(--ob-border)',
              }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onNext}
          style={{
            padding: '8px 16px',
            background: 'var(--ob-primary-700)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--ob-r-pill)',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {isLast ? 'Klart' : 'Nästa'}
        </button>
      </div>
    </div>
  )
}
