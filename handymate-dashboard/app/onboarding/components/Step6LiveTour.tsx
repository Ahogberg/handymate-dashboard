'use client'

/**
 * Step6LiveTour — Payoff / "AI-teamet jobbar redan" (sista onboarding-steget).
 *
 * Det emotionella toppläget som säljer priset: kunden har precis kopplat sin
 * verksamhet och ser att AI-teamet redan jobbar på deras RIKTIGA data. En
 * förhandsvisning av produktens dashboard (så kunden känner igen sig) med en
 * kort guidad tur (spotlight på team, Matte-knappen, godkännanden, setup).
 *
 * ALL LOGIK: tour-state-maskinen (tourStep, showToast, timers), data-fetchen
 * mot /api/onboarding/instant-value (blockerar ALDRIG finish), next/skip/
 * finished-logiken, highlight-härledningen och onFinish. Det VISUELLA lagret är
 * förfinat i linje med StepImportData + obi-/--ob--systemet (payoff-hero,
 * team-strip, stat-tiles, agent-rader) — allt inline mot befintliga --ob-*-tokens.
 *
 * Beroenden: lucide-react, @/lib/agents/team.
 */

import { useEffect, useState } from 'react'
import { ListChecks, Rocket, Target, Crown } from 'lucide-react'
import { TEAM, getAgentById } from '@/lib/agents/team'
import { TourTarget, SpotlightOverlay, type TourStepBase } from '@/components/tour/TourPrimitives'
import type { OnboardingFormData } from '../types-redesign'

interface Step6Props {
  onFinish: () => void
  data: OnboardingFormData
}

/** Payoff-data från /api/onboarding/instant-value (deterministisk, ur importen). */
interface InstantValue {
  overdue_count: number
  overdue_sum_kr: number
  unpaid_count: number
  unpaid_sum_kr: number
  customer_count: number
  open_deals_count: number
  open_deals_value_kr: number
  headline: {
    agent: string
    text: string
    amount_kr?: number
    count?: number
  }
}

/**
 * Stopptexterna refererade tidigare ytnamn som inte längre finns på riktiga
 * startsidan (2026-08-13, docs/design/FORSTA-30-MINUTERNA.md) — "Här
 * godkänner du beslut" pekade på en "Godkännanden"-etikett som blivit "Det
 * här behöver dig idag", och setup-checklistan finns inte kvar där. Texterna
 * är nu skrivna mot de RIKTIGA rubrikerna Hemturen (components/tour/HemTur.tsx)
 * visar strax efter — samma språk, så förhandsvisningen känns som en
 * fortsättning, inte en repris.
 */
interface TourStep extends TourStepBase {
  id: 'team' | 'matte' | 'approve' | 'setup'
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'team',
    title: 'Det här sköter teamet',
    body: 'Se i realtid vad Lisa, Karin, Daniel, Lars och Hanna jobbar med — du behöver inte fråga.',
    placement: 'bottom',
  },
  {
    id: 'matte',
    title: 'Här pratar du med Matte',
    body: 'Din chefsassistent. Fråga vad som helst — han har koll på allt.',
    placement: 'top',
  },
  {
    id: 'approve',
    title: 'Det här behöver dig idag',
    body: 'Allt teamet vill göra hamnar här. Inget går ut utan ditt ja.',
    placement: 'top',
  },
  {
    id: 'setup',
    title: 'Kom igång-uppdragen',
    body: 'På startsidan väntar tre korta uppdrag i stället för en lång checklista.',
    placement: 'top',
  },
]

export default function Step6LiveTour({ onFinish, data }: Step6Props) {
  const [tourStep, setTourStep] = useState(-1)
  const [showToast, setShowToast] = useState(true)
  // Payoff-data: null = laddar (neutral placeholder), sedan värden eller fallback.
  const [instant, setInstant] = useState<InstantValue | null>(null)

  useEffect(() => {
    const t1 = setTimeout(() => setShowToast(false), 2800)
    const t2 = setTimeout(() => setTourStep(s => (s === -1 ? 0 : s)), 1400)
    // Säkerhetsnät (B7-fyndet): hänger tour-statet av någon anledning kvar
    // på -1 fanns INGENTING klickbart — och inloggningen studsar tillbaka
    // hit tills onboardingen är slutförd. Evighetsloop. Efter 5 s tvingas
    // touren till avslutat läge så Kör igång alltid går att nå.
    const t3 = setTimeout(() => setTourStep(s => (s === -1 ? -2 : s)), 5000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [])

  // Hämta kundens RIKTIGA första värde ur importen (deterministiskt, ej cron).
  // Blockerar ALDRIG finish-knappen — vid fel/tomt faller vi tillbaka på
  // vänlig generisk tour (aldrig en trasig/tom skärm).
  useEffect(() => {
    let cancelled = false
    fetch('/api/onboarding/instant-value')
      .then(res => (res.ok ? res.json() : null))
      .then((json: InstantValue | null) => {
        if (!cancelled && json && json.headline) setInstant(json)
      })
      .catch(() => {
        /* tyst: touren fungerar utan payoff-data */
      })
    return () => {
      cancelled = true
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
      <MockDashboard
        highlight={highlight}
        firstName={data.contactName?.split(' ')[0] ?? 'där'}
        companyName={data.companyName ?? 'Test AB'}
        instant={instant}
      />

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

      {/* Ständig utväg — touren ska aldrig kunna hålla någon fången. Diskret
          uppe till höger under hela turen; försvinner när stora CTA:n tar över. */}
      {!finished && (
        <button
          type="button"
          onClick={skip}
          style={{
            position: 'absolute',
            top: 14,
            right: 16,
            zIndex: 60,
            background: 'var(--ob-surface)',
            border: '1px solid var(--ob-border)',
            borderRadius: 'var(--ob-r-pill)',
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ob-muted)',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Hoppa till start →
        </button>
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
          <p
            style={{
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--ob-muted)',
              marginBottom: 10,
            }}
          >
            Nu visar vi dig runt på riktigt.
          </p>
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
  instant: InstantValue | null
}

function MockDashboard({ highlight, firstName, companyName, instant }: MockDashboardProps) {
  const dim = highlight ? 0.4 : 1
  const lit = (id: string) => highlight === id

  // Realdata från importen — visa endast ÄRLIGA siffror. Vid tomt/skip
  // faller värdena tillbaka på 0/generisk copy (aldrig fabricerat).
  const nf = (n: number) => n.toLocaleString('sv-SE')
  const unpaidCount = instant?.unpaid_count ?? 0
  const customerCount = instant?.customer_count ?? 0
  const openDealsCount = instant?.open_deals_count ?? 0

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
  const karinAvatar = teamRow.find(a => a.id === 'karin')?.avatar

  return (
    <div style={{ height: '100%', overflowY: 'auto', position: 'relative' }}>
      {/* Top bar */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 3,
          padding: '14px 16px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--ob-surface)',
          borderBottom: '1px solid var(--ob-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
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
          <strong style={{ fontSize: 14, color: 'var(--ob-ink)' }}>{companyName}</strong>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--ob-green-600)',
            background: 'var(--ob-green-50)',
            padding: '5px 10px',
            borderRadius: 'var(--ob-r-pill)',
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ob-green-600)' }} />
          Live
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {/* Greeting */}
        <div style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ob-ink)' }}>
            Hej, {firstName}!
          </h2>
          <p
            style={{
              fontSize: 12.5,
              color: 'var(--ob-muted)',
              marginTop: 3,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ob-green-600)' }} />
            AI-teamet är på plats
          </p>
        </div>

        {/* HERO payoff — Karins krona-fynd ur importen. Laddar/tomt/skip →
            varm placeholder (aldrig en trasig/tom yta). */}
        <PayoffHero instant={instant} nf={nf} fallbackAvatar={karinAvatar} />

        {/* Team strip — TOUR TARGET 1 */}
        <TourTarget id="team" highlight={lit('team')} dim={dim}>
          <div
            style={{
              padding: 14,
              background: 'var(--ob-surface)',
              border: '1px solid var(--ob-border)',
              borderRadius: 'var(--ob-r-lg)',
              boxShadow: 'var(--ob-sh-sm)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <strong style={{ fontSize: 13, color: 'var(--ob-ink)' }}>Ditt AI-team idag</strong>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--ob-green-600)',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ob-green-600)' }} />
                5 aktiva
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {teamRow.map(a => (
                <div
                  key={a.id}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
                >
                  <div style={{ position: 'relative' }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        backgroundImage: a.avatar ? `url(${a.avatar})` : undefined,
                        backgroundColor: 'var(--ob-primary-50)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        border: `1.5px solid ${a.color}`,
                      }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        bottom: -1,
                        right: -1,
                        width: 11,
                        height: 11,
                        background: 'var(--ob-green-600)',
                        border: '2px solid var(--ob-surface)',
                        borderRadius: '50%',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--ob-ink-2)', fontWeight: 600 }}>{a.name}</span>
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
            ['Kunder', nf(customerCount), 'importerade', false],
            ['Obetalda', nf(unpaidCount), 'fakturor', false],
            ['Öppna affärer', nf(openDealsCount), 'att följa upp', false],
            ['AI-kollegor', '5', 'aktiva', true],
          ].map((s, i) => {
            const hero = s[3] as boolean
            return (
              <div
                key={i}
                style={{
                  padding: 13,
                  background: hero ? 'var(--ob-primary-50)' : 'var(--ob-surface)',
                  border: `1px solid ${hero ? 'var(--ob-primary-100)' : 'var(--ob-border)'}`,
                  borderRadius: 'var(--ob-r-md)',
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    color: hero ? 'var(--ob-primary-700)' : 'var(--ob-muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  {s[0]}
                </div>
                <div
                  style={{
                    fontSize: 23,
                    fontWeight: 800,
                    marginTop: 3,
                    letterSpacing: '-0.02em',
                    color: hero ? 'var(--ob-primary-700)' : 'var(--ob-ink)',
                  }}
                >
                  {s[1]}
                </div>
                <div style={{ fontSize: 10, color: 'var(--ob-muted)', marginTop: 1 }}>{s[2]}</div>
              </div>
            )
          })}
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
                boxShadow: 'var(--ob-sh-sm)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ color: 'var(--ob-primary-700)' }}>
                  <ListChecks size={16} />
                </span>
                <strong style={{ fontSize: 13, color: 'var(--ob-ink)' }}>Godkännanden</strong>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '3px 9px',
                    background: unpaidCount > 0 ? 'var(--ob-primary-700)' : 'var(--ob-primary-50)',
                    color: unpaidCount > 0 ? '#fff' : 'var(--ob-primary-700)',
                    borderRadius: 'var(--ob-r-pill)',
                  }}
                >
                  {unpaidCount > 0 ? `${nf(unpaidCount)} att jaga` : 'Inga än'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    flexShrink: 0,
                    borderRadius: '50%',
                    backgroundImage: karinAvatar ? `url(${karinAvatar})` : undefined,
                    backgroundColor: 'var(--ob-primary-50)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    border: '1.5px solid var(--ob-blue-600)',
                  }}
                />
                <div style={{ fontSize: 12, color: 'var(--ob-ink-2)', lineHeight: 1.4 }}>
                  {unpaidCount > 0 ? (
                    <>
                      <b style={{ color: 'var(--ob-ink)' }}>Karin</b> har {nf(unpaidCount)} obetalda fakturor
                      redo att följa upp — du godkänner påminnelserna här
                    </>
                  ) : (
                    <>
                      <b style={{ color: 'var(--ob-ink)' }}>Karin, Daniel och Lars</b> frågar dig här när de
                      behöver ditt godkännande
                    </>
                  )}
                </div>
              </div>
            </div>
          </TourTarget>
        </div>

        {/* Setup checklist — TOUR TARGET 4 */}
        <div style={{ marginTop: 12, marginBottom: 8 }}>
          <TourTarget id="setup" highlight={lit('setup')} dim={dim}>
            <div
              style={{
                padding: 14,
                background: 'linear-gradient(135deg, var(--ob-primary-50), var(--ob-surface))',
                border: '1px solid var(--ob-primary-100)',
                borderRadius: 'var(--ob-r-lg)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ color: 'var(--ob-primary-700)' }}>
                  <Target size={16} />
                </span>
                <strong style={{ fontSize: 13, color: 'var(--ob-primary-700)' }}>Komplettera setup</strong>
                <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, color: 'var(--ob-muted)' }}>
                  2/5 klart
                </span>
              </div>
              <div style={{ height: 5, background: 'var(--ob-primary-100)', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    width: '40%',
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--ob-primary-600), var(--ob-primary-500))',
                    borderRadius: 3,
                  }}
                />
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
              width: 58,
              height: 58,
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

/* Payoff-hero: hjälten. Fyllt teal-kort med Karins fynd; tomt/laddar → varmt. */
function PayoffHero({
  instant,
  nf,
  fallbackAvatar,
}: {
  instant: InstantValue | null
  nf: (n: number) => string
  fallbackAvatar?: string
}) {
  if (!instant) {
    return (
      <div
        style={{
          marginBottom: 14,
          padding: 16,
          borderRadius: 'var(--ob-r-lg)',
          background: 'linear-gradient(135deg, var(--ob-primary-50), var(--ob-surface))',
          border: '1px solid var(--ob-primary-100)',
          display: 'flex',
          alignItems: 'center',
          gap: 13,
          minHeight: 62,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            flexShrink: 0,
            borderRadius: '50%',
            backgroundImage: fallbackAvatar ? `url(${fallbackAvatar})` : undefined,
            backgroundColor: 'var(--ob-primary-50)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            border: '2px solid var(--ob-surface)',
            boxShadow: '0 0 0 1px var(--ob-primary-100)',
          }}
        />
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ob-ink)' }}>Ditt AI-team är redo</div>
          <div style={{ fontSize: 12.5, color: 'var(--ob-muted)', marginTop: 2, lineHeight: 1.4 }}>
            Koppla din verksamhet när du vill — då börjar de jobba på dina riktiga siffror.
          </div>
        </div>
      </div>
    )
  }

  const h = instant.headline
  const agent = getAgentById(h.agent) ?? getAgentById('karin')
  return (
    <div
      style={{
        marginBottom: 14,
        padding: 16,
        borderRadius: 'var(--ob-r-lg)',
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)',
        boxShadow: '0 10px 28px rgba(13,148,136,0.32)',
      }}
    >
      <div style={{ position: 'absolute', top: -14, right: -10, opacity: 0.16, color: '#fff' }}>
        <Crown size={92} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            backgroundImage: agent?.avatar ? `url(${agent.avatar})` : undefined,
            backgroundColor: 'rgba(255,255,255,0.2)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            border: '2px solid rgba(255,255,255,0.9)',
          }}
        />
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.9)',
          }}
        >
          Ditt AI-team har redan börjat
        </span>
      </div>
      <div
        style={{
          fontSize: 19,
          fontWeight: 700,
          color: '#fff',
          lineHeight: 1.28,
          letterSpacing: '-0.01em',
          position: 'relative',
        }}
      >
        {h.text}
      </div>
      {typeof h.amount_kr === 'number' && h.amount_kr > 0 && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 12,
            padding: '6px 12px',
            borderRadius: 'var(--ob-r-pill)',
            background: 'rgba(255,255,255,0.16)',
            color: '#fff',
            fontSize: 12.5,
            fontWeight: 700,
          }}
        >
          <Target size={13} /> {nf(h.amount_kr)} kr att driva in
        </div>
      )}
    </div>
  )
}
