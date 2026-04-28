'use client'

import {
  AlertTriangle,
  FileText,
  Loader2,
  Mail,
  MessageSquare,
  Send,
  XCircle,
} from 'lucide-react'
import type { Quote, QuoteIntelligence } from '../types'

interface QuoteSendModalProps {
  show: boolean
  quote: Quote
  business: { business_name?: string; contact_email?: string; [key: string]: any }
  sending: boolean
  sendMethod: 'sms' | 'email' | 'both'
  setSendMethod: (m: 'sms' | 'email' | 'both') => void
  extraEmails: string
  setExtraEmails: (s: string) => void
  bccEmails: string
  setBccEmails: (s: string) => void
  quoteIntelligence: QuoteIntelligence | null
  setQuoteIntelligence: (q: QuoteIntelligence | null) => void
  onClose: () => void
  onSend: () => void
}

export function QuoteSendModal({
  show,
  quote,
  business,
  sending,
  sendMethod,
  setSendMethod,
  extraEmails,
  setExtraEmails,
  bccEmails,
  setBccEmails,
  quoteIntelligence,
  setQuoteIntelligence,
  onClose,
  onSend,
}: QuoteSendModalProps) {
  if (!show) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={() => !sending && onClose()}
    >
      <div
        className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-lg shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <Mail className="w-5 h-5 text-primary-700" />
          <h2 className="text-lg font-semibold text-gray-900">
            Skicka offert {quote.quote_number || ''}
          </h2>
          <button
            onClick={() => !sending && onClose()}
            className="ml-auto text-gray-400 hover:text-gray-600"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Daniel's intelligence warning */}
          {quoteIntelligence?.show_warning && quoteIntelligence.analysis && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                  D
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-sm font-semibold text-gray-900">Daniel</span>
                    <span className="text-xs text-gray-400">· Säljare</span>
                  </div>
                  <p className="text-sm text-amber-800 mb-3">{quoteIntelligence.analysis.message}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        // TODO: Justera pris-logik
                        setQuoteIntelligence(null)
                      }}
                      className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700"
                    >
                      Justera till {new Intl.NumberFormat('sv-SE').format(quoteIntelligence.analysis.suggested_price)} kr
                    </button>
                    <button
                      onClick={() => setQuoteIntelligence(null)}
                      className="px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-100"
                    >
                      Skicka ändå
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Från */}
          <div className="flex items-start gap-3">
            <span className="text-xs text-gray-400 w-16 pt-2 text-right flex-shrink-0">Från</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">{business?.business_name}</p>
              <p className="text-xs text-gray-400">
                offert@handymate.se · Svar till {business?.contact_email}
              </p>
            </div>
          </div>

          {/* Leveransmetod */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 w-16 text-right flex-shrink-0">Via</span>
            <div className="flex gap-1.5">
              {['sms', 'email', 'both'].map(m => (
                <button
                  key={m}
                  onClick={() => setSendMethod(m as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    sendMethod === m
                      ? 'bg-primary-50 border-primary-300 text-primary-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {m === 'sms' ? 'SMS' : m === 'email' ? 'Email' : 'Båda'}
                </button>
              ))}
            </div>
          </div>

          {/* Till */}
          <div className="flex items-start gap-3">
            <span className="text-xs text-gray-400 w-16 pt-2 text-right flex-shrink-0">Till</span>
            <div className="flex-1 space-y-1.5">
              {(sendMethod === 'sms' || sendMethod === 'both') && (
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm text-gray-700">
                    {quote.customer?.phone_number || (
                      <span className="text-red-500">Telefonnummer saknas</span>
                    )}
                  </span>
                </div>
              )}
              {(sendMethod === 'email' || sendMethod === 'both') && (
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm text-gray-700">
                    {quote.customer?.email || <span className="text-red-500">Email saknas</span>}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Extra mottagare (email) */}
          {(sendMethod === 'email' || sendMethod === 'both') && (
            <>
              <div className="flex items-start gap-3">
                <span className="text-xs text-gray-400 w-16 pt-2 text-right flex-shrink-0">Kopia</span>
                <input
                  type="text"
                  value={extraEmails}
                  onChange={e => setExtraEmails(e.target.value)}
                  placeholder="anna@firma.se"
                  className="flex-1 px-3 py-1.5 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-primary-500 bg-gray-50"
                />
              </div>
              <div className="flex items-start gap-3">
                <span className="text-xs text-gray-400 w-16 pt-2 text-right flex-shrink-0">BCC</span>
                <input
                  type="text"
                  value={bccEmails}
                  onChange={e => setBccEmails(e.target.value)}
                  placeholder="chef@firma.se"
                  className="flex-1 px-3 py-1.5 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-primary-500 bg-gray-50"
                />
              </div>
            </>
          )}

          {/* Ämne (email) */}
          {(sendMethod === 'email' || sendMethod === 'both') && (
            <div className="flex items-start gap-3">
              <span className="text-xs text-gray-400 w-16 pt-2 text-right flex-shrink-0">Ämne</span>
              <p className="flex-1 text-sm text-gray-700 pt-1.5">
                Offert från {business?.business_name}: {quote.title || 'Offert'}
              </p>
            </div>
          )}

          {/* Bifogat */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 w-16 text-right flex-shrink-0"></span>
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-[#E2E8F0] rounded-lg">
              <FileText className="w-4 h-4 text-primary-700" />
              <span className="text-xs text-gray-600">
                Offert {quote.quote_number || ''} ·{' '}
                {quote.total
                  ? new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(quote.total) + ' kr'
                  : ''}
              </span>
            </div>
          </div>

          {/* Validering */}
          {sendMethod !== 'sms' && !quote.customer?.email && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-xs text-red-600">
                Kunden saknar e-postadress. Lägg till den i kundkortet först.
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <button
            onClick={() => !sending && onClose()}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Avbryt
          </button>
          <button
            onClick={onSend}
            disabled={sending || (sendMethod !== 'sms' && !quote.customer?.email)}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-700 rounded-xl text-white font-medium text-sm hover:opacity-90 disabled:opacity-40 transition-all"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Skickar...' : 'Skicka offert'}
          </button>
        </div>
      </div>
    </div>
  )
}
