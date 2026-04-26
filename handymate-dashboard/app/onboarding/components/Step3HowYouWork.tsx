'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronDown } from 'lucide-react'
import OnboardingHeader from './OnboardingHeader'
import { TEAM } from '@/lib/agents/team'
import type { OnboardingFormData } from '../types-redesign'

interface Step3Props {
  onNext: () => void
  onBack: () => void
  data: OnboardingFormData
  setData: (updater: (d: OnboardingFormData) => OnboardingFormData) => void
}

const SPECIALTIES_BY_TRADE: Record<string, string[]> = {
  electrician:  ['Installation', 'Felsökning', 'Belysning', 'Laddbox', 'Solceller', 'Smart hem', 'Service', 'Industri'],
  plumber:      ['Badrum', 'Kök', 'Värmepump', 'Avlopp', 'Service', 'Vattenskador', 'Renovering', 'Nybygge'],
  construction: ['Badrum', 'Kök', 'Tak', 'Fasad', 'Tillbyggnad', 'Altan', 'Garage', 'Renovering'],
  painter:      ['Inomhus', 'Utomhus', 'Tapetsering', 'Fönsterputs', 'Fasad', 'Trapphus', 'Kontor', 'Detaljmåleri'],
  roofing:      ['Takomläggning', 'Plåttak', 'Tegeltak', 'Takfönster', 'Hängrännor', 'Skorsten', 'Snöskottning', 'Inspektion'],
  other:        ['Badrum', 'Kök', 'Måleri', 'Trädgård', 'Mindre el', 'Mindre VVS', 'Snickeri', 'Reparationer'],
}

const DAYS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

const DEFAULT_DAYS = [true, true, true, true, true, false, false]

export default function Step3HowYouWork({ onNext, onBack, data, setData }: Step3Props) {
  const trade = data.trade || 'other'
  const specs = SPECIALTIES_BY_TRADE[trade] || SPECIALTIES_BY_TRADE.other
  const selected = data.specialties || []
  const days = data.days || DEFAULT_DAYS
  const startHour = data.startHour ?? 7
  const endHour = data.endHour ?? 17
  const priceMin = data.priceMin ?? 600
  const priceMax = data.priceMax ?? 1200

  const update = (updates: Partial<OnboardingFormData>) =>
    setData(d => ({ ...d, ...updates }))

  const toggleSpec = (s: string) => {
    const next = selected.includes(s)
      ? selected.filter(x => x !== s)
      : [...selected, s]
    update({ specialties: next })
  }

  const toggleDay = (i: number) => {
    const next = [...days]
    next[i] = !next[i]
    update({ days: next })
  }

  const valid = selected.length > 0 && days.some(Boolean)

  const lisa = TEAM.find(a => a.id === 'lisa')

  return (
    <div className="ob-screen">
      <OnboardingHeader step={1} total={4} onBack={onBack} />
      <div className="ob-body">
        <h1 className="ob-headline">Hur jobbar du?</h1>
        <p className="ob-sub">Lisa behöver veta för att svara rätt i telefonen</p>

        {/* Specialties */}
        <section style={{ marginBottom: 28 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <label className="ob-label" style={{ margin: 0 }}>
              Specialiteter
            </label>
            <span style={{ fontSize: 12, color: 'var(--ob-muted)' }}>
              {selected.length} valda
            </span>
          </div>
          <div className="ob-chip-grid">
            {specs.map(s => (
              <button
                type="button"
                key={s}
                className={`ob-chip ${selected.includes(s) ? 'selected' : ''}`}
                onClick={() => toggleSpec(s)}
              >
                {selected.includes(s) && <Check size={14} />}
                {s}
              </button>
            ))}
          </div>
        </section>

        {/* Working hours */}
        <section style={{ marginBottom: 28 }}>
          <label className="ob-label">När jobbar du?</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {DAYS.map((d, i) => (
              <button
                type="button"
                key={d}
                onClick={() => toggleDay(i)}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 'var(--ob-r-md)',
                  border: `1.5px solid ${days[i] ? 'var(--ob-primary-700)' : 'var(--ob-border)'}`,
                  background: days[i] ? 'var(--ob-primary-50)' : 'var(--ob-surface)',
                  color: days[i] ? 'var(--ob-primary-700)' : 'var(--ob-ink-2)',
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'all var(--ob-t-fast)',
                  fontFamily: 'inherit',
                }}
              >
                {d}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <TimeSelect
              label="Från"
              value={startHour}
              onChange={v => update({ startHour: v })}
            />
            <span style={{ color: 'var(--ob-muted)', fontSize: 14 }}>–</span>
            <TimeSelect
              label="Till"
              value={endHour}
              onChange={v => update({ endHour: v })}
            />
          </div>
        </section>

        {/* Price */}
        <section>
          <label className="ob-label">Vad kostar du?</label>
          <DualSlider
            min={300}
            max={2500}
            step={50}
            valueMin={priceMin}
            valueMax={priceMax}
            onChange={(a, b) => update({ priceMin: a, priceMax: b })}
          />
          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              background: 'var(--ob-primary-50)',
              border: '1px solid var(--ob-primary-100)',
              borderRadius: 'var(--ob-r-md)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                flexShrink: 0,
                borderRadius: '50%',
                backgroundImage: lisa?.avatar ? `url(${lisa.avatar})` : undefined,
                backgroundColor: '#E0F2FE',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                border: '1.5px solid var(--ob-sky-500)',
              }}
            />
            <p style={{ fontSize: 13, color: 'var(--ob-ink-2)', lineHeight: 1.4 }}>
              Lisa säger:{' '}
              <strong style={{ color: 'var(--ob-primary-700)' }}>
                ”ungefär {priceMin}–{priceMax} kr per timme”
              </strong>
            </p>
          </div>
        </section>
      </div>

      <div className="ob-footer">
        <button
          type="button"
          className="ob-cta"
          disabled={!valid}
          onClick={onNext}
        >
          Fortsätt <ArrowRight size={18} />
        </button>
      </div>
    </div>
  )
}

interface TimeSelectProps {
  label: string
  value: number
  onChange: (v: number) => void
}

function TimeSelect({ label, value, onChange }: TimeSelectProps) {
  return (
    <div style={{ flex: 1, position: 'relative' }}>
      <span
        style={{
          position: 'absolute',
          left: 14,
          top: 8,
          fontSize: 11,
          color: 'var(--ob-muted)',
          fontWeight: 600,
          pointerEvents: 'none',
        }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          width: '100%',
          height: 56,
          paddingTop: 18,
          paddingLeft: 12,
          paddingRight: 32,
          border: '1px solid var(--ob-border)',
          borderRadius: 'var(--ob-r-md)',
          background: 'var(--ob-surface)',
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--ob-ink)',
          appearance: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {HOURS.map(h => (
          <option key={h} value={h}>
            {String(h).padStart(2, '0')}:00
          </option>
        ))}
      </select>
      <span
        style={{
          position: 'absolute',
          right: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--ob-subtle)',
          pointerEvents: 'none',
        }}
      >
        <ChevronDown size={16} />
      </span>
    </div>
  )
}

interface DualSliderProps {
  min: number
  max: number
  step: number
  valueMin: number
  valueMax: number
  onChange: (min: number, max: number) => void
}

function DualSlider({ min, max, step, valueMin, valueMax, onChange }: DualSliderProps) {
  const [dragging, setDragging] = useState<'min' | 'max' | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const pct = (v: number) => ((v - min) / (max - min)) * 100

  useEffect(() => {
    if (!dragging) return

    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!ref.current) return
      const r = ref.current.getBoundingClientRect()
      const clientX =
        'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX
      const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
      const v = Math.round((min + ratio * (max - min)) / step) * step
      if (dragging === 'min') onChange(Math.min(v, valueMax - step), valueMax)
      else onChange(valueMin, Math.max(v, valueMin + step))
    }

    const up = () => setDragging(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchmove', onMove)
    window.addEventListener('mouseup', up)
    window.addEventListener('touchend', up)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('touchend', up)
    }
  }, [dragging, valueMin, valueMax, min, max, step, onChange])

  return (
    <div style={{ padding: '24px 12px 8px' }}>
      <div
        ref={ref}
        style={{
          position: 'relative',
          height: 6,
          background: 'var(--ob-border)',
          borderRadius: 3,
        }}
      >
        <div
          style={{
            position: 'absolute',
            height: '100%',
            left: `${pct(valueMin)}%`,
            right: `${100 - pct(valueMax)}%`,
            background: 'var(--ob-primary-700)',
            borderRadius: 3,
          }}
        />
        {(['min', 'max'] as const).map(k => {
          const v = k === 'min' ? valueMin : valueMax
          return (
            <div
              key={k}
              onMouseDown={() => setDragging(k)}
              onTouchStart={() => setDragging(k)}
              style={{
                position: 'absolute',
                left: `${pct(v)}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 26,
                height: 26,
                background: '#fff',
                border: '2px solid var(--ob-primary-700)',
                borderRadius: '50%',
                boxShadow: 'var(--ob-sh-md)',
                cursor: 'grab',
                touchAction: 'none',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: -28,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--ob-primary-700)',
                  whiteSpace: 'nowrap',
                }}
              >
                {v} kr
              </span>
            </div>
          )
        })}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 10,
          fontSize: 11,
          color: 'var(--ob-muted)',
        }}
      >
        <span>{min} kr</span>
        <span>{max} kr</span>
      </div>
    </div>
  )
}
