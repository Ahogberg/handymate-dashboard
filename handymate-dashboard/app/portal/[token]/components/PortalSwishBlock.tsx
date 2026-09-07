'use client'

import { useEffect, useState } from 'react'
import { formatCurrency } from '../helpers'

interface PortalSwishBlockProps {
  swishNumber: string
  amount: number
  invoiceNumber: string
}

/**
 * "Betala med Swish" — portalens beslutskort (Design 2026-09-07).
 * Mörkt kort med EN vit knapp som öppnar Swish med belopp och meddelande
 * förifyllda. På mobilen visas aldrig en QR-kod (man kan inte skanna sin
 * egen skärm); på desktop (≥768 px) läggs den till som "Skanna med Swish".
 * Kopieringsraderna är reserven när deeplinken inte fungerar.
 *
 * "Jag har betalat" ligger utanför blocket (PortalInvoiceDetail) — den
 * gäller lika mycket för bankgiro.
 */
export default function PortalSwishBlock({ swishNumber, amount, invoiceNumber }: PortalSwishBlockProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [desktop, setDesktop] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(min-width: 768px)')
    const sync = () => setDesktop(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])

  useEffect(() => {
    if (!desktop) return
    const url = `/api/swish-qr?number=${encodeURIComponent(swishNumber)}&amount=${Math.round(amount)}&message=${encodeURIComponent(invoiceNumber)}`
    let cancelled = false
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d?.qr) setQrDataUrl(d.qr) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [desktop, swishNumber, amount, invoiceNumber])

  function copy(key: string, value: string) {
    if (navigator.clipboard) navigator.clipboard.writeText(value).catch(() => {})
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const swishDataString = JSON.stringify({
    version: 1,
    payee: { value: swishNumber.replace(/\D/g, '') },
    amount: { value: Math.round(amount) },
    message: { value: invoiceNumber },
  })
  const swishUrl = `swish://payment?data=${encodeURIComponent(swishDataString)}`

  return (
    <div style={{ background: '#0F172A', borderRadius: 16, padding: 18, color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 17, fontWeight: 700 }}>Betala med Swish</span>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>Snabbast</span>
      </div>

      {desktop && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="Swish QR-kod" width={150} height={150} />
          ) : (
            <div style={{ width: 150, height: 150, background: '#F1F5F9', borderRadius: 6, animation: 'bp-shimmer 1.4s infinite' }} />
          )}
          <span style={{ fontSize: 12.5, color: '#475569' }}>Skanna med Swish</span>
        </div>
      )}

      <a
        href={swishUrl}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 52, borderRadius: 12,
          background: '#fff', color: '#0F172A',
          fontSize: 16, fontWeight: 600, textDecoration: 'none',
        }}
      >
        Öppna Swish · {formatCurrency(amount)}
      </a>
      <div style={{ marginTop: 8, textAlign: 'center', fontSize: 12.5, color: 'rgba(255,255,255,0.7)' }}>
        Belopp och meddelande är förifyllda.
      </div>

      <div style={{ marginTop: 10 }}>
        {([
          { k: 'swish', label: 'Swish-nummer', val: swishNumber },
          { k: 'msg', label: 'Meddelande', val: invoiceNumber },
        ] as const).map(r => (
          <div key={r.k} className="bp-copy-row">
            <div>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>{r.label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{r.val}</div>
            </div>
            <button type="button" className="bp-copy-btn" onClick={() => copy(r.k, r.val)}>
              {copied === r.k ? 'Kopierat' : 'Kopiera'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
