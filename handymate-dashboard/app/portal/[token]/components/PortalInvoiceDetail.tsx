'use client'

import { ArrowLeft, Clock, Download } from 'lucide-react'
import PortalSwishBlock from './PortalSwishBlock'
import { formatCurrency, formatDate } from '../helpers'
import type { Invoice, PaymentInfo } from '../types'

interface PortalInvoiceDetailProps {
  invoice: Invoice
  paymentInfo: PaymentInfo
  onBack: () => void
}

/**
 * Faktura-detaljvy (port av bp-invoice.jsx).
 * Hero-belopp + breakdown (Total / ROT / Att betala) + Swish-block + Bankgiro.
 */
export default function PortalInvoiceDetail({
  invoice: inv,
  paymentInfo,
  onBack,
}: PortalInvoiceDetailProps) {
  const total = inv.total
  const rot = inv.rot_rut_deduction || 0
  const toPay = inv.customer_pays || (total - rot)
  const ocrNumber = inv.ocr_number || inv.invoice_number
  const overdue = inv.status === 'overdue'

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
          <div className="bp-brand-name">Faktura #{inv.invoice_number}</div>
          <div className="bp-brand-sub">{inv.status === 'paid' ? 'Betald' : 'Att betala'}</div>
        </div>
        <button type="button" className="bp-icon-btn" aria-label="Ladda ner">
          <Download size={18} />
        </button>
      </div>

      <div className="bp-body">
        {/* Hero amount */}
        <div style={{ padding: '24px 18px 18px', textAlign: 'center' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--muted)',
              letterSpacing: '0.1em',
              marginBottom: 8,
            }}
          >
            ATT BETALA
          </div>
          <div
            style={{
              fontSize: 44,
              fontWeight: 700,
              color: 'var(--ink)',
              letterSpacing: '-0.03em',
              lineHeight: 1,
            }}
          >
            {Math.round(toPay).toLocaleString('sv-SE')}
            <span
              style={{
                fontSize: 20,
                color: 'var(--muted)',
                fontWeight: 500,
                marginLeft: 4,
              }}
            >
              kr
            </span>
          </div>
          <div
            style={{
              marginTop: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 'var(--r-pill)',
              background: overdue ? 'var(--red-50)' : 'var(--bee-50)',
              color: overdue ? 'var(--red-600)' : 'var(--bee-700)',
            }}
          >
            <Clock size={14} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              {inv.status === 'paid'
                ? `Betald ${inv.paid_at ? formatDate(inv.paid_at) : ''}`
                : `Förfaller ${formatDate(inv.due_date)}`}
            </span>
          </div>
        </div>

        {/* Breakdown */}
        <div style={{ padding: '0 18px 18px' }}>
          <div className="bp-card" style={{ padding: 0 }}>
            {[
              { label: 'Total summa', val: formatCurrency(total) },
              ...(rot > 0
                ? [{
                    label: `${(inv.rot_rut_type || 'rot').toUpperCase()}-avdrag`,
                    val: `−${formatCurrency(rot)}`,
                    green: true,
                  }]
                : []),
              { label: 'Att betala', val: formatCurrency(toPay), bold: true },
            ].map((r, i, a) => (
              <div
                key={i}
                style={{
                  padding: 14,
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: i < a.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: r.bold ? 'var(--ink)' : 'var(--muted)',
                    fontWeight: r.bold ? 700 : 500,
                  }}
                >
                  {r.label}
                </span>
                <span
                  style={{
                    fontSize: r.bold ? 15 : 13,
                    fontWeight: r.bold ? 700 : 600,
                    color: r.green ? 'var(--green-600)' : 'var(--ink)',
                  }}
                >
                  {r.val}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Swish block */}
        {inv.status !== 'paid' && paymentInfo.swish && (
          <div style={{ padding: '0 18px 18px' }}>
            <PortalSwishBlock
              swishNumber={paymentInfo.swish}
              amount={toPay}
              invoiceNumber={inv.invoice_number}
            />
          </div>
        )}

        {/* Bankgiro alt */}
        {inv.status !== 'paid' && (paymentInfo.bankgiro || paymentInfo.plusgiro) && (
          <div style={{ padding: '0 18px 18px' }}>
            <div className="bp-card">
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--muted)',
                  letterSpacing: '0.06em',
                  marginBottom: 10,
                }}
              >
                ELLER VIA {paymentInfo.bankgiro ? 'BANKGIRO' : 'PLUSGIRO'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                    {paymentInfo.bankgiro ? 'Bankgiro' : 'Plusgiro'}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      fontFamily: 'ui-monospace, monospace',
                      marginTop: 2,
                    }}
                  >
                    {paymentInfo.bankgiro || paymentInfo.plusgiro}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>OCR-nummer</div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      fontFamily: 'ui-monospace, monospace',
                      marginTop: 2,
                    }}
                  >
                    {ocrNumber}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Download PDF */}
        <div style={{ padding: '0 18px 24px' }}>
          <a
            className="bp-cta ghost"
            href={`/api/invoices/pdf?id=${inv.invoice_id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download size={18} /> Ladda ner PDF-faktura
          </a>
        </div>
      </div>
    </>
  )
}
