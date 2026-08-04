'use client'

import { Loader2, RotateCcw, X } from 'lucide-react'
import type { InvoiceItem } from '../types'

interface InvoiceCreditModalProps {
  show: boolean
  invoiceNumber: string
  invoiceTotal: number
  items: InvoiceItem[]
  creditReason: string
  setCreditReason: (v: string) => void
  creditType: 'full' | 'partial'
  setCreditType: (v: 'full' | 'partial') => void
  creditItemChecked: Record<number, boolean>
  setCreditItemChecked: (v: Record<number, boolean>) => void
  creditItemQuantity: Record<number, number>
  setCreditItemQuantity: (v: Record<number, number>) => void
  creatingCredit: boolean
  onClose: () => void
  onConfirm: () => void
}

/**
 * ETAPP 6d (offert-masterplan.md, faktura-sprinten), punkt 4 — bruten ut
 * OFÖRÄNDRAD ur app/dashboard/invoices/[id]/page.tsx (tidigare rad
 * ~546-682). Den mest logikbärande av de två modalerna (delkreditering med
 * radval + antal per rad) — ingen logikändring i denna etapp, bara flyttad
 * till en egen komponent. Parent (page.tsx) äger fortfarande allt state
 * och POST:ar mot /api/invoices/credit exakt som förut.
 */
export function InvoiceCreditModal({
  show,
  invoiceNumber,
  invoiceTotal,
  items,
  creditReason,
  setCreditReason,
  creditType,
  setCreditType,
  creditItemChecked,
  setCreditItemChecked,
  creditItemQuantity,
  setCreditItemQuantity,
  creatingCredit,
  onClose,
  onConfirm,
}: InvoiceCreditModalProps) {
  if (!show) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Skapa kreditfaktura</h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Credit type tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
          <button
            onClick={() => setCreditType('full')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              creditType === 'full' ? 'bg-white text-gray-900' : 'text-gray-500'
            }`}
          >
            Hel kreditering
          </button>
          <button
            onClick={() => setCreditType('partial')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              creditType === 'partial' ? 'bg-white text-gray-900' : 'text-gray-500'
            }`}
          >
            Delkreditering
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          {creditType === 'full'
            ? `Hela faktura #${invoiceNumber} (${invoiceTotal?.toLocaleString('sv-SE')} kr) krediteras. Originalfakturan markeras som krediterad.`
            : 'Välj vilka rader och antal som ska krediteras.'}
        </p>

        {/* Partial credit item selection */}
        {creditType === 'partial' && (
          <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
            {items.map((item, index) => {
              const itemType = (item as any).item_type || 'item'
              if (itemType !== 'item') return null

              return (
                <label
                  key={index}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                    creditItemChecked[index] ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={creditItemChecked[index] || false}
                    onChange={(e) => {
                      setCreditItemChecked({ ...creditItemChecked, [index]: e.target.checked })
                      if (e.target.checked && !creditItemQuantity[index]) {
                        setCreditItemQuantity({ ...creditItemQuantity, [index]: item.quantity })
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">{item.description}</p>
                    <p className="text-xs text-gray-400">
                      {item.quantity} {item.unit} x {item.unit_price?.toLocaleString('sv-SE')} kr
                    </p>
                  </div>
                  {creditItemChecked[index] && (
                    <input
                      type="number"
                      min={0.5}
                      max={item.quantity}
                      step={0.5}
                      value={creditItemQuantity[index] ?? item.quantity}
                      onChange={(e) => setCreditItemQuantity({
                        ...creditItemQuantity,
                        [index]: Math.min(Number(e.target.value), item.quantity)
                      })}
                      className="w-16 px-2 py-1 bg-white border border-[#E2E8F0] rounded-lg text-sm text-center"
                    />
                  )}
                  <span className="text-sm font-medium text-gray-700 w-20 text-right">
                    {item.total?.toLocaleString('sv-SE')} kr
                  </span>
                </label>
              )
            })}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-500 mb-2">Anledning *</label>
            <select
              value={creditReason}
              onChange={(e) => setCreditReason(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
            >
              <option value="">Välj anledning...</option>
              <option value="Felaktig faktura">Felaktig faktura</option>
              <option value="Reklamation">Reklamation</option>
              <option value="Avbeställning">Avbeställning</option>
              <option value="Dubbelfakturering">Dubbelfakturering</option>
              <option value="Prisändring">Prisändring</option>
              <option value="Annat">Annat</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200"
          >
            Avbryt
          </button>
          <button
            onClick={onConfirm}
            disabled={creatingCredit || !creditReason}
            className="flex-1 py-3 bg-gradient-to-r from-red-500 to-red-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {creatingCredit ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                {creditType === 'full' ? 'Helkreditera' : 'Delkreditera'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
