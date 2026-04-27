'use client'

import { useState } from 'react'
import { ArrowLeft, ChevronRight, FileText, Sparkles } from 'lucide-react'
import { formatCurrency, formatDate, getQuoteStatusText, getQuoteStatusColor } from '../helpers'
import type { Quote } from '../types'
import PortalQuoteSigningModal from './PortalQuoteSigningModal'

interface PortalQuotesListProps {
  quotes: Quote[]
  customerName: string
  onBack: () => void
  onSigned: () => void
}

/**
 * Offert-lista (port av bp-quotes.jsx).
 * Klick på pending-offert öppnar bottom-sheet PortalQuoteSigningModal.
 */
export default function PortalQuotesList({
  quotes,
  customerName,
  onBack,
  onSigned,
}: PortalQuotesListProps) {
  const [signing, setSigning] = useState<Quote | null>(null)
  const [signSuccess, setSignSuccess] = useState<string | null>(null)

  return (
    <>
      <div className="bp-header">
        <button
          type="button"
          onClick={onBack}
          className="bp-icon-btn"
          style={{ background: 'transparent', border: 'none' }}
          aria-label="Tillbaka"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="bp-brand">
          <div className="bp-brand-name">Offerter</div>
          <div className="bp-brand-sub">{quotes.length} totalt</div>
        </div>
      </div>

      <div className="bp-body">
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {quotes.length === 0 ? (
            <div className="text-center" style={{ padding: '40px 20px', color: 'var(--muted)' }}>
              <FileText size={40} style={{ color: 'var(--border-strong)', margin: '0 auto 8px' }} />
              <p>Inga offerter just nu.</p>
            </div>
          ) : (
            quotes.map((q, i) => {
              const isPending = ['sent', 'opened'].includes(q.status)
              return (
                <div
                  key={q.quote_id}
                  className={`bp-card ${isPending && q.sign_token ? 'bp-card-tap' : ''}`}
                  onClick={() => isPending && q.sign_token && setSigning(q)}
                  style={{
                    padding: 0,
                    overflow: 'hidden',
                    animation: `bp-slide-up 400ms ${i * 80}ms both`,
                  }}
                >
                  <div style={{ padding: 16 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        marginBottom: 8,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 700,
                            color: 'var(--ink)',
                            letterSpacing: '-0.01em',
                          }}
                        >
                          {q.title || 'Offert'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                          {q.sent_at ? `Skickad ${formatDate(q.sent_at)}` : `Skapad ${formatDate(q.created_at)}`}
                          {q.valid_until && ` · Giltig till ${formatDate(q.valid_until)}`}
                        </div>
                      </div>
                      <span className={`bp-badge ${q.status === 'accepted' ? 'green' : isPending ? 'amber' : 'gray'}`}>
                        {signSuccess === q.quote_id ? 'Signerad!' : getQuoteStatusText(q.status)}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 6,
                        marginTop: 12,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 26,
                          fontWeight: 700,
                          color: 'var(--ink)',
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {(q.customer_pays || q.total).toLocaleString('sv-SE')}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>kr inkl. moms</span>
                    </div>
                  </div>

                  {q.rot_rut_type && q.rot_rut_deduction > 0 && (
                    <div
                      style={{
                        padding: '10px 16px',
                        background: 'var(--green-50)',
                        borderTop: '1px solid var(--green-100)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <Sparkles size={14} style={{ color: 'var(--green-600)' }} />
                      <span style={{ fontSize: 12, color: 'var(--green-600)', fontWeight: 600 }}>
                        {q.rot_rut_type.toUpperCase()}-avdrag {formatCurrency(q.rot_rut_deduction)} ingår
                      </span>
                    </div>
                  )}

                  {isPending && q.sign_token && (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderTop: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--bee-700)' }}>
                        Granska & signera
                      </span>
                      <ChevronRight size={16} style={{ color: 'var(--bee-700)' }} />
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {signing && signing.sign_token && (
        <PortalQuoteSigningModal
          quote={signing}
          initialSignerName={customerName}
          onSigned={(id) => {
            setSignSuccess(id)
            setSigning(null)
            onSigned()
          }}
          onClose={() => setSigning(null)}
        />
      )}
    </>
  )
}
