'use client'

import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'
import { useFuel } from './FuelProvider'
import { FuelGauge } from './FuelGauge'

/**
 * Bränsle-sektionen på /dashboard/settings/billing — mellan USAGE OVERVIEW
 * och PLAN COMPARISON. FÅR ALDRIG innehålla "cogs"/"cost_ore"/"costOre"
 * (facit i tests/bransle-matare.spec.ts, samma regel som COGS-mätarens
 * eget facit) — se lib/costs/fuel.ts:s docstring för varför.
 */
export function FuelBillingCard() {
  const { level, refresh } = useFuel()
  const [topupLoading, setTopupLoading] = useState(false)

  // "Påfyllning syns direkt i mätaren" — hämta om Bränsle-nivån efter en
  // lyckad Stripe-redirect. window.location.search i stället för
  // next/navigation:s useSearchParams — den kräver en Suspense-boundary för
  // statisk rendering, onödig komplexitet för en engångskoll vid mount.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('fuel_topup') === 'success') refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!level) return null // fail-soft: hellre ingenting än en felaktig siffra

  const tanka = async () => {
    setTopupLoading(true)
    try {
      const res = await fetch('/api/billing/fuel-topup', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (data.checkout_url) window.location.href = data.checkout_url
      }
    } finally {
      setTopupLoading(false)
    }
  }

  const estimateText = level.weeksRemaining != null
    ? `Räcker till ungefär ${level.weeksRemaining === 1 ? '1 vecka' : `${level.weeksRemaining} veckor`} till som vanligt.`
    : 'Ingen förbrukning ännu den här perioden.'
  const calmText = level.state === 'normal'
    ? 'Ingen fara — teamet jobbar på som vanligt.'
    : 'Bra läge att tanka innan det börjar märkas.'

  const maxHistory = Math.max(1, ...level.history)

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
      <div className="flex items-center gap-3 mb-6">
        <Zap className="w-5 h-5 text-gray-700" />
        <h2 className="text-lg font-semibold text-gray-900">Bränsle</h2>
      </div>

      <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-center sm:items-start mb-6">
        <FuelGauge remainingPercent={level.remainingPercent} size={150} />
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <p className="text-[15px] font-semibold text-gray-800 mb-1">{estimateText}</p>
          <p className="text-sm text-gray-500 leading-relaxed mb-4">{calmText}</p>
          <div className="flex items-center gap-3 justify-center sm:justify-start">
            <button
              type="button"
              onClick={tanka}
              disabled={topupLoading}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary-700 hover:bg-primary-800 text-white text-sm font-medium transition-colors disabled:opacity-60"
            >
              {topupLoading ? 'Öppnar...' : 'Tanka mer'}
            </button>
            <span className="text-xs text-gray-400">Påfyllning syns direkt i mätaren</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
          <div className="text-[11px] font-semibold tracking-wide uppercase text-gray-400 mb-3">Vad bränslet går till</div>
          <div className="flex flex-col gap-2.5">
            {level.buckets.map(b => (
              <div key={b.key} className="flex items-center gap-2.5 text-sm text-gray-700">
                <span className="flex-1">{b.label}</span>
                <span className="w-28 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                  <span className="block h-1.5 rounded-full bg-primary-500" style={{ width: `${b.percent}%` }} />
                </span>
                <span className="w-9 text-right text-gray-500 text-xs">{b.percent}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
          <div className="text-[11px] font-semibold tracking-wide uppercase text-gray-400 mb-3">Förbrukning · senaste 30 dagarna</div>
          <div className="flex items-end gap-[3px] h-16">
            {level.history.map((v, i) => (
              <span
                key={i}
                className="flex-1 rounded-sm"
                style={{
                  height: `${Math.max(6, Math.round((v / maxHistory) * 64))}px`,
                  backgroundColor: i === level.highlightIndex ? '#14b8a6' : '#99f6e4',
                }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[11px] text-gray-400 mt-1.5">
            <span>för 30 dagar sen</span>
            <span>idag</span>
          </div>
        </div>
      </div>
    </div>
  )
}
