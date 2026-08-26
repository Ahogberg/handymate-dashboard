'use client'

import Link from 'next/link'
import { useFuel } from '@/components/fuel/FuelProvider'
import { FuelGauge } from '@/components/fuel/FuelGauge'
import { weeksRemainingPhrase } from '@/lib/costs/fuel'

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

  if (!level || level.state !== 'critical') return null

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
        {level.exhausted ? 'Bränslet är slut — teamet väntar' : `Bränslet börjar ta slut — ${level.remainingPercent}% kvar`}
      </h3>
      <p className="text-sm text-slate-500 mb-3">
        {level.exhausted
          ? 'Välj en påfyllning för att starta nytt AI-arbete och nya utskick igen.'
          : level.weeksRemaining != null
          ? `${weeksRemainingPhrase(level.weeksRemaining, level.daysRemaining)} i nuvarande takt.`
          : 'Håll ett öga på förbrukningen den här perioden.'}
      </p>

      <div className="flex items-center gap-3 mb-3">
        <FuelGauge remainingPercent={level.remainingPercent} size={20} showLabel={false} strokeWidth={3} />
        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full bg-amber-500" style={{ width: `${level.remainingPercent}%` }} />
        </div>
      </div>

      <Link
        href="/dashboard/settings/billing#fuel"
        className="block w-full bg-primary-700 text-white text-sm font-medium text-center rounded-xl py-2.5 hover:opacity-90 transition-opacity"
      >
        Välj påfyllning
      </Link>
    </div>
  )
}
