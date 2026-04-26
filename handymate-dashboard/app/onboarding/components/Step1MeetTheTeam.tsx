'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Phone, FileText, FileSignature, Calendar, Megaphone } from 'lucide-react'
import { TEAM } from '@/lib/agents/team'
import OnboardingHeader from './OnboardingHeader'

interface Step1Props {
  onNext: () => void
}

interface AgentDisplay {
  id: string
  activity: string
  icon: typeof Phone
  bg: string
  ring: string
}

// Aktivitets-loop + färgmappning per agent — matchar Claude Design.
const AGENT_DISPLAY: Record<string, AgentDisplay> = {
  lisa:   { id: 'lisa',   activity: 'Svarar i telefonen',  icon: Phone,     bg: '#E0F2FE', ring: '#0EA5E9' },
  karin:  { id: 'karin',  activity: 'Skickar fakturor',    icon: FileText,  bg: '#DBEAFE', ring: '#2563EB' },
  daniel: { id: 'daniel', activity: 'Förbereder offert',   icon: FileSignature, bg: '#FEF3C7', ring: '#D97706' },
  lars:   { id: 'lars',   activity: 'Bekräftar bokningar', icon: Calendar,  bg: '#D1FAE5', ring: '#059669' },
  hanna:  { id: 'hanna',  activity: 'Skickar SMS-kampanj', icon: Megaphone, bg: '#EDE9FE', ring: '#9333EA' },
}

const REVEAL_ORDER = ['lisa', 'karin', 'daniel', 'lars', 'hanna'] as const

export default function Step1MeetTheTeam({ onNext }: Step1Props) {
  const [revealed, setRevealed] = useState(0)
  const [showSkip, setShowSkip] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const skipTimer = setTimeout(() => setShowSkip(true), 1200)
    const timers = REVEAL_ORDER.map((_, i) =>
      setTimeout(() => setRevealed(r => Math.max(r, i + 1)), 600 + i * 1100),
    )
    const doneTimer = setTimeout(
      () => setDone(true),
      600 + REVEAL_ORDER.length * 1100 + 600,
    )
    return () => {
      clearTimeout(skipTimer)
      clearTimeout(doneTimer)
      timers.forEach(clearTimeout)
    }
  }, [])

  const skip = () => {
    setRevealed(REVEAL_ORDER.length)
    setDone(true)
  }

  return (
    <div className="ob-screen">
      <OnboardingHeader hideProgress onSkip={showSkip && !done ? skip : null} />
      <div className="ob-body" style={{ padding: '8px 20px 16px' }}>
        <div style={{ textAlign: 'center', padding: '12px 0 20px' }}>
          <div
            className="ob-eyebrow"
            style={{ marginBottom: 8, opacity: revealed > 0 ? 1 : 0, transition: 'opacity 400ms' }}
          >
            HANDYMATE
          </div>
          <h1
            style={{
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: '-0.025em',
              lineHeight: 1.1,
              color: 'var(--ob-ink)',
              marginBottom: 8,
            }}
          >
            Ditt AI-team väntar
          </h1>
          <p style={{ color: 'var(--ob-muted)', fontSize: 15, lineHeight: 1.5 }}>
            Fem medarbetare. Redo att börja jobba åt dig.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {REVEAL_ORDER.map((id, i) => {
            const agent = TEAM.find(a => a.id === id)
            const display = AGENT_DISPLAY[id]
            if (!agent || !display) return null
            return (
              <AgentRow
                key={id}
                name={agent.name}
                role={agent.role}
                avatar={agent.avatar || ''}
                activity={display.activity}
                Icon={display.icon}
                bg={display.bg}
                ring={display.ring}
                revealed={i < revealed}
              />
            )
          })}
        </div>
      </div>
      <div className="ob-footer">
        <button
          type="button"
          className="ob-cta"
          onClick={onNext}
          disabled={!done}
        >
          {done ? 'Sätt upp mig på 5 minuter' : 'Möter teamet…'}
          {done && <ArrowRight size={18} />}
        </button>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ob-muted)' }}>
          Aldrig mer en missad kundkontakt.
        </p>
      </div>
    </div>
  )
}

interface AgentRowProps {
  name: string
  role: string
  avatar: string
  activity: string
  Icon: typeof Phone
  bg: string
  ring: string
  revealed: boolean
}

function AgentRow({ name, role, avatar, activity, Icon, bg, ring, revealed }: AgentRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 14px',
        background: 'var(--ob-surface)',
        border: '1px solid var(--ob-border)',
        borderRadius: 'var(--ob-r-lg)',
        boxShadow: revealed ? 'var(--ob-sh-sm)' : 'none',
        opacity: revealed ? 1 : 0,
        transform: revealed ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.96)',
        transition:
          'opacity 480ms cubic-bezier(0.34, 1.56, 0.64, 1), transform 480ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 300ms',
      }}
    >
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: bg,
            backgroundImage: avatar ? `url(${avatar})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            border: `2px solid ${ring}`,
          }}
        />
        {revealed && (
          <span
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 14,
              height: 14,
              background: 'var(--ob-green-600)',
              border: '2px solid var(--ob-surface)',
              borderRadius: '50%',
              animation: 'ob-pulse-ring 2s infinite',
            }}
          />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <strong style={{ fontSize: 15, color: 'var(--ob-ink)' }}>{name}</strong>
          <span style={{ fontSize: 12, color: 'var(--ob-muted)' }}>{role}</span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 4,
            color: ring,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <Icon size={14} />
          <span style={{ color: 'var(--ob-ink-2)' }}>{activity}</span>
        </div>
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--ob-green-600)',
          background: 'var(--ob-green-50)',
          padding: '4px 8px',
          borderRadius: 'var(--ob-r-pill)',
        }}
      >
        Online
      </span>
    </div>
  )
}
