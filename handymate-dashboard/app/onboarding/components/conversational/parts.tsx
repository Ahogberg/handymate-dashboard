'use client'

/* Matte-konversationell onboarding (v3) — delade shell-komponenter.
   Portad från Claude Designs ob3-shared.jsx till TSX.
   Skillnader mot mockupen:
   - mock-Icon → lucide-react (samma som resten av onboardingen)
   - demo-avatar (../assets/team/matte.png) → riktig signerad URL via getAgentById
   Klasser/markup oförändrade (matchar onboarding-v3.css). */

import React, { useState } from 'react'
import {
  Home, MapPin, FileText, Wrench, MessageCircle, Clock, DollarSign, Shield,
  Users, Calendar, Zap, Check, X, Plus, Sparkles, Target, Phone, Rocket,
  Upload, ArrowRight, ChevronDown, ListChecks,
} from 'lucide-react'
import { getAgentById } from '@/lib/agents/team'

const MATTE_AVATAR = getAgentById('matte')?.avatar || ''

// ── Icon: namn → lucide-komponent (håller portad markup nära mockupen) ──
const ICONS = {
  home: Home, mapPin: MapPin, fileText: FileText, wrench: Wrench,
  messageCircle: MessageCircle, clock: Clock, dollarSign: DollarSign, shield: Shield,
  users: Users, calendar: Calendar, zap: Zap, check: Check, x: X, plus: Plus,
  sparkles: Sparkles, target: Target, phone: Phone, rocket: Rocket, upload: Upload,
  arrowRight: ArrowRight, chevronDown: ChevronDown, listChecks: ListChecks,
} as const

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 16, color, className, style }: {
  name: IconName; size?: number; color?: string; className?: string; style?: React.CSSProperties
}) {
  const Cmp = ICONS[name]
  if (!Cmp) return null
  return <Cmp size={size} color={color} className={className} style={style} />
}

// ── Faser ──
export const PHASES = [
  { id: 'A', label: 'Vem ni är' },
  { id: 'B', label: 'Vad ni gör' },
  { id: 'C', label: 'Hur ni jobbar' },
  { id: 'D', label: 'Verktyg' },
  { id: 'E', label: 'Teamet' },
] as const

export function PhaseRail({ active }: { active: number }) {
  return (
    <div className="m3-rail">
      {PHASES.map((p, i) => {
        const cls = i < active ? 'done' : i === active ? 'active' : ''
        return (
          <React.Fragment key={p.id}>
            <div className={`m3-rail-phase ${cls}`}>
              <span className="m3-rail-node" />
              <span className="m3-rail-label">{p.label}</span>
            </div>
            {i < PHASES.length - 1 && <span className="m3-rail-line" />}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export function Escape({ onClick }: { onClick?: () => void }) {
  return (
    <button className="m3-escape" title="Hoppa till vanligt formulär" onClick={onClick}>
      <Icon name="listChecks" size={14} />
      Hoppa till formulär
    </button>
  )
}

// ── Matte-replik ──
export function Matte({ children, role = true, sm = false }: { children: React.ReactNode; role?: boolean; sm?: boolean }) {
  return (
    <div className="m3-msg">
      <div className={`m3-ava ${sm ? 'sm' : ''}`} style={{ backgroundImage: `url(${MATTE_AVATAR})` }} />
      <div>
        {!sm && (
          <div className="m3-sender">
            <span className="m3-sender-name">Matte</span>
            {role && <span className="m3-sender-role">Din AI-chef</span>}
          </div>
        )}
        <div className="m3-bubble">{children}</div>
      </div>
    </div>
  )
}

// ── Användar-replik ──
export function User({ children, initials = 'MB' }: { children: React.ReactNode; initials?: string }) {
  return (
    <div className="m3-msg user">
      <div className="m3-uava">{initials}</div>
      <div className="m3-bubble">{children}</div>
    </div>
  )
}

export function Typing() {
  return (
    <div className="m3-msg">
      <div className="m3-ava" style={{ backgroundImage: `url(${MATTE_AVATAR})` }} />
      <div className="m3-typing"><span /><span /><span /></div>
    </div>
  )
}

// ── Inline strukturerad input (bor i dialogen, inte separat formulär) ──
export function InlineCard({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return <div className={`m3-inline-card ${accent ? 'accent' : ''}`}>{children}</div>
}

// ── PANEL — "Ditt företag tar form" med epistemisk hierarki ──
type EpistemicState = 'confirmed' | 'interp' | 'future'

export function PanelItem({ icon, iconColor, k, v, state, tag }: {
  icon: IconName; iconColor?: string; k?: string; v: React.ReactNode; state: EpistemicState; tag: string
}) {
  return (
    <div className={`m3-pitem ${state}`}>
      <div className="m3-pitem-ic" style={iconColor ? { color: iconColor } : undefined}>
        <Icon name={icon} size={16} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        {k && <div className="m3-pitem-k">{k}</div>}
        <div className="m3-pitem-v">{v}</div>
      </div>
      <span className="m3-pitem-tag">
        {state === 'confirmed' && <Icon name="check" size={10} />}
        {state === 'interp' && <Icon name="sparkles" size={10} />}
        {state === 'future' && <Icon name="clock" size={10} />}
        {tag}
      </span>
    </div>
  )
}

export function PanelGroup({ label, icon, children }: { label: string; icon?: IconName; children: React.ReactNode }) {
  return (
    <div>
      <div className="m3-pgroup-label">{icon && <Icon name={icon} size={12} />}{label}</div>
      {children}
    </div>
  )
}

export function Panel({ pct = 0, children }: { pct?: number; children: React.ReactNode }) {
  return (
    <>
      <div className="m3-phead">
        <div className="m3-peyebrow"><Icon name="sparkles" size={13} /> Lär känner ert företag</div>
        <div className="m3-ptitle">Ditt företag tar form</div>
        <div className="m3-pmeter"><i style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="m3-pbody">{children}</div>
      <div className="m3-legend">
        <span><i style={{ background: 'var(--ob-primary-500)' }} /> Bekräftat</span>
        <span><i style={{ background: 'var(--ob-amber-600)' }} /> Tolkat</span>
        <span><i style={{ background: 'var(--ob-border-strong)' }} /> Lär mig över tid</span>
      </div>
    </>
  )
}

// ── SHELLS ──
interface ShellProps {
  active: number
  dialog: React.ReactNode
  dock?: React.ReactNode
  onEscape?: () => void
}

/* Desktop split 60/40 */
export function SplitShell({ active, dialog, dock, panel, onEscape }: ShellProps & { panel: React.ReactNode }) {
  return (
    <div className="m3-split">
      <div className="m3-dialog-col">
        <div className="m3-dhead">
          <PhaseRail active={active} />
          <Escape onClick={onEscape} />
        </div>
        <div className="m3-stream">{dialog}</div>
        {dock && <div className="m3-dock">{dock}</div>}
      </div>
      <div className="m3-panel-col">{panel}</div>
    </div>
  )
}

/* Mobil: dialog + hopfällbar panel-sammanfattning överst */
export function MobileShell({ active, dialog, dock, panelSummary, panelDrawer, panelOpen, onEscape }: ShellProps & {
  panelSummary: React.ReactNode; panelDrawer: React.ReactNode; panelOpen?: boolean
}) {
  const [open, setOpen] = useState(!!panelOpen)
  return (
    <div className="m3-mob">
      <div className="m3-dhead">
        <PhaseRail active={active} />
      </div>
      <div className={`m3-mobpanel ${open ? 'open' : ''}`}>
        <div className="m3-mobpanel-bar" onClick={() => setOpen(o => !o)}>
          <div className="ic"><Icon name="sparkles" size={15} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="m3-mobpanel-title">Ditt företag tar form</div>
            <div className="m3-mobpanel-meta">{panelSummary}</div>
          </div>
          <span className="m3-mobpanel-chev"><Icon name="chevronDown" size={18} /></span>
        </div>
        {open && <div className="m3-mobpanel-drawer">{panelDrawer}</div>}
      </div>
      <div className="m3-stream">{dialog}</div>
      {dock && <div className="m3-dock">{dock}</div>}
      <div style={{ padding: '8px 16px 14px' }}>
        <Escape onClick={onEscape} />
      </div>
    </div>
  )
}
