'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, ArrowLeft, CheckCircle, Clock } from 'lucide-react'
import { formatDate, formatCurrency } from '../helpers'
import type { BusinessInfo, Invoice, PaymentInfo } from '../types'
import PaymentInfoBlock from './PaymentInfoBlock'

interface InvoiceDetailProps {
  invoice: Invoice
  paymentInfo: PaymentInfo
  businessInfo: BusinessInfo
  onBack: () => void
}

/**
 * Faktura-detaljvy med ROT/RUT-info, dröjsmålsavgifter, betalningsinformation,
 * Swish QR + deeplink, samt företagsinfo i footern.
 * Extraherat från page.tsx vid komponent-splitten — INGEN visuell ändring.
 */
export default function InvoiceDetail({
  invoice: inv,
  paymentInfo,
  businessInfo,
  onBack,
}: InvoiceDetailProps) {
  const amountToPay = inv.customer_pays || inv.total
  const ocrNumber = inv.ocr_number || inv.invoice_number
  const dueDate = new Date(inv.due_date)
  const now = new Date()
  const daysOverdue = inv.status === 'overdue'
    ? Math.max(0, Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
    : 0
  const penaltyAmount = daysOverdue > 0
    ? Math.round(amountToPay * (paymentInfo.penalty_interest / 100) * (daysOverdue / 365) * 100) / 100
    : 0
  const reminderFeeAmount = inv.reminder_count && inv.reminder_count > 0 ? paymentInfo.reminder_fee : 0
  const totalWithFees = amountToPay + penaltyAmount + reminderFeeAmount
  const swishPayAmount = Math.round(inv.status === 'overdue' ? totalWithFees : amountToPay)
  const swishUrl = paymentInfo.swish ? (() => {
    const data = { version: 1, payee: { value: paymentInfo.swish!.replace(/\D/g, '') }, amount: { value: swishPayAmount }, message: { value: inv.invoice_number } }
    return `swish://payment?data=${encodeURIComponent(JSON.stringify(data))}`
  })() : null
  const swishQrUrl = paymentInfo.swish
    ? `/api/swish-qr?number=${encodeURIComponent(paymentInfo.swish)}&amount=${swishPayAmount}&message=${encodeURIComponent(inv.invoice_number)}`
    : null

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-sky-700 hover:text-primary-700 mb-2"
      >
        <ArrowLeft className="w-4 h-4" />
        Tillbaka till fakturor
      </button>

      {/* Status header */}
      <div className={`rounded-xl p-4 ${
        inv.status === 'paid' ? 'bg-emerald-50 border border-emerald-200' :
        inv.status === 'overdue' ? 'bg-red-50 border border-red-200' :
        'bg-primary-50 border border-primary-200'
      }`}>
        <div className="flex items-center gap-3">
          {inv.status === 'paid' ? (
            <CheckCircle className="w-6 h-6 text-emerald-600" />
          ) : inv.status === 'overdue' ? (
            <AlertCircle className="w-6 h-6 text-red-600" />
          ) : (
            <Clock className="w-6 h-6 text-sky-700" />
          )}
          <div>
            <h3 className={`font-semibold ${
              inv.status === 'paid' ? 'text-emerald-700' :
              inv.status === 'overdue' ? 'text-red-700' :
              'text-primary-700'
            }`}>
              {inv.status === 'paid' ? 'Betald' :
               inv.status === 'overdue' ? `Forsenad - ${daysOverdue} dagar` :
               'Vantar pa betalning'}
            </h3>
            <p className={`text-sm ${
              inv.status === 'paid' ? 'text-emerald-600' :
              inv.status === 'overdue' ? 'text-red-600' :
              'text-sky-700'
            }`}>
              {inv.status === 'paid' && inv.paid_at
                ? `Betalades ${formatDate(inv.paid_at)}`
                : `Forfallodag: ${formatDate(inv.due_date)}`
              }
            </p>
          </div>
        </div>
      </div>

      {/* Invoice details card */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Faktura #{inv.invoice_number}</h3>

        {inv.introduction_text && (
          <p className="text-sm text-gray-600 mb-3">{inv.introduction_text}</p>
        )}

        {/* Meta info */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-0.5">Fakturadatum</p>
            <p className="text-sm font-medium text-gray-900">{formatDate(inv.invoice_date || inv.created_at)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-0.5">Forfallodag</p>
            <p className={`text-sm font-medium ${inv.status === 'overdue' ? 'text-red-600' : 'text-gray-900'}`}>
              {formatDate(inv.due_date)}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-0.5">OCR-nummer</p>
            <p className="text-sm font-mono font-semibold text-gray-900">{ocrNumber}</p>
          </div>
          {inv.our_reference && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-0.5">Er referens</p>
              <p className="text-sm font-medium text-gray-900">{inv.our_reference}</p>
            </div>
          )}
        </div>

        {/* Items */}
        {inv.items && inv.items.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs text-gray-400 uppercase tracking-wider mb-2">Rader</h4>
            <div className="space-y-1.5">
              {inv.items.filter((item: any) => item.item_type !== 'heading' && item.item_type !== 'text').map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">{item.description}</p>
                    <p className="text-xs text-gray-400">{item.quantity} {item.unit} x {formatCurrency(item.unit_price)}</p>
                  </div>
                  <p className="text-sm font-medium text-gray-900 ml-4">{formatCurrency(item.total)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="border-t border-gray-200 pt-3 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Delsumma</span>
            <span className="text-gray-900">{formatCurrency(inv.subtotal || 0)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Moms ({inv.vat_rate || 25}%)</span>
            <span className="text-gray-900">{formatCurrency(inv.vat_amount || 0)}</span>
          </div>
          <div className="flex justify-between text-sm font-semibold border-t border-gray-100 pt-1.5">
            <span className="text-gray-900">Totalt</span>
            <span className="text-gray-900">{formatCurrency(inv.total)}</span>
          </div>
          {inv.rot_rut_type && inv.rot_rut_deduction && (
            <>
              <div className="flex justify-between text-sm text-emerald-600">
                <span>{inv.rot_rut_type.toUpperCase()}-avdrag</span>
                <span>-{formatCurrency(inv.rot_rut_deduction)}</span>
              </div>
              <div className="flex justify-between text-base font-bold bg-emerald-50 rounded-lg px-3 py-2 -mx-1">
                <span className="text-gray-900">Att betala</span>
                <span className="text-gray-900">{formatCurrency(amountToPay)}</span>
              </div>
            </>
          )}
        </div>

        {inv.conclusion_text && (
          <p className="text-sm text-gray-500 mt-3 pt-3 border-t border-gray-100">{inv.conclusion_text}</p>
        )}
      </div>

      {/* Overdue fees */}
      {inv.status === 'overdue' && (penaltyAmount > 0 || reminderFeeAmount > 0) && (
        <div className="bg-red-50 rounded-xl border border-red-200 p-4">
          <h4 className="font-medium text-red-700 mb-2">Forsent betalad</h4>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-red-600">Fakturabelopp</span>
              <span className="text-red-700">{formatCurrency(amountToPay)}</span>
            </div>
            {reminderFeeAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-red-600">Paminnelseavgift</span>
                <span className="text-red-700">{formatCurrency(reminderFeeAmount)}</span>
              </div>
            )}
            {penaltyAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-red-600">Drojsmalsranta ({paymentInfo.penalty_interest}%, {daysOverdue} dgr)</span>
                <span className="text-red-700">{formatCurrency(penaltyAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t border-red-200 pt-1.5">
              <span className="text-red-700">Att betala nu</span>
              <span className="text-red-700">{formatCurrency(totalWithFees)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Payment info */}
      {inv.status !== 'paid' && (
        <PaymentInfoBlock
          paymentInfo={paymentInfo}
          ocrNumber={ocrNumber}
          amountToPay={amountToPay}
          totalWithFees={totalWithFees}
          isOverdue={inv.status === 'overdue'}
        />
      )}

      {/* Swish section with QR + deeplink */}
      {inv.status !== 'paid' && paymentInfo.swish && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
          <p className="text-sm font-medium text-gray-700 mb-3">Betala med Swish</p>
          <div className="flex items-center gap-4 mb-4">
            {swishQrUrl && (
              <SwishQRImage src={swishQrUrl} />
            )}
            <div>
              <p className="text-lg font-semibold text-gray-900">{paymentInfo.swish}</p>
              <p className="text-sm text-gray-500 mt-1">Märk: {inv.invoice_number}</p>
              <p className="text-xl font-bold text-gray-900 mt-2">
                {formatCurrency(inv.status === 'overdue' ? totalWithFees : amountToPay)}
              </p>
            </div>
          </div>
          <a
            href={swishUrl || '#'}
            className="flex items-center justify-center gap-2 w-full py-3 bg-[#6A3E9E] hover:bg-[#5A2E8E] text-white rounded-xl font-semibold text-sm transition-colors"
          >
            Öppna Swish
          </a>
        </div>
      )}

      {/* Paid confirmation */}
      {inv.status === 'paid' && (
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 text-center">
          <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
          <p className="font-semibold text-emerald-700">Fakturan ar betald</p>
          {inv.paid_at && (
            <p className="text-sm text-emerald-600">Betalning mottagen {formatDate(inv.paid_at)}</p>
          )}
        </div>
      )}

      {/* Business footer */}
      {businessInfo.name && (
        <div className="text-center text-xs text-gray-400 pt-2">
          <p>{businessInfo.name}{businessInfo.org_number ? ` | Org.nr: ${businessInfo.org_number}` : ''}</p>
          {businessInfo.f_skatt && <p>Godkand for F-skatt</p>}
        </div>
      )}
    </div>
  )
}

// ─── Swish QR Image Sub-component ────────────────────────────

function SwishQRImage({ src }: { src: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch(src)
      .then(r => r.json())
      .then(data => { if (data.qr) setQrDataUrl(data.qr) })
      .catch(() => {})
  }, [src])

  if (!qrDataUrl) return <div className="w-20 h-20 bg-purple-100 rounded-xl animate-pulse" />

  return (
    <div className="bg-white p-2 rounded-xl border border-purple-200 shrink-0">
      <img src={qrDataUrl} alt="Swish QR" width={80} height={80} />
    </div>
  )
}
