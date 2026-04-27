'use client'

import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { formatCurrency } from '../helpers'

interface PortalSwishBlockProps {
  swishNumber: string
  amount: number
  invoiceNumber: string
}

/**
 * Mörkt Swish-block med riktig QR från /api/swish-qr.
 * Bevarar Claude Designs estetik (gradient + Swish-rosa "S"-logo).
 */
export default function PortalSwishBlock({
  swishNumber,
  amount,
  invoiceNumber,
}: PortalSwishBlockProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    const url = `/api/swish-qr?number=${encodeURIComponent(swishNumber)}&amount=${Math.round(amount)}&message=${encodeURIComponent(invoiceNumber)}`
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.qr) setQrDataUrl(d.qr) })
      .catch(() => {})
  }, [swishNumber, amount, invoiceNumber])

  function copy(key: string, value: string) {
    if (navigator.clipboard) navigator.clipboard.writeText(value).catch(() => {})
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  const swishDataString = JSON.stringify({
    version: 1,
    payee: { value: swishNumber.replace(/\D/g, '') },
    amount: { value: Math.round(amount) },
    message: { value: invoiceNumber },
  })
  const swishUrl = `swish://payment?data=${encodeURIComponent(swishDataString)}`

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #0F172A, #1E293B)',
        borderRadius: 'var(--r-2xl)',
        padding: 20,
        color: '#fff',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: '#EE3A88',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: 11,
            color: '#fff',
          }}
        >
          S
        </div>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Betala med Swish</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Snabbast</span>
      </div>

      <div
        style={{
          background: '#fff',
          borderRadius: 'var(--r-md)',
          padding: 12,
          display: 'flex',
          justifyContent: 'center',
          marginBottom: 14,
        }}
      >
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="Swish QR" width={150} height={150} />
        ) : (
          <div
            style={{
              width: 150,
              height: 150,
              background: '#F1F5F9',
              borderRadius: 6,
              animation: 'bp-shimmer 1.4s infinite',
            }}
          />
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {([
          { k: 'swish',  label: 'Swish-nummer', val: swishNumber },
          { k: 'amount', label: 'Belopp',       val: formatCurrency(amount) },
          { k: 'msg',    label: 'Meddelande',   val: invoiceNumber },
        ] as const).map(r => (
          <div
            key={r.k}
            onClick={() => copy(r.k, r.val)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 0',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{r.label}</span>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: 'ui-monospace, monospace',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {r.val}
              <span style={{ color: copied === r.k ? '#10B981' : 'rgba(255,255,255,0.4)' }}>
                {copied === r.k ? <Check size={13} strokeWidth={3} /> : <Copy size={13} />}
              </span>
            </span>
          </div>
        ))}
      </div>

      <a
        href={swishUrl}
        style={{
          marginTop: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          width: '100%',
          padding: '12px 16px',
          background: '#EE3A88',
          color: '#fff',
          borderRadius: 'var(--r-md)',
          fontWeight: 600,
          fontSize: 14,
          textDecoration: 'none',
        }}
      >
        Öppna Swish
      </a>
    </div>
  )
}
