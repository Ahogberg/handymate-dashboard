'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Clock, Download, Loader2 } from 'lucide-react'
import QuoteDocument from '@/components/quotes/document/QuoteDocument'
import { DocumentScaler } from '@/components/quotes/document/DocumentScaler'
import type { InvoiceTemplateData } from '@/lib/invoice-templates/types'
import PortalSwishBlock from './PortalSwishBlock'
import PortalFooter from './PortalFooter'
import { formatCurrency, formatDate } from '../helpers'
import type { Invoice, PaymentInfo, PortalAta, PortalData } from '../types'
import { isCustomerSettled } from '@/lib/invoices/status'

interface PortalInvoiceDetailProps {
  invoice: Invoice
  paymentInfo: PaymentInfo
  token: string
  /** Firman + kunden — saknas i den isolerade UI-provningen
      (tests/portal-invoice-recovery.ui.spec.ts), därför valfri. */
  portal?: PortalData | null
  /** Projektets ÄTA — de godkända listas under "Det här ingår". */
  atas?: PortalAta[]
  onBack: () => void
  onClaimed?: () => void | Promise<void>
  onReview?: () => void
}

interface InvoiceDocumentResponse {
  template_data: (InvoiceTemplateData & { docType: 'invoice' }) | null
  template_style: 'modern' | 'premium' | 'friendly'
  document_html: string | null
}

const APPROVED_ATA = new Set(['signed', 'approved', 'invoiced'])

function fornamn(name: string | null | undefined): string {
  return (name || '').trim().split(/\s+/)[0] || ''
}

/** "21 sep" — chipens korta datum utan år. */
function kortDatum(date: string) {
  return new Date(date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

// Inline-ikoner: den isolerade provningen mockar bara fyra lucide-ikoner.
const Chevron = ({ open }: { open: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
)
const Star = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.5l2.95 6.2 6.8.85-5 4.7 1.3 6.75L12 17.7 5.95 21l1.3-6.75-5-4.7 6.8-.85L12 2.5z" />
  </svg>
)

/**
 * Faktura "Att betala" — portalens beslutskort (Design "Kundportal beslut",
 * 2026-09-07). Hero med beloppet och läget (att betala / förfallen / väntar
 * på bekräftelse / betald), "Det här ingår" (offerten + godkända ÄTA + ROT
 * preliminärt), Swish som första val, bankgiro som reserv, "Jag har betalat"
 * som kundens egen markering (vi ser aldrig Swish-betalningar automatiskt —
 * hantverkaren bekräftar) och fakturadokumentet hopfällbart längst ner.
 *
 * Dokumentet (ETAPP 6e) hämtas lazy från /api/portal/[token]/invoices/[id]
 * med återförsök; felet visas som role=alert med "Öppna PDF" som nästa steg
 * (tests/portal-invoice-recovery.ui.spec.ts låser det beteendet).
 */
export default function PortalInvoiceDetail({
  invoice: inv,
  paymentInfo,
  token,
  portal,
  atas = [],
  onBack,
  onClaimed,
  onReview,
}: PortalInvoiceDetailProps) {
  const business = portal?.business
  const firma = business?.name || ''
  const kund = fornamn(portal?.customer?.name)
  const total = inv.total
  const rot = inv.rot_rut_deduction || 0
  const toPay = inv.customer_pays || (total - rot)
  const ocrNumber = inv.ocr_number || inv.invoice_number
  const settled = isCustomerSettled(inv.status)
  const overdue = !settled && (inv.status === 'overdue' || (!!inv.due_date && new Date(inv.due_date).getTime() < Date.now() - 86_400_000))
  const reminderFee = (inv.reminder_count || 0) > 0 && (paymentInfo?.reminder_fee || 0) > 0 ? paymentInfo.reminder_fee : 0
  const pdfHref = `/api/invoices/pdf?invoiceId=${inv.invoice_id}&format=pdf`

  const [claimedAt, setClaimedAt] = useState<string | null>(inv.claimed_at ?? null)
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const claimed = !settled && !!claimedAt

  const [docOpen, setDocOpen] = useState(true)
  const [doc, setDoc] = useState<InvoiceDocumentResponse | null>(null)
  const [docLoading, setDocLoading] = useState(true)
  const [documentAttempt, setDocumentAttempt] = useState(0)

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
  }, [token, inv.invoice_id, documentAttempt])

  useEffect(() => { setClaimedAt(inv.claimed_at ?? null) }, [inv.claimed_at])

  async function claimPaid() {
    if (claiming || claimed) return
    setClaiming(true)
    setClaimError(null)
    try {
      const res = await fetch(`/api/portal/${token}/invoices/${inv.invoice_id}/claim-paid`, { method: 'POST' })
      if (res.ok) {
        setClaimedAt(new Date().toISOString())
        await onClaimed?.()
      } else {
        setClaimError('Det gick inte att markera just nu. Försök igen.')
      }
    } catch {
      setClaimError('Det gick inte att markera just nu. Försök igen.')
    } finally {
      setClaiming(false)
    }
  }

  // "Det här ingår": bara det vi vet. ÄTA-summorna dras av från fakturans
  // total så länge de ryms i den — annars visas bara totalen (inga påhittade
  // belopp).
  const approvedAtas = atas.filter(a => APPROVED_ATA.has(a.status))
  const ataSum = approvedAtas.reduce((s, a) => s + (a.summor?.totalt ?? 0), 0)
  const visaAtaRader = approvedAtas.length > 0 && ataSum > 0 && ataSum < total
  const offertBelopp = visaAtaRader ? total - ataSum : total

  const eyebrow = settled
    ? `Betald${inv.paid_at ? ` ${formatDate(inv.paid_at)}` : ''}`
    : claimed ? 'Väntar på bekräftelse' : overdue ? 'Förfallen' : 'Att betala'
  const chip = settled
    ? { text: 'Kvitto', bg: 'rgba(255,255,255,0.12)', color: '#fff' }
    : overdue
      ? { text: inv.due_date ? `Förföll ${kortDatum(inv.due_date)}` : 'Förfallen', bg: '#FEE2E2', color: '#991B1B' }
      : { text: inv.due_date ? `Förfaller ${kortDatum(inv.due_date)}` : 'Att betala', bg: '#F1F5F9', color: '#334155' }
  const heroSub = settled
    ? `Betald, bekräftad av ${firma || 'hantverkaren'}${inv.paid_at ? ` ${formatDate(inv.paid_at)}` : ''}.${kund ? ` Tack ${kund}.` : ''}`
    : claimed
      ? `Markerad som betald av dig ${formatDate(claimedAt!)}. ${firma || 'Hantverkaren'} bekräftar.`
      : overdue
        ? `Fakturan förföll${inv.due_date ? ` ${formatDate(inv.due_date)}` : ''}.${reminderFee ? ` Påminnelseavgift ${formatCurrency(reminderFee)} har lagts till.` : ''}`
        : `Faktura ${inv.invoice_number}${approvedAtas.length ? ` · offert och godkänd ${approvedAtas.map(a => `ÄTA-${a.ata_number}`).join(', ')}` : ''}`

  const documentUnavailable = (
    <div role="alert" style={{ padding: 18, color: 'var(--ink-2)', fontSize: 14, lineHeight: 1.5 }}>
      <p>Fakturadokumentet kunde inte visas. Försök igen eller öppna PDF-filen.</p>
      <button
        type="button"
        onClick={() => setDocumentAttempt(attempt => attempt + 1)}
        style={{ marginTop: 12, minHeight: 44, padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: '#fff', cursor: 'pointer' }}
      >
        Försök igen
      </button>
      <a href={pdfHref} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', padding: '12px 14px' }}>
        Öppna PDF
      </a>
    </div>
  )

  return (
    <div className="bp-screen">
      <div className="bp-header">
        <button type="button" onClick={onBack} className="bp-icon-btn" aria-label="Tillbaka">
          <ArrowLeft size={18} />
        </button>
        <div className="bp-brand">
          <div className="bp-brand-name">{firma || `Faktura ${inv.invoice_number}`}</div>
          <div className="bp-brand-sub">{firma ? `Faktura ${inv.invoice_number}` : settled ? 'Betald' : 'Att betala'}</div>
        </div>
      </div>

      <div className="bp-stack bp-rise">
        {claimed && (
          <div className="bp-banner blue">
            <Clock size={18} style={{ color: '#2563EB', flexShrink: 0, marginTop: 1 }} />
            <span><strong>Du har markerat fakturan som betald.</strong> Vi bekräftar när betalningen kommit in. Det brukar ta någon bankdag.</span>
          </div>
        )}

        {/* Hero */}
        <div
          style={{
            background: settled ? '#0F172A' : '#fff',
            color: settled ? '#fff' : 'var(--ink)',
            border: `1px solid ${settled ? '#0F172A' : overdue ? '#FECACA' : 'var(--border)'}`,
            borderRadius: 16, padding: '20px 20px 18px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: settled ? 'rgba(255,255,255,0.7)' : overdue ? '#DC2626' : 'var(--muted)' }}>
              {eyebrow}
            </span>
            <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, background: chip.bg, color: chip.color, whiteSpace: 'nowrap' }}>
              {chip.text}
            </span>
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1, marginTop: 12, fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(toPay)}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 8, color: settled ? 'rgba(255,255,255,0.7)' : 'var(--muted)' }}>
            {heroSub}
          </div>
        </div>

        {/* Betald: omdömet direkt i kvittot */}
        {settled && onReview && (
          <div className="bp-card" style={{ padding: 18 }}>
            <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--ink)' }}>Hur blev det?</div>
            <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 4 }}>
              {kund ? `${kund}, hur` : 'Hur'} upplevde du jobbet med {firma || 'hantverkaren'}?
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 12 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" className="bp-star" onClick={onReview} aria-label={`${n} av 5`}>
                  <Star />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Det här ingår */}
        <div className="bp-card" style={{ padding: '16px 18px 18px' }}>
          <div className="bp-eyebrow" style={{ marginBottom: 6 }}>Det här ingår</div>
          <div className="bp-rows">
            <div className="bp-row">
              <span>Arbete enligt offerten</span>
              <span className="amt">{formatCurrency(offertBelopp)}</span>
            </div>
            {visaAtaRader && approvedAtas.map(a => (
              <div key={a.change_id} className="bp-row" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div>ÄTA-{a.ata_number} · {a.description || 'Tilläggsarbete'}</div>
                  {a.signed_at && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>Godkänd av dig {formatDate(a.signed_at)}</div>}
                </div>
                <span className="amt">{formatCurrency(a.summor?.totalt ?? 0)}</span>
              </div>
            ))}
            <div className="bp-row sum">
              <div>
                <div>Totalt inkl. moms</div>
                {inv.vat_amount != null && inv.vat_rate != null && (
                  <div style={{ fontSize: 12.5, fontWeight: 400, color: 'var(--muted)', marginTop: 2 }}>varav moms {inv.vat_rate} % {formatCurrency(inv.vat_amount)}</div>
                )}
              </div>
              <span className="amt">{formatCurrency(total)}</span>
            </div>
            {rot > 0 && (
              <div className="bp-row rot">
                <span>{(inv.rot_rut_type || 'rot').toUpperCase()}-avdrag<span className="bp-pill-prel">preliminärt</span></span>
                <span className="amt">−{formatCurrency(rot)}</span>
              </div>
            )}
            {overdue && reminderFee > 0 && (
              <div className="bp-row fee">
                <span>Påminnelseavgift, tillkommer</span>
                <span className="amt">{formatCurrency(reminderFee)}</span>
              </div>
            )}
            <div className="bp-row total">
              <span>{settled ? 'Betalt' : 'Du betalar'}</span>
              <span className="amt" style={{ fontSize: 22 }}>{formatCurrency(toPay)}</span>
            </div>
          </div>
          {rot > 0 && (
            <p className="bp-micro" style={{ margin: '10px 0 0' }}>
              Avdraget är preliminärt och förutsätter att Skatteverket godkänner det.
            </p>
          )}
        </div>

        {!settled && paymentInfo?.swish && (
          <PortalSwishBlock swishNumber={paymentInfo.swish} amount={toPay} invoiceNumber={ocrNumber} />
        )}

        {!settled && (paymentInfo?.bankgiro || paymentInfo?.plusgiro) && (
          <div className="bp-card" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
              {paymentInfo.swish ? `Hellre ${paymentInfo.bankgiro ? 'bankgiro' : 'plusgiro'}?` : `Betala via ${paymentInfo.bankgiro ? 'bankgiro' : 'plusgiro'}`}
            </div>
            <CopyRows rows={[
              { k: 'giro', label: paymentInfo.bankgiro ? 'Bankgiro' : 'Plusgiro', val: (paymentInfo.bankgiro || paymentInfo.plusgiro)! },
              { k: 'ocr', label: 'OCR', val: ocrNumber },
              { k: 'amount', label: 'Belopp', val: formatCurrency(toPay) },
            ]} />
          </div>
        )}

        {!settled && !claimed && (
          <div>
            <button type="button" className="bp-btn-secondary" disabled={claiming} onClick={claimPaid}>
              {claiming ? 'Skickar…' : 'Jag har betalat'}
            </button>
            <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--muted)', marginTop: 6 }}>
              Vi bekräftar när betalningen kommit in.
            </div>
            {claimError && <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--red-600)', marginTop: 6 }}>{claimError}</div>}
          </div>
        )}

        {/* Visa fakturan — dokumentmotorn (ETAPP 6e), hopfällbar */}
        <div className="bp-card" style={{ padding: 0, overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setDocOpen(o => !o)}
            aria-expanded={docOpen}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 15, fontWeight: 600, textAlign: 'left' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--muted)' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
            </svg>
            <span style={{ flex: 1 }}>Visa fakturan</span>
            <Chevron open={docOpen} />
          </button>
          {docOpen && (
            <div style={{ padding: '0 10px 10px' }}>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'auto', padding: 10 }}>
                {docLoading ? (
                  <DocumentSkeleton />
                ) : doc?.template_style === 'modern' ? (
                  doc.template_data ? (
                    <DocumentScaler>
                      <QuoteDocument data={doc.template_data} mode="static" />
                    </DocumentScaler>
                  ) : (
                    documentUnavailable
                  )
                ) : doc?.document_html ? (
                  <iframe
                    srcDoc={doc.document_html}
                    // sandbox utan allow-scripts — ren statisk rendering, samma
                    // regel som PublicQuoteDocument (app/quote/[token]).
                    sandbox=""
                    title={`Faktura ${inv.invoice_number}`}
                    style={{ width: '100%', aspectRatio: '210 / 297', border: 'none', borderRadius: 8, background: '#fff', display: 'block' }}
                  />
                ) : (
                  documentUnavailable
                )}
              </div>
              <a
                href={pdfHref}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 8px 4px', fontSize: 14, fontWeight: 600, color: '#334155', textDecoration: 'none' }}
              >
                <Download size={16} /> Ladda ner PDF
              </a>
            </div>
          )}
        </div>

        {business && <PortalFooter business={business} attribution={portal?.attribution} />}
      </div>
    </div>
  )
}

function CopyRows({ rows }: { rows: Array<{ k: string; label: string; val: string }> }) {
  const [copied, setCopied] = useState<string | null>(null)
  function copy(key: string, value: string) {
    if (navigator.clipboard) navigator.clipboard.writeText(value).catch(() => {})
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }
  return (
    <div>
      {rows.map(r => (
        <div key={r.k} className="bp-copy-row light">
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{r.label}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{r.val}</div>
          </div>
          <button type="button" className="bp-copy-btn light" onClick={() => copy(r.k, r.val)}>
            {copied === r.k ? 'Kopierat' : 'Kopiera'}
          </button>
        </div>
      ))}
    </div>
  )
}

function DocumentSkeleton() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
      <Loader2 size={20} className="animate-spin" style={{ color: 'var(--muted)' }} />
    </div>
  )
}
