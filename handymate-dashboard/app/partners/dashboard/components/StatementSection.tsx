'use client'

// Provisionsunderlag per månad (partnerprogram v2, 2026-08-11):
// kund × månad × sats × belopp. Detta är en livevy av liggaren; den
// numrerade självfakturan blir ett separat fryst dokument när batchen skapas.

import { useState } from 'react'
import { FileText } from 'lucide-react'
import { formatSek, formatProcent, type Statement, type TierStep } from './types'

interface Props {
  statements: Statement[]
  tiers: TierStep[] | null
  legacyRate: number
  baseRateAfter: number
  currentTierRate: number | null
  activeCustomers: number
  ladderMonths: number
}

export default function StatementSection({
  statements, tiers, legacyRate, baseRateAfter, currentTierRate, activeCustomers, ladderMonths,
}: Props) {
  const [valdPeriod, setValdPeriod] = useState<string | null>(statements[0]?.period ?? null)
  const vald = statements.find(s => s.period === valdPeriod) ?? null

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-gray-900">Din provision</h2>
          {currentTierRate !== null && (
            <p className="text-sm text-gray-500 mt-0.5">
              Din nivå just nu: <span className="font-medium text-primary-700">{formatProcent(currentTierRate)}</span>
              {' '}({activeCustomers} aktiva kunder)
            </p>
          )}
        </div>
        {statements.length > 0 && (
          <select
            value={valdPeriod ?? ''}
            onChange={e => setValdPeriod(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:ring-2 focus:ring-primary-600 outline-none"
          >
            {statements.map(s => (
              <option key={s.period} value={s.period}>{s.period}</option>
            ))}
          </select>
        )}
      </div>

      {/* Trappan förklarad — partnerns FAKTISKA villkor, inte hårdkodad text */}
      <div className="px-5 py-3 bg-primary-50/50 border-b border-gray-100 text-sm text-primary-800">
        {Array.isArray(tiers) && tiers.length > 0 ? (
          <>
            Trappa:{' '}
            {[...tiers].sort((a, b) => a.min - b.min).map((t, i, arr) => (
              <span key={t.min}>
                {i > 0 && ' · '}
                <span className="font-medium">{formatProcent(t.rate)}</span>
                {' '}från {t.min === 0 ? 'start' : `${t.min} aktiva kunder`}
              </span>
            ))}
            {'. '}
          </>
        ) : (
          <>Provision: <span className="font-medium">{formatProcent(legacyRate)}</span>. </>
        )}
        Gäller kundens första {ladderMonths} kalendermånader — därefter{' '}
        <span className="font-medium">{formatProcent(baseRateAfter)}</span> så länge kunden betalar.
      </div>

      {statements.length === 0 || !vald ? (
        <div className="px-5 py-10 text-center">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Ingen provision ackruerad ännu</p>
          <p className="text-sm text-gray-400 mt-1">Underlaget byggs automatiskt månaden efter kundens betalning</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th className="px-5 py-3 font-medium">Kund</th>
                <th className="px-3 py-3 font-medium">Månad</th>
                <th className="px-3 py-3 font-medium">Sats</th>
                <th className="px-3 py-3 font-medium text-right">Belopp</th>
                <th className="px-5 py-3 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {vald.rows.map((rad, i) => (
                <tr key={i}>
                  <td className="px-5 py-3 text-gray-900">{rad.kund}</td>
                  <td className="px-3 py-3 text-gray-600">{rad.manad}</td>
                  <td className="px-3 py-3 text-gray-600">{formatProcent(rad.sats)}</td>
                  <td className="px-3 py-3 text-right font-medium text-gray-900">{formatSek(rad.belopp_sek)}</td>
                  <td className="px-5 py-3 text-right">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      rad.status === 'paid' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {rad.status === 'paid' ? 'Utbetald' : 'Upplupen'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-slate-50/50">
                <td colSpan={3} className="px-5 py-3 font-semibold text-gray-900">
                  {vald.all_paid ? 'Utbetalt för perioden' : 'Upplupet provisionsunderlag'}
                </td>
                <td className="px-3 py-3 text-right font-bold text-primary-700">{formatSek(vald.total_sek)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
