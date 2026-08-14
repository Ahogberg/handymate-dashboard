'use client'

import { useState } from 'react'
import { useFuel } from '@/components/fuel/FuelProvider'
import { FuelGauge } from '@/components/fuel/FuelGauge'

/**
 * Bränsle-varningen i "Det här behöver dig idag" — bespoke JSX, INTE en
 * pending_approvals-rad/approval_type. ApprovalCard bygger sin knapprad ur
 * godkänn/avvisa-kontraktet; det här kortet har varken, bara en länk-knapp.
 * Samma mönster som mandagskortApproval-bannern i JarvisHome.tsx (också
 * bespoke, av samma skäl). Beräknas live ur useFuel() — ingen ny cron,
 * ingen dedup-logik, ingen databasrad.
 */
export function FuelWarningCard() {
  const { level } = useFuel()
  const [loading, setLoading] = useState(false)

  if (!level || level.state !== 'critical') return null

  const tanka = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/fuel-topup', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (data.checkout_url) window.location.href = data.checkout_url
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
          <img src="/logo.png" alt="Handymate" className="w-6 h-6 object-contain" />
        </div>
        <span className="text-xs text-slate-500 flex-1 min-w-0 truncate">
          <b className="font-semibold text-slate-900">Handymate</b> · systemet säger till
        </span>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 whitespace-nowrap">
          Bränsle
        </span>
      </div>

      <h3 className="text-[15px] font-semibold text-slate-900 mb-0.5">
        Bränslet börjar ta slut — {level.remainingPercent}% kvar
      </h3>
      <p className="text-sm text-slate-500 mb-3">
        {level.weeksRemaining != null
          ? `Räcker ungefär ${level.weeksRemaining === 1 ? 'en vecka' : `${level.weeksRemaining} veckor`} till i nuvarande takt.`
          : 'Håll ett öga på förbrukningen den här månaden.'}
      </p>

      <div className="flex items-center gap-3 mb-3">
        <FuelGauge remainingPercent={level.remainingPercent} size={20} showLabel={false} strokeWidth={3} />
        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full bg-amber-500" style={{ width: `${level.remainingPercent}%` }} />
        </div>
      </div>

      <button
        type="button"
        onClick={tanka}
        disabled={loading}
        className="w-full bg-primary-700 text-white text-sm font-medium rounded-xl py-2.5 hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading ? 'Öppnar...' : 'Tanka nu'}
      </button>
    </div>
  )
}
