'use client'

import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Mail,
  MessageSquare,
  Send,
  ShieldCheck,
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
  quoteIntelligenceLoading: boolean
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
  quoteIntelligenceLoading,
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
          {/* Beskrivning saknas */}
          {!quote.description?.trim() && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span className="text-xs text-amber-800 flex-1">
                Offerten saknar beskrivning.{' '}
                <Link href={`/dashboard/quotes/${quote.quote_id}/edit`} className="underline font-medium hover:text-amber-900">
                  Lägg till i redigeraren
                </Link>
              </span>
            </div>
          )}

          {quoteIntelligenceLoading && (
            <div className="flex items-center gap-2 rounded-xl border border-teal-100 bg-teal-50 px-3 py-2.5 text-xs font-medium text-teal-800">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Business Twin jämför med verifierade efterkalkyler…
            </div>
          )}

          {!quoteIntelligenceLoading && quoteIntelligence?.status === 'unavailable' && (
            <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <p className="m-0 font-semibold text-slate-700">Verklighetskontrollen är inte tillgänglig</p>
                <p className="m-0 mt-0.5">{quoteIntelligence.reason} Offerten har inte ändrats.</p>
              </div>
            </div>
          )}

          {!quoteIntelligenceLoading && quoteIntelligence?.status === 'ready' && quoteIntelligence.analysis && (
            <div className={`rounded-xl border p-4 ${
              quoteIntelligence.show_warning
                ? 'border-amber-200 bg-amber-50'
                : 'border-teal-100 bg-teal-50'
            }`}>
              <div className="flex items-start gap-3">
                {quoteIntelligence.show_warning
                  ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
                  : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" aria-hidden />}
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[10px] font-bold uppercase tracking-[0.12em] text-teal-700">
                    Business Twin · verklighetskontroll
                  </p>
                  <p className={`m-0 mt-1 text-sm ${quoteIntelligence.show_warning ? 'text-amber-900' : 'text-teal-900'}`}>
                    {quoteIntelligence.analysis.message}
                  </p>
                  <div className={`mt-3 grid gap-2 text-center ${
                    quoteIntelligence.analysis.avg_realized_margin_pct != null
                      ? 'grid-cols-2 sm:grid-cols-4'
                      : 'grid-cols-3'
                  }`}>
                    <div className="rounded-lg bg-white/75 px-2 py-2">
                      <p className="m-0 text-[10px] text-slate-500">Offerten</p>
                      <p className="m-0 text-xs font-bold text-slate-800">{quoteIntelligence.analysis.quoted_hours.toLocaleString('sv-SE')} h</p>
                    </div>
                    <div className="rounded-lg bg-white/75 px-2 py-2">
                      <p className="m-0 text-[10px] text-slate-500">Liknande jobb</p>
                      <p className="m-0 text-xs font-bold text-slate-800">{quoteIntelligence.analysis.similar_jobs} st</p>
                    </div>
                    <div className="rounded-lg bg-white/75 px-2 py-2">
                      <p className="m-0 text-[10px] text-slate-500">Tidsavvikelse</p>
                      <p className="m-0 text-xs font-bold text-slate-800">
                        {quoteIntelligence.analysis.avg_hours_diff_pct > 0 ? '+' : ''}{quoteIntelligence.analysis.avg_hours_diff_pct.toLocaleString('sv-SE')} %
                      </p>
                    </div>
                    {quoteIntelligence.analysis.avg_realized_margin_pct != null && (
                      <div className="rounded-lg bg-white/75 px-2 py-2">
                        <p className="m-0 text-[10px] text-slate-500">Realiserad marginal</p>
                        <p className="m-0 text-xs font-bold text-slate-800">
                          {quoteIntelligence.analysis.avg_realized_margin_pct.toLocaleString('sv-SE')} %
                        </p>
                      </div>
                    )}
                  </div>
                  {quoteIntelligence.show_warning && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/dashboard/quotes/${quote.quote_id}/edit`}
                        className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
                      >
                        Granska timmarna
                      </Link>
                      <button
                        type="button"
                        onClick={() => setQuoteIntelligence(null)}
                        className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                      >
                        Jag har tagit höjd
                      </button>
                    </div>
                  )}
                  <p className="m-0 mt-2 text-[10px] text-slate-500">
                    Beräknat från {quoteIntelligence.analysis.matched_by === 'template' ? 'samma offertmall' : 'samma jobbtyp'} · inga belopp eller rader ändras automatiskt.
                  </p>
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
