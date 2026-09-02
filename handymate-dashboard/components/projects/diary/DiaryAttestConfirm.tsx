'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, Lock } from 'lucide-react'
import { formatDiaryDate, type DiaryRow } from './types'

/**
 * Bekräftelse före attest. Attest LÅSER raden — det är poängen (bevisvärde
 * vid tvist), men det ska sägas rakt ut innan man trycker.
 */
export default function DiaryAttestConfirm({
  row,
  onCancel,
  onConfirm,
}: {
  row: DiaryRow
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)

  const bekrafta = async () => {
    setBusy(true)
    try { await onConfirm() } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-[#E2E8F0] shadow-xl p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900">Attestera dagboksraden?</h3>
            <p className="text-sm text-gray-600 mt-1">
              {formatDiaryDate(row.date)}
              {row.business_user?.name ? ` · ${row.business_user.name}` : ''}
            </p>
            <p className="text-sm text-gray-600 mt-3 flex items-start gap-2">
              <Lock className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <span>
                Raden låses och kan inte längre redigeras eller tas bort. Det som behöver
                läggas till efteråt skrivs som tilläggsanteckning — så håller dagboken
                vid en tvist.
              </span>
            </p>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-lg text-sm text-gray-600 hover:text-gray-900"
          >
            Avbryt
          </button>
          <button
            onClick={bekrafta}
            disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-700 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Attestera och lås
          </button>
        </div>
      </div>
    </div>
  )
}
