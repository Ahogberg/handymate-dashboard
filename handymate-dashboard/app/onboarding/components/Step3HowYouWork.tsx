'use client'

import { useState } from 'react'
import { ArrowRight, Check, ChevronDown, Plus } from 'lucide-react'
import OnboardingHeader from './OnboardingHeader'
import InfoSheet from './InfoSheet'
import { TEAM } from '@/lib/agents/team'
import type { OnboardingFormData } from '../types-redesign'
import { FIRST_FOCUS_OPTIONS } from '@/lib/onboarding/first-focus'
import type { WorkPricingModel } from '@/lib/onboarding/pricing-start'
import { OB_DOTS, OB_DOT_TOTAL, SPECIALTIES_BY_TRADE, TRADES, getTradeLabel } from '../constants'

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
  const pricingModel = data.pricingModel
  const standardHourlyRate = data.standardHourlyRate ?? null
  // Prisslingan V2 (beslut 4): företagets eget materialpåslag — 20 är ett
  // synligt FÖRSLAG han kan ändra, aldrig en tyst applicerad konstant.
  const materialMarkup = data.materialMarkup ?? 20
  const firstFocus = data.firstFocus

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

  const rateRequired = pricingModel === 'one_standard_rate'
  const valid = selected.length > 0 && days.some(Boolean) && Boolean(pricingModel) && (!rateRequired || Number(standardHourlyRate) > 0)
  const [visaSaknas, setVisaSaknas] = useState(false)

  const matte = TEAM.find(a => a.id === 'matte')

  return (
    <div className="ob-screen">
      <OnboardingHeader step={OB_DOTS.howYouWork} total={OB_DOT_TOTAL} onBack={onBack} />
      <div className="ob-body">
        <h1 className="ob-headline">Hur jobbar du?</h1>
        {/* "svara rätt i telefonen" är FÖRBJUDEN copy (låter som talande
            röst-AI, vilket produkten inte har) — samma regel som i teamintrot.
            Lisa fångar missade samtal och svarar kunder via SMS. */}
        <p className="ob-sub">Lisa behöver veta det här för att svara kunderna rätt</p>

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

        {/* Prisstart — företagets val, aldrig ett förifyllt Handymate-pris. */}
        <section>
          <label className="ob-label">Hur brukar ni prissätta arbetet?</label>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ob-muted)', lineHeight: 1.5 }}>
            Matte använder alltid det mest specifika pris ni har angett.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {([
              ['one_standard_rate', 'Samma timpris för de flesta jobb', 'Ett enkelt standardpris som fungerar som reserv.'],
              ['job_type_rates', 'Olika pris beroende på jobbtyp', 'Till exempel service, badrum och akutjobb.'],
              ['fixed_or_mixed', 'Mest fasta priser eller en blandning', 'Timpris kan fortfarande anges som reserv när det behövs.'],
            ] as Array<[WorkPricingModel, string, string]>).map(([id, title, description]) => (
              <button
                key={id}
                type="button"
                onClick={() => update({ pricingModel: id })}
                aria-pressed={pricingModel === id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px',
                  textAlign: 'left', borderRadius: 'var(--ob-r-md)',
                  border: `1.5px solid ${pricingModel === id ? 'var(--ob-primary-700)' : 'var(--ob-border)'}`,
                  background: pricingModel === id ? 'var(--ob-primary-50)' : 'var(--ob-surface)',
                  color: 'var(--ob-ink)', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <span style={{
                  width: 20, height: 20, marginTop: 1, flexShrink: 0, borderRadius: '50%',
                  border: `1.5px solid ${pricingModel === id ? 'var(--ob-primary-700)' : 'var(--ob-border-strong)'}`,
                  background: pricingModel === id ? 'var(--ob-primary-700)' : '#fff', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {pricingModel === id && <Check size={13} />}
                </span>
                <span>
                  <strong style={{ display: 'block', fontSize: 13.5 }}>{title}</strong>
                  <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: 'var(--ob-muted)', lineHeight: 1.4 }}>{description}</span>
                </span>
              </button>
            ))}
          </div>

          {pricingModel && (
            <div style={{ marginTop: 16 }}>
              <label className="ob-label" htmlFor="standard-hourly-rate">
                Standardpris för arbete {rateRequired ? '' : '(frivilligt)'}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  id="standard-hourly-rate"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={100000}
                  step={50}
                  value={standardHourlyRate ?? ''}
                  onChange={e => update({ standardHourlyRate: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="Exempel: 825"
                  className="ob-input"
                  style={{ width: 170 }}
                />
                <span style={{ fontSize: 13, color: 'var(--ob-muted)' }}>kr/tim ex moms</span>
              </div>
              <p style={{ margin: '7px 0 0', fontSize: 12, color: 'var(--ob-muted)', lineHeight: 1.5 }}>
                Det används när jobbtypen saknar ett eget pris. En kopplad arbetsartikel för jobbtypen går alltid före.
              </p>
              {Number(standardHourlyRate) > 0 && (
                <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--ob-primary-700)', fontWeight: 600 }}>
                  Kunden ser {Math.round(Number(standardHourlyRate) * 1.25).toLocaleString('sv-SE')} kr/tim inklusive 25 % moms.
                </p>
              )}
            </div>
          )}
          {/* Materialpåslag (Prisslingan V2, beslut 4): samma princip som
              timpriset — en siffra varje hantverkare kan utantill. Fältet är
              synligt förifyllt; att passera steget med det = bekräftat. */}
          <div style={{ marginTop: 16 }}>
            <label className="ob-label">Materialpåslag (%)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                min={0}
                max={100}
                value={materialMarkup}
                onChange={e => update({ materialMarkup: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                style={{
                  width: 90,
                  padding: '10px 12px',
                  border: '1px solid var(--ob-border, #E2E8F0)',
                  borderRadius: 10,
                  fontSize: 15,
                }}
              />
              <span style={{ fontSize: 13, color: 'var(--ob-muted)' }}>
                läggs på ditt inköpspris när material faktureras
              </span>
            </div>
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
                backgroundImage: matte?.avatar ? `url(${matte.avatar})` : undefined,
                backgroundColor: '#E0F2FE',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                border: '1.5px solid var(--ob-sky-500)',
              }}
            />
            <p style={{ fontSize: 13, color: 'var(--ob-ink-2)', lineHeight: 1.4 }}>
              Matte använder pris i den här ordningen:{' '}
              <strong style={{ color: 'var(--ob-primary-700)' }}>
                jobbtypens arbetsartikel → företagets standardpris → fråga dig om pris saknas.
              </strong>
            </p>
          </div>
        </section>

        {/* ── Vad först? (Lager 3 / B6, 2026-08-27) ──────────────────────
             Ersätter årsomsättningsmålet som onboardingfråga: ett årsmål är
             ett planeringsverktyg (Inställningar → Ekonomi, månadsrapporten),
             inte något en hantverkare kan svara på i steg 2. Fem knappar ger
             Matte ett omedelbart mål. Frivilligt — samma hoppa-över-disciplin. */}
        <section style={{ marginBottom: 28 }}>
          <label className="ob-label">Vad vill du att teamet hjälper dig med först? (frivilligt)</label>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ob-muted)', lineHeight: 1.5 }}>
            Matte börjar där du pekar. Du kan ändra dig när som helst.
          </p>
          <div className="ob-chip-grid">
            {FIRST_FOCUS_OPTIONS.map(o => (
              <button
                type="button"
                key={o.id}
                className={`ob-chip ${firstFocus === o.id ? 'selected' : ''}`}
                onClick={() => update({ firstFocus: firstFocus === o.id ? undefined : o.id })}
              >
                {firstFocus === o.id && <Check size={14} />}
                {o.label}
              </button>
            ))}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--ob-muted)', lineHeight: 1.5 }}>
            Vet du inte än — hoppa över. Årsmål och marginalmål sätter du senare under
            Inställningar → Ekonomi.
          </p>
        </section>

      </div>

      <div className="ob-footer">
        {/* En död knapp utan besked lämnar användaren att gissa (B7-fyndet:
            org.nr-knappen). Samma mönster som Step2: knappen är klickbar,
            och ett klick i ogiltigt läge SÄGER vad som saknas. */}
        {visaSaknas && !valid && (
          <div
            role="alert"
            style={{
              marginBottom: 10,
              padding: '10px 12px',
              borderRadius: 'var(--ob-r-md)',
              background: 'var(--ob-rose-50)',
              border: '1px solid #FECACA',
              fontSize: 13,
              color: '#B91C1C',
            }}
          >
            <strong>Innan du fortsätter:</strong>{' '}
            {[
              selected.length === 0 ? 'välj minst en specialitet' : null,
              !days.some(Boolean) ? 'markera minst en arbetsdag' : null,
              !pricingModel ? 'välj hur ni brukar prissätta arbetet' : null,
              rateRequired && !(Number(standardHourlyRate) > 0) ? 'ange ert standardpris för arbete' : null,
            ].filter(Boolean).join(' och ')}
          </div>
        )}
        <button
          type="button"
          className="ob-cta"
          aria-disabled={!valid}
          style={!valid ? { opacity: 0.6, cursor: 'pointer' } : undefined}
          onClick={() => (valid ? onNext() : setVisaSaknas(true))}
        >
          Fortsätt <ArrowRight size={18} />
        </button>
      </div>

      {/* Arbetspris — ex/inkl moms-förklaring */}
      <InfoSheet
        open={priceInfoOpen}
        onClose={() => setPriceInfoOpen(false)}
        title="Arbetspris ex vs inkl moms"
      >
        <p style={{ marginTop: 0 }}>
          Arbetspriset anges <strong>exklusive moms</strong> — det är företagets försäljningspris,
          inte den interna kostnaden för en arbetstimme.
        </p>
        <p>
          När vi visar offerten för kunden lägger vi normalt på <strong>25 % moms</strong>.
          Ett pris på 800 kr ex moms visas då som 1 000 kr inklusive moms.
        </p>
        <p>
          Svenska konsumenter tänker oftast på inkl-moms-priset (det är det de betalar).
          Företagskunder tänker ex moms (de drar av momsen själva). Vi visar båda värdena i appen
          så du kan ha rätt samtal med rätt kund.
        </p>
        <p style={{ color: 'var(--ob-muted)', fontSize: 13 }}>
          ROT och RUT påverkar avdraget på arbetskostnaden, inte momssatsen. Momsen och avdraget
          visas separat i offerten.
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
