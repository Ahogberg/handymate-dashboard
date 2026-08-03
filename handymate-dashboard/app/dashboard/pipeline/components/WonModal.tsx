'use client'

import { PartyPopper, X } from 'lucide-react'
import { usePipelineContext } from '../context'

/**
 * "Grattis — affären är vunnen!"-modalen — öppnas via moveDealAction när
 * användaren flyttar (drag eller stegväljare) ett deal till ett is_won-steg
 * och dealen ännu inte har ett kopplat projekt. Speglar LossModal fast
 * omvänt (fråga istället för tvingande fält).
 */
export function WonModal() {
  const {
    showWonModal,
    dismissWonModal,
    deals,
    wonDealId,
    creatingProjectFromWon,
    createProjectFromWonDeal,
  } = usePipelineContext()

  if (!showWonModal) return null

  const deal = deals.find(d => d.id === wonDealId)

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={() => !creatingProjectFromWon && dismissWonModal()} />
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-2xl w-full max-w-md">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <PartyPopper className="w-5 h-5 text-primary-700" />
              Grattis — affären är vunnen!
            </h2>
            <button
              onClick={dismissWonModal}
              disabled={creatingProjectFromWon}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6">
            <p className="text-sm text-gray-600">
              {deal?.title ? <><span className="font-medium text-gray-900">{deal.title}</span> är nu vunnen. </> : null}
              Vill du skapa ett projekt av dealen?
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
            <button
              onClick={dismissWonModal}
              disabled={creatingProjectFromWon}
              className="px-4 py-2 rounded-lg bg-gray-100 border border-[#E2E8F0] text-sm text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50"
            >
              Inte nu
            </button>
            <button
              onClick={createProjectFromWonDeal}
              disabled={creatingProjectFromWon}
              className="px-4 py-2 rounded-lg bg-primary-700 text-white text-sm font-medium hover:bg-primary-800 disabled:opacity-50 transition-colors"
            >
              {creatingProjectFromWon ? 'Skapar projekt...' : 'Skapa projekt'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
