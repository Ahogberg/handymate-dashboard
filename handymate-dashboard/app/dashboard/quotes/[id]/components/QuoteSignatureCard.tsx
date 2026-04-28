'use client'

import { CheckCircle, Link2, PenTool } from 'lucide-react'
import { formatDate } from '../helpers'
import type { Quote } from '../types'

interface QuoteSignatureCardProps {
  quote: Quote
  portalUrl: string | null
  onCopySignLink: () => void
}

/**
 * Visar e-signaturens status som ett av tre kort:
 * 1. Signerat: e-signaturkort + signaturbild
 * 2. Skickat (väntar): signeringslänk-kort med kopiera-knapp
 * 3. Ej skickat: returnerar null (ingenting att visa ännu)
 */
export function QuoteSignatureCard({ quote, portalUrl, onCopySignLink }: QuoteSignatureCardProps) {
  return (
    <>
      {/* Signature Info */}
      {quote.signature_data && (
        <div className="bg-white rounded-xl border border-emerald-200 p-4 sm:p-6">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <PenTool className="w-5 h-5 text-emerald-600" />
            E-signerad
          </h2>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{quote.signed_by_name}</p>
              <p className="text-xs text-gray-500">{quote.signed_at && formatDate(quote.signed_at)}</p>
            </div>
          </div>
          {quote.signature_data && (
            <div className="bg-gray-50 rounded-lg p-2">
              <img src={quote.signature_data} alt="Signatur" className="max-h-16 mx-auto" />
            </div>
          )}
        </div>
      )}

      {/* Signing link */}
      {quote.sign_token && ['sent', 'opened'].includes(quote.status) && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary-700" />
            Signeringslänk
          </h2>
          <div className="flex items-center gap-2 bg-gray-50 border border-[#E2E8F0] rounded-lg p-2">
            <span className="text-xs text-gray-500 truncate flex-1">
              {portalUrl
                ? portalUrl.replace(/^https?:\/\//, '').slice(0, 48) + '...'
                : `app.handymate.se/quote/${quote.sign_token.slice(0, 8)}...`}
            </span>
            <button
              onClick={onCopySignLink}
              className="flex-shrink-0 px-2.5 py-1 bg-primary-700 text-white text-xs rounded-md font-medium"
            >
              Kopiera
            </button>
          </div>
        </div>
      )}
    </>
  )
}
