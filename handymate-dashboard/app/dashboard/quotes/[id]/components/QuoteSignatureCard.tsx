'use client'

import { CheckCircle, Clock, Link2, PenTool } from 'lucide-react'
import { formatDate } from '../helpers'
import type { Quote } from '../types'

interface QuoteSignatureCardProps {
  quote: Quote
  portalUrl: string | null
  onCopySignLink: () => void
}

/**
 * E-signaturens status som ett av tre kort:
 * 1. Signerad: green-50 bg, check-ikon, datum + namn + signaturbild
 * 2. Väntar (sent/opened): amber-50 bg, clock-ikon + signeringslänk
 * 3. Ej skickat (draft): slate-50 bg, "Ej skickat än"
 */
export function QuoteSignatureCard({ quote, portalUrl, onCopySignLink }: QuoteSignatureCardProps) {
  // 1. Signerad
  if (quote.signature_data) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-green-600 text-white flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-4.5 h-4.5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-green-700">E-signerad</p>
            <p className="text-sm font-semibold text-slate-900 truncate">{quote.signed_by_name}</p>
            {quote.signed_at && (
              <p className="text-xs text-slate-500 mt-0.5">{formatDate(quote.signed_at)}</p>
            )}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-green-200/60 p-3">
          <img src={quote.signature_data} alt="Signatur" className="max-h-16 mx-auto" />
        </div>
      </div>
    )
  }

  // 2. Väntar (skickad eller öppnad)
  if (quote.sign_token && ['sent', 'opened'].includes(quote.status)) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-amber-600 text-white flex items-center justify-center flex-shrink-0">
            <Clock className="w-4.5 h-4.5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Väntar på signering</p>
            <p className="text-sm font-semibold text-slate-900">Kunden har inte signerat än</p>
          </div>
        </div>

        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
            <Link2 className="w-3 h-3" />
            Signeringslänk
          </p>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
            <span className="text-xs text-slate-600 truncate flex-1 font-mono">
              {portalUrl
                ? portalUrl.replace(/^https?:\/\//, '').slice(0, 48) + '…'
                : `app.handymate.se/quote/${quote.sign_token.slice(0, 8)}…`}
            </span>
            <button
              onClick={onCopySignLink}
              className="flex-shrink-0 px-3 py-1 bg-primary-700 hover:bg-primary-600 text-white text-xs font-semibold rounded-md transition-colors"
            >
              Kopiera
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 3. Ej skickat än (draft)
  if (quote.status === 'draft') {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center flex-shrink-0">
            <PenTool className="w-4.5 h-4.5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Signering</p>
            <p className="text-sm font-medium text-slate-700">Ej skickat än</p>
          </div>
        </div>
      </div>
    )
  }

  return null
}
