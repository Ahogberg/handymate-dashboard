'use client'

import { useState } from 'react'
import { Check, Clock, Copy, FileText, Mail, MapPin, MessageCircle, Phone, Shield } from 'lucide-react'
import PortalShellHeader from './PortalShellHeader'
import PortalHandymateAttribution from './PortalHandymateAttribution'
import type { PortalData, WorkingHoursDay } from '../types'

interface PortalContactProps {
  portal: PortalData
  onChat: () => void
}

const DAY_LABELS: Record<string, string> = {
  monday: 'Måndag',
  tuesday: 'Tisdag',
  wednesday: 'Onsdag',
  thursday: 'Torsdag',
  friday: 'Fredag',
  saturday: 'Lördag',
  sunday: 'Söndag',
}

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

/**
 * Kontakt-vy (port av bp-contact.jsx).
 * Stora kontakt-kortet + kontaktuppgifter med copy-knapp + trust-badges
 * (bara F-skatt visas för MVP) + öppettider.
 */
export default function PortalContact({ portal, onChat }: PortalContactProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const business = portal.business

  function copy(key: string, value: string) {
    if (navigator.clipboard) navigator.clipboard.writeText(value).catch(() => {})
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  // Kontaktrader
  const contactRows = [
    business.phone && {
      icon: Phone,
      label: 'Telefon',
      value: business.phone,
      copyVal: business.phone.replace(/\s/g, ''),
      key: 'tel',
    },
    business.email && {
      icon: Mail,
      label: 'E-post',
      value: business.email,
      copyVal: business.email,
      key: 'mail',
    },
    business.address && {
      icon: MapPin,
      label: 'Adress',
      value: business.address,
      copyVal: business.address,
      key: 'addr',
    },
    business.orgNumber && {
      icon: FileText,
      label: 'Org.nr',
      value: business.orgNumber,
      copyVal: business.orgNumber.replace(/\D/g, ''),
      key: 'org',
    },
  ].filter(Boolean) as Array<{ icon: typeof Phone; label: string; value: string; copyVal: string; key: string }>

  // Öppettider
  const hours = business.workingHours || null
  const isOpenNow = (() => {
    if (!hours) return false
    const now = new Date()
    const dayKey = DAY_KEYS[(now.getDay() + 6) % 7] // mån = 0
    const today = hours[dayKey] as WorkingHoursDay | undefined
    if (!today || !today.active) return false
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const [sh, sm] = (today.start || '0:0').split(':').map(Number)
    const [eh, em] = (today.end || '0:0').split(':').map(Number)
    return nowMinutes >= sh * 60 + sm && nowMinutes < eh * 60 + em
  })()

  const initial = (business.contactName || business.name || 'H').charAt(0).toUpperCase()

  return (
    <>
      <PortalShellHeader
        business={business}
        unreadMessages={portal.unreadMessages}
      />

      <div className="bp-body">
        {/* Contractor card */}
        <div style={{ padding: '20px 18px 0' }}>
          <div
            className="bp-card"
            style={{
              padding: 20,
              textAlign: 'center',
              background: 'linear-gradient(180deg, var(--bee-50) 0%, var(--surface) 100%)',
              borderColor: 'var(--bee-100)',
            }}
          >
            <div
              style={{
                width: 76,
                height: 76,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--bee-500), var(--bee-700))',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 30,
                margin: '0 auto 14px',
                boxShadow: '0 8px 20px rgba(217,119,6,0.25)',
                overflow: 'hidden',
              }}
            >
              {business.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={business.logoUrl}
                  alt={business.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                initial
              )}
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: '-0.01em',
                marginBottom: 2,
              }}
            >
              {business.contactName || business.name}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
              {business.contactName ? `Kontaktperson · ${business.name}` : 'Hantverkare'}
            </div>

            {/* Primary actions */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: business.phone ? '1fr 1fr' : '1fr',
                gap: 10,
                marginTop: 18,
              }}
            >
              {business.phone && (
                <a
                  href={`tel:${business.phone}`}
                  className="bp-cta bee"
                  style={{ height: 46, fontSize: 14, textDecoration: 'none' }}
                >
                  <Phone size={16} />
                  Ring
                </a>
              )}
              <button
                type="button"
                onClick={onChat}
                className="bp-cta ghost"
                style={{ height: 46, fontSize: 14 }}
              >
                <MessageCircle size={16} />
                Chatta
              </button>
            </div>

            {isOpenNow && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  marginTop: 14,
                  fontSize: 11,
                  color: 'var(--green-600)',
                }}
              >
                <span className="bp-live-dot" />
                <span style={{ fontWeight: 600 }}>Öppet nu · Svarar oftast samma dag</span>
              </div>
            )}
          </div>
        </div>

        {/* Contact details */}
        {contactRows.length > 0 && (
          <>
            <div
              style={{
                padding: '20px 18px 8px',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Kontaktuppgifter
            </div>
            <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {contactRows.map(row => (
                <div
                  key={row.key}
                  className="bp-card"
                  style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: 'var(--bee-50)',
                      color: 'var(--bee-700)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <row.icon size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>{row.label}</div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--ink)',
                        marginTop: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.value}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copy(row.key, row.copyVal)}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      border: 'none',
                      background: copied === row.key ? 'var(--green-50)' : 'var(--bg)',
                      color: copied === row.key ? 'var(--green-600)' : 'var(--muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition: 'all var(--t-fast)',
                    }}
                  >
                    {copied === row.key ? <Check size={14} strokeWidth={3} /> : <Copy size={14} />}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Trust */}
        {business.fSkatt && (
          <>
            <div
              style={{
                padding: '20px 18px 8px',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Behörigheter
            </div>
            <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                className="bp-card"
                style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: 'var(--green-50)',
                    color: 'var(--green-600)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Shield size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>F-skattsedel</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
                    Verifierad · Skatteverket
                  </div>
                </div>
                <Check size={16} strokeWidth={3} style={{ color: 'var(--green-600)', flexShrink: 0 }} />
              </div>
            </div>
          </>
        )}

        {/* Hours */}
        {hours && (
          <div style={{ padding: '20px 18px 0' }}>
            <div className="bp-card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Clock size={16} style={{ color: 'var(--muted)' }} />
                <div style={{ fontSize: 13, fontWeight: 600 }}>Öppettider</div>
                {isOpenNow && (
                  <span className="bp-badge green" style={{ marginLeft: 'auto' }}>
                    Öppet nu
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--ink-2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {DAY_KEYS.map(k => {
                  const day = hours[k] as WorkingHoursDay | undefined
                  const value = day?.active ? `${day.start}–${day.end}` : 'Stängt'
                  return (
                    <div
                      key={k}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '4px 0',
                      }}
                    >
                      <span style={{ color: 'var(--muted)', fontWeight: 500 }}>{DAY_LABELS[k]}</span>
                      <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{value}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        <PortalHandymateAttribution />
      </div>
    </>
  )
}
