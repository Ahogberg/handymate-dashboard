'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronDown, Plus } from 'lucide-react'
import OnboardingHeader from './OnboardingHeader'
import InfoSheet from './InfoSheet'
import { TEAM } from '@/lib/agents/team'
import type { OnboardingFormData } from '../types-redesign'
import { SPECIALTIES_BY_TRADE, TRADES, getTradeLabel } from '../constants'

interface Step3Props {
  onNext: () => void
  onBack: () => void
  data: OnboardingFormData
  setData: (updater: (d: OnboardingFormData) => OnboardingFormData) => void
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

  const [extraSheetOpen, setExtraSheetOpen] = useState(false)
  const [expandedTrade, setExpandedTrade] = useState<string | null>(null)
  const [priceInfoOpen, setPriceInfoOpen] = useState(false)

  const update = (updates: Partial<OnboardingFormData>) =>
    setData(d => ({ ...d, ...updates }))

  const toggleSpec = (s: string) => {
    const next = selected.includes(s)
      ? selected.filter(x => x !== s)
      : [...selected, s]
    update({ specialties: next })
  }

  /**
   * Extra-specialiteter = valda strängar som INTE finns i primär-branschens
   * lista. Visas separat under primär-grid med "Från [bransch]"-tag.
   *
   * Resolver: hitta vilken bransch en specialitet kommer från. Returnerar
   * första matchande bransch (om samma namn finns i flera, t.ex. "Badrum"
   * i både plumber och construction, kvittar för UI-purposes).
   */
  const findTradeFor = (spec: string): string | null => {
    for (const [tradeId, list] of Object.entries(SPECIALTIES_BY_TRADE)) {
      if (tradeId === trade) continue
      if (list.includes(spec)) return tradeId
    }
    return null
  }
  const extraSpecs = selected.filter(s => !specs.includes(s))

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

          {/* Extra-specialiteter från andra branscher */}
          {extraSpecs.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--ob-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Från andra branscher
              </div>
              <div className="ob-chip-grid">
                {extraSpecs.map(s => {
                  const sourceTrade = findTradeFor(s)
                  return (
                    <button
                      type="button"
                      key={`extra-${s}`}
                      className="ob-chip selected"
                      onClick={() => toggleSpec(s)}
                      title={sourceTrade ? `Från ${getTradeLabel(sourceTrade)}` : undefined}
                      style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '8px 12px', gap: 2 }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Check size={14} />
                        {s}
                      </span>
                      {sourceTrade && (
                        <span style={{ fontSize: 10, opacity: 0.7, fontWeight: 500 }}>
                          {getTradeLabel(sourceTrade)}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* "Lägg till från annan bransch" — öppnar InfoSheet */}
          <button
            type="button"
            onClick={() => setExtraSheetOpen(true)}
            style={{
              marginTop: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 'var(--ob-r-pill)',
              background: 'var(--ob-bg)',
              border: '1px dashed var(--ob-border-strong)',
              color: 'var(--ob-primary-700)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Plus size={14} />
            Lägg till från annan bransch
          </button>
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
          <label className="ob-label">Timdebitering (ex moms)</label>
          <DualSlider
            min={300}
            max={2500}
            step={50}
            valueMin={priceMin}
            valueMax={priceMax}
            onChange={(a, b) => update({ priceMin: a, priceMax: b })}
          />
          {/* Andreas pilot-feedback (2026-06-03): visa både ex/inkl moms.
              Default 25% moms — svenska standard. */}
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ob-muted)', lineHeight: 1.5 }}>
            {priceMin}–{priceMax} kr/h ex moms · {Math.round(priceMin * 1.25)}–{Math.round(priceMax * 1.25)} kr/h inkl moms
          </div>
          <button
            type="button"
            onClick={() => setPriceInfoOpen(true)}
            style={{
              marginTop: 6,
              padding: 0,
              background: 'transparent',
              border: 0,
              color: 'var(--ob-primary-700)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Vad är skillnaden ex/inkl moms?
          </button>
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
                ”ungefär {Math.round(priceMin * 1.25)}–{Math.round(priceMax * 1.25)} kr per timme inkl moms”
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

      {/* Timdebitering — ex/inkl moms-förklaring */}
      <InfoSheet
        open={priceInfoOpen}
        onClose={() => setPriceInfoOpen(false)}
        title="Timdebitering ex vs inkl moms"
      >
        <p style={{ marginTop: 0 }}>
          Du anger ditt timpris <strong>exklusive moms</strong> — det är beloppet du faktiskt
          får in i fickan när fakturan är betald.
        </p>
        <p>
          När vi visar offerten för kunden lägger vi automatiskt på <strong>25 % moms</strong>
          {' '}(svensk standard). En timme à 600 kr ex moms blir alltså 750 kr på offerten.
        </p>
        <p>
          Svenska konsumenter tänker oftast på inkl-moms-priset (det är det de betalar).
          Företagskunder tänker ex moms (de drar av momsen själva). Vi visar båda värdena i appen
          så du kan ha rätt samtal med rätt kund.
        </p>
        <p style={{ color: 'var(--ob-muted)', fontSize: 13 }}>
          Du kan justera momssats per offert i Karins ekonomi-vy senare — t.ex. 0 % för export
          eller 12 % för ROT-jobb.
        </p>
      </InfoSheet>

      {/* Multi-bransch-specialitets-väljare */}
      <InfoSheet
        open={extraSheetOpen}
        onClose={() => setExtraSheetOpen(false)}
        title="Lägg till från annan bransch"
      >
        <p style={{ marginTop: 0, marginBottom: 16, color: 'var(--ob-muted)' }}>
          Plocka specialiteter från andra branscher du också tar jobb inom.
          Din huvudbransch är <strong>{getTradeLabel(trade)}</strong>.
        </p>
        {TRADES.filter(t => t.id !== trade).map(t => {
          const list = SPECIALTIES_BY_TRADE[t.id] || []
          const isOpen = expandedTrade === t.id
          return (
            <div
              key={t.id}
              style={{
                marginBottom: 8,
                border: '1px solid var(--ob-border)',
                borderRadius: 'var(--ob-r-md)',
                background: 'var(--ob-surface)',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => setExpandedTrade(isOpen ? null : t.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  background: 'transparent',
                  border: 0,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--ob-ink)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <t.icon size={16} color="var(--ob-muted)" />
                  {t.label}
                </span>
                <ChevronDown
                  size={16}
                  style={{
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform var(--ob-t-fast)',
                    color: 'var(--ob-muted)',
                  }}
                />
              </button>
              {isOpen && (
                <div style={{ padding: '4px 14px 14px' }}>
                  <div className="ob-chip-grid">
                    {list.map(s => (
                      <button
                        type="button"
                        key={`sheet-${t.id}-${s}`}
                        className={`ob-chip ${selected.includes(s) ? 'selected' : ''}`}
                        onClick={() => toggleSpec(s)}
                      >
                        {selected.includes(s) && <Check size={14} />}
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </InfoSheet>
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
