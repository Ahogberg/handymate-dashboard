'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  Bell,
  CheckCircle,
  ChevronDown,
  Download,
  Eye,
  FileText,
  Mail,
  MessageSquare,
  MoreVertical,
  Pencil,
  RotateCcw,
  Send,
} from 'lucide-react'
import Link from 'next/link'
import { CopyId } from '@/components/CopyId'
import { formatDate, getFortnoxSyncStyle, getFortnoxSyncText, getStatusStyle, getStatusText } from '../helpers'
import type { Invoice } from '../types'

interface InvoiceHeaderProps {
  invoice: Invoice
  invoiceId: string
  fortnoxConnected: boolean
  sending: boolean
  sendingReminder: boolean
  sendingViaFortnox: boolean
  onSend: (method: 'email' | 'sms' | 'both') => void
  onSendReminder: () => void
  onOpenPaymentModal: () => void
  onOpenCreditModal: () => void
  onSendViaFortnox: () => void
}

const PRIMARY_BTN =
  'inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50'

const GHOST_BTN =
  'inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-medium rounded-xl transition-colors disabled:opacity-50'

const MENU_ITEM =
  'w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:hover:bg-transparent'

/**
 * ETAPP 6d (offert-masterplan.md, faktura-sprinten), punkt 2 —
 * åtgärdshierarki istället för dagens 4-5 likvärdiga knappar + en
 * hover-meny. Speglar app/dashboard/quotes/[id]/components/QuoteHeader.tsx
 * rakt av (samma dropdown/klicka-utanför-mönster).
 *
 * PRIMÄR (en per status):
 *  - draft            → "Skicka faktura" (öppnar en liten meny: email/sms/
 *                        båda — samma tre val som gårdagens hover-meny).
 *  - sent/overdue,
 *    reminder_count=0 → "Skicka påminnelse" (första nudgen är den
 *                        naturliga nästa handlingen).
 *  - sent/overdue,
 *    reminder_count>0 → "Markera betald" (efter att en påminnelse redan
 *                        gått ut väntar man på pengarna snarare än att
 *                        automatiskt trycka på nästa påminnelse — "Skicka
 *                        påminnelse" flyttar till "…"-menyn men försvinner
 *                        INTE, se overflow nedan).
 *  - paid             → ingen primärknapp.
 *  - credited/
 *    cancelled        → ingen primärknapp (terminalt tillstånd).
 *
 * SEKUNDÄR: Redigera (bara draft, som idag) + en "Dokument"-meny (Visa i
 * ny flik / Ladda ner PDF — två separata knappar idag, samma två länkar).
 *
 * "…"-OVERFLOW: Markera betald (när den inte redan är primär), Kreditera
 * (samma villkor som idag), Skicka via Fortnox (bara draft + Fortnox
 * kopplat — samma villkor som gårdagens hover-undermeny, bara flyttad hit).
 */
export function InvoiceHeader({
  invoice,
  invoiceId,
  fortnoxConnected,
  sending,
  sendingReminder,
  sendingViaFortnox,
  onSend,
  onSendReminder,
  onOpenPaymentModal,
  onOpenCreditModal,
  onSendViaFortnox,
}: InvoiceHeaderProps) {
  const [sendMenuOpen, setSendMenuOpen] = useState(false)
  const [docMenuOpen, setDocMenuOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)

  const closeMenus = () => {
    setSendMenuOpen(false)
    setDocMenuOpen(false)
    setMoreMenuOpen(false)
  }

  const isActive = invoice.status === 'sent' || invoice.status === 'overdue'
  const alreadyReminded = (invoice.reminder_count || 0) > 0
  const primaryIsMarkPaid = isActive && alreadyReminded
  const primaryIsRemind = isActive && !alreadyReminded
  const canCredit = !invoice.is_credit_note && invoice.status !== 'credited' && invoice.status !== 'draft' && invoice.status !== 'cancelled'
  const canSendViaFortnox = fortnoxConnected && invoice.status === 'draft'

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/invoices"
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Tillbaka till fakturalistan"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-heading text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2 flex-wrap">
              <span>{invoice.is_credit_note ? 'Kreditfaktura' : 'Faktura'}</span>
              <CopyId value={invoice.invoice_number} label={`#${invoice.invoice_number}`} />
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Skapad {formatDate(invoice.invoice_date)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {invoice.fortnox_sync_status && (
            <span className={`inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full ${getFortnoxSyncStyle(invoice.fortnox_sync_status)}`}>
              Fortnox: {getFortnoxSyncText(invoice.fortnox_sync_status)}
            </span>
          )}
          <span className={`inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full ${getStatusStyle(invoice.status)}`}>
            {getStatusText(invoice.status)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {/* Primär — en per status */}
        {invoice.status === 'draft' && (
          <div className="relative">
            <button type="button" onClick={() => setSendMenuOpen(o => !o)} disabled={sending} className={PRIMARY_BTN}>
              {sending ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
              Skicka faktura
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${sendMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {sendMenuOpen && (
              <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-20 w-56 overflow-hidden">
                <button
                  onClick={() => { setSendMenuOpen(false); onSend('email') }}
                  disabled={!invoice.customer?.email || sending}
                  className={MENU_ITEM}
                >
                  <Mail className="w-4 h-4 text-slate-400" />
                  Via e-post
                </button>
                <button
                  onClick={() => { setSendMenuOpen(false); onSend('sms') }}
                  disabled={!invoice.customer?.phone_number || sending}
                  className={MENU_ITEM}
                >
                  <MessageSquare className="w-4 h-4 text-slate-400" />
                  Via SMS
                </button>
                <button
                  onClick={() => { setSendMenuOpen(false); onSend('both') }}
                  disabled={(!invoice.customer?.email && !invoice.customer?.phone_number) || sending}
                  className={MENU_ITEM}
                >
                  <Send className="w-4 h-4 text-slate-400" />
                  Båda
                </button>
              </div>
            )}
          </div>
        )}
        {primaryIsRemind && (
          <button type="button" onClick={onSendReminder} disabled={sendingReminder} className={PRIMARY_BTN}>
            {sendingReminder ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Bell className="w-4 h-4" />}
            Skicka påminnelse
          </button>
        )}
        {primaryIsMarkPaid && (
          <button type="button" onClick={onOpenPaymentModal} className={PRIMARY_BTN}>
            <CheckCircle className="w-4 h-4" />
            Markera betald
          </button>
        )}

        {/* Sekundär */}
        {invoice.status === 'draft' && (
          <Link href={`/dashboard/invoices/${invoiceId}/edit`} className={GHOST_BTN}>
            <Pencil className="w-4 h-4" />
            Redigera
          </Link>
        )}

        <div className="relative">
          <button type="button" onClick={() => setDocMenuOpen(o => !o)} className={GHOST_BTN}>
            <FileText className="w-4 h-4" />
            Dokument
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${docMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {docMenuOpen && (
            <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-20 w-60 overflow-hidden">
              <a
                href={`/api/invoices/pdf?invoiceId=${invoiceId}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setDocMenuOpen(false)}
                className={MENU_ITEM}
              >
                <Eye className="w-4 h-4 text-slate-400" />
                Visa i ny flik
              </a>
              <a
                href={`/api/invoices/pdf?invoiceId=${invoiceId}&format=pdf`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setDocMenuOpen(false)}
                className={MENU_ITEM}
              >
                <Download className="w-4 h-4 text-slate-400" />
                Ladda ner PDF
              </a>
            </div>
          )}
        </div>

        {/* Overflow */}
        {(isActive || canCredit || canSendViaFortnox) && (
          <div className="relative">
            <button type="button" onClick={() => setMoreMenuOpen(o => !o)} className={GHOST_BTN} aria-label="Fler åtgärder">
              <MoreVertical className="w-4 h-4" />
            </button>
            {moreMenuOpen && (
              <div className="absolute top-full right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-20 w-56 overflow-hidden">
                {isActive && !primaryIsMarkPaid && (
                  <button onClick={() => { setMoreMenuOpen(false); onOpenPaymentModal() }} className={MENU_ITEM}>
                    <CheckCircle className="w-4 h-4 text-slate-400" />
                    Markera betald
                  </button>
                )}
                {primaryIsMarkPaid && (
                  <button onClick={() => { setMoreMenuOpen(false); onSendReminder() }} disabled={sendingReminder} className={MENU_ITEM}>
                    <Bell className="w-4 h-4 text-slate-400" />
                    {sendingReminder ? 'Skickar…' : 'Skicka påminnelse igen'}
                  </button>
                )}
                {canCredit && (
                  <button onClick={() => { setMoreMenuOpen(false); onOpenCreditModal() }} className={MENU_ITEM}>
                    <RotateCcw className="w-4 h-4 text-slate-400" />
                    Kreditera
                  </button>
                )}
                {canSendViaFortnox && (
                  <button onClick={() => { setMoreMenuOpen(false); onSendViaFortnox() }} disabled={sendingViaFortnox} className={MENU_ITEM}>
                    <Send className="w-4 h-4 text-slate-400" />
                    {sendingViaFortnox ? 'Skickar…' : 'Skicka via Fortnox'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Close dropdowns when clicking outside */}
      {(sendMenuOpen || docMenuOpen || moreMenuOpen) && (
        <div className="fixed inset-0 z-10" onClick={closeMenus} />
      )}
    </>
  )
}
