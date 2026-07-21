'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, ChevronDown, Info } from 'lucide-react'
import OnboardingHeader from './OnboardingHeader'
import InfoSheet from './InfoSheet'
import { TEAM } from '@/lib/agents/team'
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

// Historisk platshållare som äldre onboarding-sessioner kan ha persisterat i
// lisaNumber — behandlas som "inget nummer" (den fick ALDRIG visas som
// användarens riktiga nummer, men gjorde det i prod när nummerköpet misslyckades).
const LEGACY_PLACEHOLDER = '+46 76 000 00 00'

interface TestCallStatus {
  armed?: boolean
  called_at?: string | null
  sms_sent?: boolean
  sms_error?: string | null
  lead_id?: string | null
}

/** "Testa Lisa nu" — live-checklista som lyser upp medan användaren ringer sitt nya nummer. */
function TestLisaCard() {
  const [visible, setVisible] = useState(true)
  const [armed, setArmed] = useState(false)
  const [status, setStatus] = useState<TestCallStatus>({})
  const [timedOut, setTimedOut] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [armAttempt, setArmAttempt] = useState(0)

  const success = !!(status.called_at && status.sms_sent && status.lead_id)
  // Sluta polla när samtalet är fångat och SMS-utfallet (skickat eller fel) är känt.
  const finished = !!(status.called_at && status.lead_id && (status.sms_sent || status.sms_error))

  // Armera test-läget vid mount (och vid "Prova igen").
  useEffect(() => {
    let active = true
    async function arm() {
      try {
        const res = await fetch('/api/onboarding/test-call/arm', { method: 'POST' })
        if (!active) return
        if (!res.ok) { setVisible(false); return }
        const json = await res.json()
        if (!active) return
        if (!json.available) { setVisible(false); return }
        setArmed(true)
      } catch {
        if (active) setVisible(false)
      }
    }
    arm()
    return () => { active = false }
  }, [armAttempt])

  // Polla status varannan sekund medan testet är armerat.
  useEffect(() => {
    if (!armed || finished) return
    let active = true
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/onboarding/test-call/status')
        if (!res.ok || !active) return
        const json: TestCallStatus = await res.json()
        if (!active) return
        setStatus(json)
      } catch {
        // nätverksglapp — försök igen vid nästa tick
      }
    }, 2000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [armed, finished])

  // 90 sekunder utan upptäckt samtal → visa tips (t.ex. dolt nummer).
  useEffect(() => {
    if (!armed || status.called_at) return
    const timer = setTimeout(() => setTimedOut(true), 90_000)
    return () => clearTimeout(timer)
  }, [armed, status.called_at, armAttempt])

  const retry = () => {
    setTimedOut(false)
    setArmAttempt(a => a + 1)
  }

  const removeTestLead = async () => {
    if (!confirm('Ta bort test-leadet?')) return
    setDeleting(true)
    try {
      const res = await fetch('/api/onboarding/test-call/lead', { method: 'DELETE' })
      if (res.ok) setDeleted(true)
    } catch {
      // behåll knappen så användaren kan försöka igen
    } finally {
      setDeleting(false)
    }
  }

  if (!visible) return null

  const rows: { icon: string; label: string; lit: boolean }[] = [
    { icon: '📞', label: 'Samtal upptäckt', lit: !!status.called_at },
    { icon: '💬', label: 'SMS skickat — kolla din telefon', lit: !!status.sms_sent },
    { icon: '✅', label: 'Lead fångat', lit: !!status.lead_id },
  ]

  return (
    <div
      style={{
        marginTop: 14,
        padding: '18px 16px',
        background: 'var(--ob-surface)',
        border: '1px solid var(--ob-primary-100)',
        borderRadius: 'var(--ob-r-lg)',
        animation: 'ob-pop-in 400ms ease-out',
      }}
    >
      {success ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ob-ink)', lineHeight: 1.45 }}>
            Det där var Lisa. Precis så snabbt möter hon dina kunder.
            Nu aktiverar vi henne på riktigt.
          </div>
          {deleted ? (
            <p style={{ marginTop: 10, fontSize: 12, color: 'var(--ob-muted)' }}>Borttaget ✓</p>
          ) : (
            <button
              type="button"
              onClick={removeTestLead}
              disabled={deleting}
              style={{
                marginTop: 10,
                padding: '6px 12px',
                background: 'transparent',
                border: 0,
                color: 'var(--ob-muted)',
                fontSize: 12,
                fontWeight: 600,
                cursor: deleting ? 'default' : 'pointer',
                textDecoration: 'underline',
                opacity: deleting ? 0.5 : 1,
                fontFamily: 'inherit',
              }}
            >
              {deleting ? 'Tar bort…' : 'Ta bort testet'}
            </button>
          )}
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--ob-primary-700)',
              marginBottom: 6,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--ob-green-600)',
                animation: 'ob-pulse-ring 2s infinite',
                flexShrink: 0,
              }}
            />
            Testa Lisa nu
          </div>
          <p style={{ fontSize: 13, color: 'var(--ob-ink-2)', margin: '0 0 12px' }}>
            Ring numret nu från din mobil — och håll telefonen redo.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map(row => (
              <div
                key={row.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 13,
                  fontWeight: row.lit ? 600 : 500,
                  color: row.lit ? 'var(--ob-ink)' : 'var(--ob-muted)',
                  opacity: row.lit ? 1 : 0.55,
                  transition: 'all var(--ob-t-fast)',
                }}
              >
                <span style={{ fontSize: 15, filter: row.lit ? 'none' : 'grayscale(1)' }}>
                  {row.icon}
                </span>
                {row.label}
              </div>
            ))}
          </div>

          {status.sms_error && (
            <p style={{ fontSize: 12, color: 'var(--ob-ink-2)', margin: '10px 0 0' }}>
              Samtalet fångades, men SMS:et kunde inte skickas just nu.
            </p>
          )}

          {timedOut && !status.called_at && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 12px',
                background: 'var(--ob-primary-50)',
                borderRadius: 'var(--ob-r-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 12, color: 'var(--ob-ink-2)' }}>
                Ringde du med dolt nummer? Prova igen.
              </span>
              <button
                type="button"
                onClick={retry}
                style={{
                  padding: '6px 12px',
                  background: 'var(--ob-surface)',
                  border: '1px solid var(--ob-primary-100)',
                  borderRadius: 'var(--ob-r-pill)',
                  color: 'var(--ob-primary-700)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Prova igen
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setVisible(false)}
            style={{
              marginTop: 12,
              padding: 0,
              background: 'transparent',
              border: 0,
              color: 'var(--ob-muted)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              textDecoration: 'underline',
              fontFamily: 'inherit',
            }}
          >
            Testa senare
          </button>
        </>
      )}
    </div>
  )
}

export default function Step4PhoneNumber({ onNext, onBack, data, setData }: Step4Props) {
  // Persisterad platshållare från äldre sessioner räknas som "inget nummer".
  const initialNumber = data.lisaNumber && data.lisaNumber !== LEGACY_PLACEHOLDER ? data.lisaNumber : ''
  // 'pending' = köpet gav inget nummer ännu — ärligt väntande-läge, aldrig låtsasnummer.
  const [phase, setPhase] = useState<'reserving' | 'done' | 'pending'>(initialNumber ? 'done' : 'reserving')
  const [number, setNumber] = useState<string>(initialNumber)
  const [retryTick, setRetryTick] = useState(0)
  const [openOp, setOpenOp] = useState<string | null>(null)
  const [whatForOpen, setWhatForOpen] = useState(false)
  const mode = data.phoneMode || 'forward'

  // Agenter som faktiskt använder numret för outbound (SMS-utskick).
  // Lisa = inbound-samtal, Karin/Daniel/Hanna = outbound-SMS.
  const lisaAvatar   = TEAM.find(a => a.id === 'lisa')?.avatar
  const karinAvatar  = TEAM.find(a => a.id === 'karin')?.avatar
  const danielAvatar = TEAM.find(a => a.id === 'daniel')?.avatar
  const hannaAvatar  = TEAM.find(a => a.id === 'hanna')?.avatar

  const update = (updates: Partial<OnboardingFormData>) =>
    setData(d => ({ ...d, ...updates }))

  useEffect(() => {
    if (number) return

    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []

    // Ett köpförsök. Misslyckas det: två tysta omförsök (nummerköpet är
    // idempotent — redan tilldelat nummer returneras), sedan ärligt
    // väntande-läge. Ett låtsasnummer får ALDRIG visas som användarens.
    async function reserve(attempt: number) {
      let assigned = ''
      try {
        const res = await fetch('/api/onboarding/phone/reserve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).catch(() => null)
        if (res?.ok) {
          const json = await res.json()
          assigned = json.phone_number || json.number || ''
          if (!assigned && json.error) console.error('[onboarding] nummerköp misslyckades:', json.error)
        }
      } catch (err) {
        console.error('[onboarding] nummerköp misslyckades:', err)
      }
      if (cancelled) return

      if (assigned) {
        setNumber(assigned)
        update({ lisaNumber: assigned })
        timers.push(setTimeout(() => !cancelled && setPhase('done'), 400))
      } else if (attempt < 3) {
        timers.push(setTimeout(() => reserve(attempt + 1), 4000))
      } else {
        setPhase('pending')
      }
    }

    setPhase('reserving')
    timers.push(setTimeout(() => reserve(1), 1300))
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryTick])

  const cleanNumber = number.replace(/[\s-+]/g, '').replace(/^46/, '0')

  return (
    <div className="ob-screen">
      <OnboardingHeader step={2} total={4} onBack={onBack} />
      <div className="ob-body" style={{ display: 'flex', flexDirection: 'column' }}>
        <h1 className="ob-headline">Här är ditt Handymate-nummer</h1>
        <p className="ob-sub">
          Lisa fångar samtalen till numret åt dig, och hela teamet använder det
          för SMS-påminnelser, offert-uppföljning och kund-utskick.
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
          ) : phase === 'pending' ? (
            <div style={{ padding: '14px 0' }}>
              <p style={{ color: 'var(--ob-ink)', fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                Ditt nummer tilldelas just nu
              </p>
              <p style={{ color: 'var(--ob-muted)', fontSize: 13, lineHeight: 1.5, maxWidth: 300, margin: '0 auto' }}>
                Det tar ibland en liten stund. Du kan fortsätta — numret dyker upp
                i appen under Inställningar → Telefoni så snart det är klart.
              </p>
              <button
                type="button"
                onClick={() => setRetryTick(t => t + 1)}
                style={{
                  marginTop: 12,
                  padding: '8px 16px',
                  background: 'var(--ob-surface)',
                  border: '1px solid var(--ob-primary-100)',
                  borderRadius: 'var(--ob-r-pill)',
                  color: 'var(--ob-primary-700)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Kolla igen
              </button>
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
              <p style={{ fontSize: 13, color: 'var(--ob-muted)' }}>Lisa fångar samtalen — dygnet runt</p>
            </div>
          )}
        </div>

        {/* "Testa Lisa nu" — bara med riktigt tilldelat nummer */}
        {phase === 'done' && !!number && <TestLisaCard />}

        {/* "Vad används detta nummer till?" — InfoSheet-länk */}
        <button
          type="button"
          onClick={() => setWhatForOpen(true)}
          style={{
            marginTop: 10,
            alignSelf: 'center',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: 'transparent',
            border: 0,
            color: 'var(--ob-primary-700)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          <Info size={14} /> Vad används detta nummer till?
        </button>

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

        {/* Operator instructions — utan riktigt nummer blir koderna trasiga
            (**21*#) och får inte visas; ärlig väntetext istället. */}
        {mode === 'forward' && !number && (
          <p style={{ fontSize: 13, color: 'var(--ob-muted)', textAlign: 'center', padding: '8px 0' }}>
            Vidarekopplings-koderna visas här så snart ditt nummer är klart.
          </p>
        )}
        {mode === 'forward' && !!number && (
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
        {/* 'pending' låser INTE flödet — "aldrig fastna": numret dyker upp i
            appen när det är klart, användaren ska kunna gå vidare. */}
        <button
          type="button"
          className="ob-cta"
          disabled={phase === 'reserving'}
          onClick={onNext}
        >
          Fortsätt <ArrowRight size={18} />
        </button>
        <button
          type="button"
          className="ob-cta ghost"
          onClick={onNext}
          style={{ height: 44, fontSize: 13 }}
          disabled={phase === 'reserving'}
        >
          Visa instruktioner senare
        </button>
      </div>

      {/* "Vad används numret till?" — per-agent-bullets */}
      <InfoSheet
        open={whatForOpen}
        onClose={() => setWhatForOpen(false)}
        title="Vad används Handymate-numret till?"
      >
        <p style={{ marginTop: 0 }}>
          Numret är inte bara för Lisa — det är hela teamets utgångspunkt
          mot dina kunder.
        </p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {[
            { avatar: lisaAvatar,   name: 'Lisa',   role: 'Kundservice', text: 'Svarar samtal när du inte hinner, samlar lead-info, bokar in återuppringningar.' },
            { avatar: karinAvatar,  name: 'Karin',  role: 'Ekonom',      text: 'Skickar fakturapåminnelser via SMS när kund inte betalat i tid.' },
            { avatar: danielAvatar, name: 'Daniel', role: 'Säljare',     text: 'Följer upp obeöppnade offerter ("Hej Anna! Jag märkte att du inte hunnit titta...").' },
            { avatar: hannaAvatar,  name: 'Hanna',  role: 'Marknadschef',text: 'Kör säsongskampanjer och kund-reaktivering (Pro+).' },
          ].map(agent => (
            <li key={agent.name} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  flexShrink: 0,
                  borderRadius: '50%',
                  backgroundImage: agent.avatar ? `url(${agent.avatar})` : undefined,
                  backgroundColor: 'var(--ob-primary-50)',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  border: '1.5px solid var(--ob-border)',
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: 'var(--ob-ink)' }}>
                  {agent.name} <span style={{ fontWeight: 500, color: 'var(--ob-muted)', fontSize: 12 }}>· {agent.role}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--ob-ink-2)', marginTop: 2 }}>
                  {agent.text}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p style={{ marginTop: 16, fontSize: 13, color: 'var(--ob-muted)' }}>
          All trafik (in och ut) loggas i Handymate så du har full koll och kan
          följa hela kund-konversationen på ett ställe.
        </p>
      </InfoSheet>
    </div>
  )
}
