'use client'

import { useEffect, useState } from 'react'
import { Repeat } from 'lucide-react'
import type { PortalAgreement } from '../types'

interface PortalAgreementsProps {
  token: string
}

const formatVisitDate = (iso: string) =>
  new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(n)

/**
 * Serviceavtal-sektion på portalens hem (Motor 2, Etapp 2).
 *
 * Visas ENDAST när kunden har minst ett aktivt avtal — annars renderas
 * ingenting alls (ingen tom yta, se spec). Mobil-först, samma bp-card-
 * mönster som övriga PortalHome-sektioner.
 *
 * Pris visas INKL. moms — portalen är kundvänd (se lib/agreements/pricing.ts
 * och app/api/portal/[token]/agreements/route.ts).
 */
export default function PortalAgreements({ token }: PortalAgreementsProps) {
  const [agreements, setAgreements] = useState<PortalAgreement[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch(`/api/portal/${token}/agreements`)
      .then((r) => (r.ok ? r.json() : { agreements: [] }))
      .then((data) => {
        if (cancelled) return
        setAgreements(data.agreements || [])
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  // Ingen tom yta: innan laddat klart eller utan aktiva avtal — rendera inget.
  if (!loaded || agreements.length === 0) return null

  return (
    <div style={{ padding: '24px 18px 0' }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
        Serviceavtal
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {agreements.map((a) => (
          <div
            key={a.agreement_id}
            className="bp-card"
            style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: 'var(--bee-50)',
                  color: 'var(--bee-700)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Repeat size={14} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{a.title}</div>
            </div>

            {a.next_visit_at && (
              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                Nästa besök: <strong>{formatVisitDate(a.next_visit_at)}</strong>
              </div>
            )}

            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              Vi hör av oss inför varje besök
            </div>

            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bee-700)' }}>
              {formatCurrency(a.price_incl_vat)} / besök
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
