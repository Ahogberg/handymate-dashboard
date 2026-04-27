'use client'

import { useState } from 'react'
import { Download, FileSignature, Receipt, Shield } from 'lucide-react'
import PortalShellHeader from './PortalShellHeader'
import PortalHandymateAttribution from './PortalHandymateAttribution'
import { formatDate, formatCurrency } from '../helpers'
import type { Invoice, PortalData, Quote } from '../types'

interface PortalDocumentsListProps {
  portal: PortalData
  quotes: Quote[]
  invoices: Invoice[]
  onOpenQuote: (id: string) => void
  onOpenInvoice: (id: string) => void
}

type FilterId = 'all' | 'quotes' | 'invoices'

interface DocItem {
  id: string
  kind: 'quote' | 'invoice'
  title: string
  meta: string
  badge: string
  tone: 'green' | 'amber' | 'gray' | 'blue'
  onClick: () => void
}

/**
 * Documents-vyn (port av bp-documents.jsx).
 * Filterbar lista över quotes + invoices. Andra dokumenttyper i mockupen
 * (cert/garanti/skötselråd) hidden tills customer_documents-tabell finns.
 */
export default function PortalDocumentsList({
  portal,
  quotes,
  invoices,
  onOpenQuote,
  onOpenInvoice,
}: PortalDocumentsListProps) {
  const [filter, setFilter] = useState<FilterId>('all')

  const docItems: DocItem[] = [
    ...quotes.map((q): DocItem => ({
      id: `q-${q.quote_id}`,
      kind: 'quote',
      title: q.title || 'Offert',
      meta: `${formatDate(q.sent_at || q.created_at)} · ${formatCurrency(q.customer_pays || q.total)}`,
      badge: q.status === 'accepted' ? 'Signerad' : q.status === 'declined' ? 'Avböjd' : 'Väntar svar',
      tone: q.status === 'accepted' ? 'green' : q.status === 'declined' ? 'gray' : 'amber',
      onClick: () => onOpenQuote(q.quote_id),
    })),
    ...invoices.map((inv): DocItem => ({
      id: `i-${inv.invoice_id}`,
      kind: 'invoice',
      title: `Faktura · #${inv.invoice_number}`,
      meta: `${formatDate(inv.invoice_date || inv.created_at)} · ${formatCurrency(inv.customer_pays || inv.total)}`,
      badge: inv.status === 'paid' ? 'Betald' : inv.status === 'overdue' ? 'Försenad' : 'Att betala',
      tone: inv.status === 'paid' ? 'green' : inv.status === 'overdue' ? 'gray' : 'amber',
      onClick: () => onOpenInvoice(inv.invoice_id),
    })),
  ]

  const visible = filter === 'all'
    ? docItems
    : filter === 'quotes'
      ? docItems.filter(d => d.kind === 'quote')
      : docItems.filter(d => d.kind === 'invoice')

  return (
    <>
      <PortalShellHeader
        business={portal.business}
        unreadMessages={portal.unreadMessages}
      />

      <div className="bp-body">
        <div className="bp-page-title">
          <h1>Dokument</h1>
          <p>Allt på ett ställe — alltid tillgängligt.</p>
        </div>

        {/* Filter chips */}
        <div
          style={{
            padding: '0 18px 16px',
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {([
            { id: 'all' as FilterId,      label: 'Alla',     count: docItems.length },
            { id: 'quotes' as FilterId,   label: 'Offerter', count: quotes.length },
            { id: 'invoices' as FilterId, label: 'Fakturor', count: invoices.length },
          ]).map(c => (
            <button
              type="button"
              key={c.id}
              onClick={() => setFilter(c.id)}
              style={{
                flexShrink: 0,
                padding: '7px 14px',
                border: filter === c.id ? '1px solid var(--ink)' : '1px solid var(--border)',
                background: filter === c.id ? 'var(--ink)' : 'var(--surface)',
                color: filter === c.id ? '#fff' : 'var(--ink-2)',
                borderRadius: 'var(--r-pill)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all var(--t-fast)',
                fontFamily: 'inherit',
              }}
            >
              {c.label} <span style={{ opacity: 0.5, marginLeft: 4 }}>{c.count}</span>
            </button>
          ))}
        </div>

        {/* Document list */}
        <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.length === 0 ? (
            <div
              style={{
                padding: 24,
                background: 'var(--surface)',
                border: '1px dashed var(--border)',
                borderRadius: 'var(--r-md)',
                textAlign: 'center',
                color: 'var(--muted)',
                fontSize: 13,
              }}
            >
              Inga dokument i denna kategori.
            </div>
          ) : (
            visible.map((d, i) => (
              <div
                key={d.id}
                className="bp-card bp-card-tap"
                onClick={d.onClick}
                style={{
                  padding: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  animation: `bp-slide-up 360ms ${i * 50}ms both`,
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: d.tone === 'green'
                      ? 'var(--green-50)'
                      : d.tone === 'amber'
                        ? 'var(--bee-50)'
                        : d.tone === 'blue'
                          ? 'var(--blue-50)'
                          : 'var(--bg)',
                    color: d.tone === 'green'
                      ? 'var(--green-600)'
                      : d.tone === 'amber'
                        ? 'var(--bee-700)'
                        : d.tone === 'blue'
                          ? 'var(--blue-600)'
                          : 'var(--ink-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {d.kind === 'quote' ? <FileSignature size={20} /> : <Receipt size={20} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--ink)',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {d.title}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--muted)',
                      marginTop: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span>{d.meta}</span>
                    <span className={`bp-badge ${d.tone === 'gray' ? 'gray' : d.tone}`}>{d.badge}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Storage note */}
        <div
          style={{
            padding: '20px 18px 0',
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'var(--hm-50)',
              color: 'var(--hm-700)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Shield size={14} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
            Dina dokument lagras säkert hos {portal.business.name} — så du har dem när du säljer
            bostaden eller behöver intyg till försäkringen.
          </div>
        </div>

        <PortalHandymateAttribution />
      </div>
    </>
  )
}
