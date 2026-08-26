'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Clock, Download, Loader2 } from 'lucide-react'
import QuoteDocument from '@/components/quotes/document/QuoteDocument'
import { DocumentScaler } from '@/components/quotes/document/DocumentScaler'
import type { InvoiceTemplateData } from '@/lib/invoice-templates/types'
import PortalSwishBlock from './PortalSwishBlock'
import { formatCurrency, formatDate } from '../helpers'
import type { Invoice, PaymentInfo } from '../types'
import { isCustomerSettled } from '@/lib/invoices/status'

interface PortalInvoiceDetailProps {
  invoice: Invoice
  paymentInfo: PaymentInfo
  token: string
  onBack: () => void
}

interface InvoiceDocumentResponse {
  template_data: (InvoiceTemplateData & { docType: 'invoice' }) | null
  template_style: 'modern' | 'premium' | 'friendly'
  document_html: string | null
}

/**
 * Faktura-detaljvy (port av bp-invoice.jsx).
 * Dokumentkort (motorn) överst + hero-belopp + breakdown (Total / ROT / Att
 * betala) + Swish-block + Bankgiro (interaktiva lagret).
 *
 * ETAPP 6b (offert-masterplan.md, faktura-sprinten): PDF-nedladdningen var
 * TRASIG sedan starten — länken skickade `?id=` men /api/invoices/pdf
 * läser `invoiceId` (alltid 400) och saknade dessutom `format=pdf` (hade
 * annars gett HTML, inte en nedladdningsbar fil). Routen är redan publik/
 * token-lös för icke-draft-fakturor (verifierat: getAuthenticatedBusiness
 * saknas → faller tillbaka till statusfilter, ingen extra auth-mekanik
 * behövdes här).
 *
 * ETAPP 6e: dokumentmotorn (samma QuoteDocument/DocumentScaler som
 * Fakturarummet, docType='invoice') hämtas LAZY från
 * /api/portal/[token]/invoices/[id] (bygger buildInvoiceTemplateData +
 * ev. Swish-QR server-side) — INTE eagert för alla fakturor i listan (se
 * kommentar i den routen: Swish-QR-generering per faktura är inte gratis).
 *
 * Dubbelvisning, medvetet BEHÅLLEN (inte en bugg): dokumentet renderar
 * SINA EGNA statiska betalinstruktioner (InvoicePaymentSection — OCR/
 * bankgiro/Swish som text, "så här ser fakturan faktiskt ut") medan
 * PortalSwishBlock/bankgiro-kortet nedan är det INTERAKTIVA lagret
 * (klickbar Swish-deep link, kopierbara fält, "Jag har betalat"-claim).
 * Samma resonemang som offertens kundvy (PublicQuoteDocument): dokumentet
 * är fakturans juridiska/visuella sanning, korten är verktyg ovanpå den.
 */
export default function PortalInvoiceDetail({
  invoice: inv,
  paymentInfo,
  token,
  onBack,
}: PortalInvoiceDetailProps) {
  const total = inv.total
  const rot = inv.rot_rut_deduction || 0
  const toPay = inv.customer_pays || (total - rot)
  const ocrNumber = inv.ocr_number || inv.invoice_number
  const overdue = inv.status === 'overdue'
  const pdfHref = `/api/invoices/pdf?invoiceId=${inv.invoice_id}&format=pdf`

  const [doc, setDoc] = useState<InvoiceDocumentResponse | null>(null)
  const [docLoading, setDocLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setDoc(null)
    setDocLoading(true)
    fetch(`/api/portal/${token}/invoices/${inv.invoice_id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled) setDoc(data) })
      .catch(() => { if (!cancelled) setDoc(null) })
      .finally(() => { if (!cancelled) setDocLoading(false) })
    return () => { cancelled = true }
  }, [token, inv.invoice_id])

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
          <div className="bp-brand-sub">{isCustomerSettled(inv.status) ? 'Betald' : 'Att betala'}</div>
        </div>
        <a
          href={pdfHref}
          target="_blank"
          rel="noopener noreferrer"
          className="bp-icon-btn"
          aria-label="Ladda ner PDF"
        >
          <Download size={18} />
        </a>
      </div>

      <div className="bp-body">
        {/* Dokumentkort — ETAPP 6e: samma dokumentmotor som Fakturarummet/PDF:en,
            inbäddat som en yta i portalskalet (bp-*-CSS + navigering behålls
            oförändrat runt kortet). Modern: QuoteDocument static + DocumentScaler
            (skalar A4 till kortets bredd). Premium/Friendly: färdig HTML-sträng
            i en sandboxad iframe (samma mönster som PublicQuoteDocument, E5). */}
        <div style={{ padding: '16px 18px 4px' }}>
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-lg)',
              overflow: 'auto',
              padding: 10,
            }}
          >
            {docLoading ? (
              <DocumentSkeleton />
            ) : doc?.template_style === 'modern' ? (
              doc.template_data ? (
                <DocumentScaler>
                  <QuoteDocument data={doc.template_data} mode="static" />
                </DocumentScaler>
              ) : (
                <DocumentSkeleton />
              )
            ) : doc?.document_html ? (
              <iframe
                srcDoc={doc.document_html}
                // sandbox utan allow-scripts — ren statisk rendering, samma
                // regel som PublicQuoteDocument (app/quote/[token]).
                sandbox=""
                title={`Faktura ${inv.invoice_number}`}
                style={{
                  width: '100%',
                  aspectRatio: '210 / 297',
                  border: 'none',
                  borderRadius: 8,
                  background: '#fff',
                  display: 'block',
                }}
              />
            ) : (
              <DocumentSkeleton />
            )}
          </div>
        </div>

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
              {isCustomerSettled(inv.status)
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
        {!isCustomerSettled(inv.status) && paymentInfo.swish && (
          <div style={{ padding: '0 18px 18px' }}>
            <PortalSwishBlock
              swishNumber={paymentInfo.swish}
              amount={toPay}
              invoiceNumber={inv.invoice_number}
              invoiceId={inv.invoice_id}
              token={token}
            />
          </div>
        )}

        {/* Bankgiro alt */}
        {!isCustomerSettled(inv.status) && (paymentInfo.bankgiro || paymentInfo.plusgiro) && (
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
            href={pdfHref}
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

function DocumentSkeleton() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 0',
      }}
    >
      <Loader2 size={20} className="animate-spin" style={{ color: 'var(--muted)' }} />
    </div>
  )
}
