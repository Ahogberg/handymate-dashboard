'use client'

import { Loader2, MessageSquare } from 'lucide-react'
import { usePipelineContext } from '../context'

/**
 * Snabb-SMS-modalen — öppnas från deal-cards "Ring/SMS"-knappar.
 */
export function QuickSmsModal() {
  const {
    quickSmsTarget,
    setQuickSmsTarget,
    quickSmsText,
    setQuickSmsText,
    quickSmsSending,
    sendQuickSms,
  } = usePipelineContext()

  if (!quickSmsTarget) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40" onClick={() => setQuickSmsTarget(null)}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-5" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-900 mb-1">SMS till {quickSmsTarget.name}</h3>
        <p className="text-xs text-gray-400 mb-3">{quickSmsTarget.phone}</p>
        <textarea
          value={quickSmsText}
          onChange={e => setQuickSmsText(e.target.value)}
          placeholder="Skriv ditt meddelande..."
          className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none resize-none"
          rows={3}
          maxLength={320}
          autoFocus
        />
        <p className="text-xs text-gray-400 mt-1">{quickSmsText.length}/320</p>
        <div className="flex gap-2 mt-3">
          <button
            onClick={sendQuickSms}
            disabled={!quickSmsText.trim() || quickSmsSending}
            className="flex-1 bg-primary-700 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {quickSmsSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
            Skicka
          </button>
          <button onClick={() => setQuickSmsTarget(null)} className="px-4 py-2.5 border border-[#E2E8F0] rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Avbryt
          </button>
        </div>
      </div>
    </div>
  )
}
