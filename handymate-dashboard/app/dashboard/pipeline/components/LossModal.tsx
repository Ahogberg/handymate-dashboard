'use client'

import { X } from 'lucide-react'
import { LOSS_REASONS } from '@/lib/lead-scoring'
import { usePipelineContext } from '../context'

/**
 * "Varför förlorades denna deal?"-modalen — öppnas via moveDealAction när
 * användaren drar/flyttar ett deal till lost-stage.
 */
export function LossModal() {
  const {
    showLossModal,
    setShowLossModal,
    lossReason,
    setLossReason,
    lossReasonDetail,
    setLossReasonDetail,
    confirmLossReason,
  } = usePipelineContext()

  if (!showLossModal) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={() => setShowLossModal(false)} />
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-2xl w-full max-w-md">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">Varför förlorades denna deal?</h2>
            <button onClick={() => setShowLossModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-6 space-y-3">
            {LOSS_REASONS.map(r => (
              <label key={r.value} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${lossReason === r.value ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input type="radio" name="loss_reason" value={r.value} checked={lossReason === r.value} onChange={() => setLossReason(r.value)} className="text-red-600 focus:ring-red-500" />
                <span className="text-sm text-gray-700">{r.label}</span>
              </label>
            ))}
            {lossReason === 'other' && (
              <textarea
                value={lossReasonDetail}
                onChange={e => setLossReasonDetail(e.target.value)}
                placeholder="Beskriv orsaken..."
                className="w-full px-3 py-2 bg-gray-50 border border-[#E2E8F0] rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-red-400 resize-none"
                rows={2}
              />
            )}
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
            <button onClick={() => setShowLossModal(false)} className="px-4 py-2 rounded-lg bg-gray-100 border border-[#E2E8F0] text-sm text-gray-600 hover:text-gray-900 transition-colors">Avbryt</button>
            <button
              onClick={confirmLossReason}
              disabled={!lossReason}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              Markera förlorad
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
