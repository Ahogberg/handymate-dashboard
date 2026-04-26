'use client'

import { useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ArrowRight,
  Clock,
  MapPin,
  Upload,
  Zap,
  Droplets,
  Hammer,
  Paintbrush,
  Home,
  Wrench,
  Loader2,
  Mail,
  Lock,
  User,
  Phone,
  ChevronDown,
} from 'lucide-react'
import OnboardingHeader from './OnboardingHeader'
import type { OnboardingFormData } from '../types-redesign'

interface Step2Props {
  onNext: () => void
  onBack: () => void
  data: OnboardingFormData
  setData: (updater: (d: OnboardingFormData) => OnboardingFormData) => void
}

const TRADES = [
  { id: 'electrician', label: 'El',       icon: Zap },
  { id: 'plumber',     label: 'VVS',      icon: Droplets },
  { id: 'construction',label: 'Bygg',     icon: Hammer },
  { id: 'painter',     label: 'Måleri',   icon: Paintbrush },
  { id: 'roofing',     label: 'Tak',      icon: Home },
  { id: 'other',       label: 'Allround', icon: Wrench },
]

export default function Step2Business({ onNext, onBack, data, setData }: Step2Props) {
  const searchParams = useSearchParams()
  const refCode = searchParams?.get('ref') || ''
  const fileRef = useRef<HTMLInputElement>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(data.logoDataUrl || null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showAccount, setShowAccount] = useState(false)

  const update = (updates: Partial<OnboardingFormData>) =>
    setData(d => ({ ...d, ...updates }))

  const formatOrg = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 10)
    return digits.length > 6 ? `${digits.slice(0, 6)}-${digits.slice(6)}` : digits
  }

  const formatPhone = (v: string) => {
    let digits = v.replace(/\D/g, '')
    if (digits.startsWith('0')) digits = '46' + digits.substring(1)
    if (!digits.startsWith('46') && digits.length > 0) digits = '46' + digits
    if (digits.length === 0) return ''
    if (digits.length <= 2) return '+' + digits
    if (digits.length <= 4) return '+' + digits.substring(0, 2) + ' ' + digits.substring(2)
    if (digits.length <= 7) return '+' + digits.substring(0, 2) + ' ' + digits.substring(2, 4) + ' ' + digits.substring(4)
    return '+' + digits.substring(0, 2) + ' ' + digits.substring(2, 4) + ' ' + digits.substring(4, 7) + ' ' + digits.substring(7, 9) + ' ' + digits.substring(9, 11)
  }

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setLogoPreview(result)
      update({ logoDataUrl: result })
    }
    reader.readAsDataURL(f)
  }

  const validBusiness = !!(
    data.companyName?.trim() &&
    data.trade &&
    data.orgNumber?.length === 11 &&
    data.area?.trim()
  )

  const validAccount = !!(
    data.contactName?.trim() &&
    data.email?.trim() &&
    data.password &&
    data.password.length >= 6 &&
    data.phone &&
    data.phone.replace(/\D/g, '').length >= 10
  )

  // Already-registered users (auth-resume) skippar account-sektionen
  const alreadyRegistered = !!data.businessId

  const valid = validBusiness && (alreadyRegistered || validAccount)

  async function handleSubmit() {
    if (!valid || submitting) return
    setError('')

    if (alreadyRegistered) {
      onNext()
      return
    }

    setSubmitting(true)
    try {
      const cleanPhone = '+' + (data.phone || '').replace(/\D/g, '')
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          data: {
            email: data.email,
            password: data.password,
            businessName: data.companyName,
            displayName: data.companyName,
            contactName: data.contactName,
            phone: cleanPhone,
            branch: data.trade,
            serviceArea: data.area,
            referralCode: refCode || undefined,
          },
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Något gick fel')

      update({
        businessId: result.businessId,
        emailPending: !!result.emailConfirmationPending,
      })
      onNext()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Något gick fel vid registrering')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="ob-screen">
      <OnboardingHeader step={0} total={4} onBack={onBack} />
      <div className="ob-body">
        <h1 className="ob-headline">Berätta om ditt företag</h1>
        <p className="ob-sub">
          <Clock size={14} /> Tar ca 60 sekunder
        </p>

        {error && (
          <div
            style={{
              background: 'var(--ob-rose-50)',
              border: '1px solid #FECACA',
              borderRadius: 'var(--ob-r-md)',
              padding: 12,
              fontSize: 13,
              color: '#B91C1C',
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {/* Logo */}
        <div className="ob-field">
          <label className="ob-label">Logotyp</label>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: '1.5px dashed var(--ob-border-strong)',
              borderRadius: 'var(--ob-r-lg)',
              padding: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              cursor: 'pointer',
              background: logoPreview ? 'var(--ob-surface)' : 'var(--ob-bg)',
              transition: 'all var(--ob-t-fast)',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 'var(--ob-r-md)',
                background: logoPreview
                  ? `url(${logoPreview}) center/cover`
                  : 'var(--ob-primary-50)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--ob-primary-700)',
                fontWeight: 700,
                fontSize: 22,
                flexShrink: 0,
                border: logoPreview ? '1px solid var(--ob-border)' : 'none',
              }}
            >
              {!logoPreview &&
                (data.companyName?.[0]?.toUpperCase() || <Upload size={20} />)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ob-ink)' }}>
                {logoPreview ? 'Logotyp uppladdad' : 'Ladda upp logotyp'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ob-muted)', marginTop: 2 }}>
                {logoPreview ? 'Klicka för att byta' : 'PNG, JPG eller SVG'}
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleLogo}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        {/* Company name */}
        <div className="ob-field">
          <label className="ob-label">Företagsnamn</label>
          <input
            className="ob-input"
            placeholder="t.ex. Andreas Bygg AB"
            value={data.companyName || ''}
            onChange={e => update({ companyName: e.target.value })}
          />
        </div>

        {/* Trade tiles */}
        <div className="ob-field">
          <label className="ob-label">Bransch</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {TRADES.map(t => {
              const TIcon = t.icon
              return (
                <button
                  type="button"
                  key={t.id}
                  className={`ob-tile ${data.trade === t.id ? 'selected' : ''}`}
                  onClick={() => update({ trade: t.id })}
                >
                  <span className="ob-tile-icon">
                    <TIcon size={22} />
                  </span>
                  <span className="ob-tile-label">{t.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Org number */}
        <div className="ob-field">
          <label className="ob-label">Organisationsnummer</label>
          <input
            className="ob-input"
            placeholder="XXXXXX-XXXX"
            inputMode="numeric"
            value={data.orgNumber || ''}
            onChange={e => update({ orgNumber: formatOrg(e.target.value) })}
          />
        </div>

        {/* F-skatt */}
        <div className="ob-field">
          <div
            className="ob-toggle"
            onClick={() => update({ fSkatt: data.fSkatt === false })}
          >
            <div>
              <div className="ob-toggle-label">F-skattsedel</div>
              <div className="ob-toggle-help">Vi visar för kunderna att du är godkänd</div>
            </div>
            <div className={`ob-switch ${data.fSkatt !== false ? 'on' : ''}`} />
          </div>
        </div>

        {/* Area */}
        <div className="ob-field">
          <label className="ob-label">Tjänsteområde</label>
          <div style={{ position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--ob-subtle)',
              }}
            >
              <MapPin size={18} />
            </span>
            <input
              className="ob-input"
              style={{ paddingLeft: 42 }}
              placeholder="t.ex. Stockholm eller 11122"
              value={data.area || ''}
              onChange={e => update({ area: e.target.value })}
            />
          </div>
          <p className="ob-help">Lisa berättar för kunder var du jobbar</p>
        </div>

        {/* Account section — endast om inte redan registrerad */}
        {!alreadyRegistered && (
          <>
            <div className="ob-divider" />

            <button
              type="button"
              onClick={() => setShowAccount(s => !s)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'transparent',
                border: 'none',
                padding: '0 0 12px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ob-ink)' }}>
                  Skapa konto
                </div>
                <div style={{ fontSize: 12, color: 'var(--ob-muted)', marginTop: 2 }}>
                  {validAccount ? 'Klart — fortsätt nedan' : 'Vi behöver dina inloggningsuppgifter'}
                </div>
              </div>
              <ChevronDown
                size={20}
                style={{
                  color: 'var(--ob-muted)',
                  transform: showAccount ? 'rotate(180deg)' : 'none',
                  transition: 'transform var(--ob-t-fast)',
                }}
              />
            </button>

            {(showAccount || !validAccount) && (
              <div style={{ animation: 'ob-fade-in 280ms' }}>
                <div className="ob-field">
                  <label className="ob-label">Ditt namn</label>
                  <div style={{ position: 'relative' }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: 14,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--ob-subtle)',
                      }}
                    >
                      <User size={18} />
                    </span>
                    <input
                      className="ob-input"
                      style={{ paddingLeft: 42 }}
                      placeholder="Förnamn Efternamn"
                      value={data.contactName || ''}
                      onChange={e => update({ contactName: e.target.value })}
                    />
                  </div>
                </div>

                <div className="ob-field">
                  <label className="ob-label">E-post</label>
                  <div style={{ position: 'relative' }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: 14,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--ob-subtle)',
                      }}
                    >
                      <Mail size={18} />
                    </span>
                    <input
                      className="ob-input"
                      style={{ paddingLeft: 42 }}
                      type="email"
                      placeholder="din@epost.se"
                      autoComplete="email"
                      value={data.email || ''}
                      onChange={e => update({ email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="ob-field">
                  <label className="ob-label">Privat mobilnummer</label>
                  <div style={{ position: 'relative' }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: 14,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--ob-subtle)',
                      }}
                    >
                      <Phone size={18} />
                    </span>
                    <input
                      className="ob-input"
                      style={{ paddingLeft: 42 }}
                      type="tel"
                      placeholder="+46 70 123 45 67"
                      value={data.phone || ''}
                      onChange={e => update({ phone: formatPhone(e.target.value) })}
                    />
                  </div>
                  <p className="ob-help">Lisa kopplar vidare till detta nummer vid behov</p>
                </div>

                <div className="ob-field">
                  <label className="ob-label">Lösenord</label>
                  <div style={{ position: 'relative' }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: 14,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--ob-subtle)',
                      }}
                    >
                      <Lock size={18} />
                    </span>
                    <input
                      className="ob-input"
                      style={{ paddingLeft: 42 }}
                      type="password"
                      placeholder="Minst 6 tecken"
                      autoComplete="new-password"
                      value={data.password || ''}
                      onChange={e => update({ password: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="ob-footer">
        <button
          type="button"
          className="ob-cta"
          disabled={!valid || submitting}
          onClick={handleSubmit}
        >
          {submitting ? (
            <>
              <Loader2 size={18} className="animate-spin" /> Skapar konto…
            </>
          ) : (
            <>
              Fortsätt <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
