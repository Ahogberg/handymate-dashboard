'use client'

import { useState } from 'react'
import { Download, FileText, PenTool } from 'lucide-react'
import { formatDate, formatCurrency, getQuoteStatusText, getQuoteStatusColor } from '../helpers'
import type { Quote } from '../types'
import QuoteSigningModal from './QuoteSigningModal'

interface QuotesListProps {
  quotes: Quote[]
  customerName: string
  onSigned: () => void
}

/**
 * Offertlista (rendered när activeTab === 'quotes').
 * Extraherat från page.tsx vid komponent-splitten — INGEN visuell ändring.
 *
 * Har inline-signering per offert via QuoteSigningModal.
 */
export default function QuotesList({ quotes, customerName, onSigned }: QuotesListProps) {
  const [signingQuoteId, setSigningQuoteId] = useState<string | null>(null)
  const [signSuccess, setSignSuccess] = useState<string | null>(null)

  if (quotes.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
        <p>Inga offerter just nu.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {quotes.map(q => (
        <div key={q.quote_id} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-gray-900">{q.title || 'Offert'}</h3>
            <span className={`text-xs px-2 py-1 rounded-full border ${getQuoteStatusColor(q.status)}`}>
              {signSuccess === q.quote_id ? 'Signerad!' : getQuoteStatusText(q.status)}
            </span>
          </div>
          <div className="text-sm text-gray-500 mb-3">
            {q.sent_at ? `Skickad: ${formatDate(q.sent_at)}` : `Skapad: ${formatDate(q.created_at)}`}
            {q.valid_until && (
              <span className="ml-2">· Giltig till: {formatDate(q.valid_until)}</span>
            )}
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-lg font-semibold text-gray-900">{formatCurrency(q.customer_pays || q.total)}</p>
              {q.rot_rut_type && q.rot_rut_deduction > 0 && (
                <p className="text-xs text-emerald-600">efter {q.rot_rut_type.toUpperCase()}-avdrag</p>
              )}
            </div>
            <div className="flex gap-2">
              {q.sign_token && (
                <a
                  href={`/api/quotes/pdf?token=${q.sign_token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  PDF
                </a>
              )}
              {['sent', 'opened'].includes(q.status) && q.sign_token && (
                <button
                  onClick={() => setSigningQuoteId(q.quote_id)}
                  className="px-3 py-2 text-sm bg-primary-700 text-white rounded-lg hover:bg-primary-800 font-medium flex items-center gap-1"
                >
                  <PenTool className="w-3.5 h-3.5" />
                  Godkänn och signera
                </button>
              )}
            </div>
          </div>

          {signingQuoteId === q.quote_id && q.sign_token && (
            <QuoteSigningModal
              quoteId={q.quote_id}
              signToken={q.sign_token}
              initialSignerName={customerName}
              onSigned={(id) => {
                setSignSuccess(id)
                setSigningQuoteId(null)
                onSigned()
              }}
              onCancel={() => setSigningQuoteId(null)}
            />
          )}
        </div>
      ))}
    </div>
  )
}
