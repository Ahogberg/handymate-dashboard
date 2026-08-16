'use client'

import { CheckCircle2, Eye, ShieldAlert } from 'lucide-react'

export interface ForecastReceiptData {
  id: string
  status: 'watching' | 'verified' | 'unverifiable'
  predictedMarginPct: number
  actualMarginPct: number | null
  marginErrorPp: number | null
  leadTimeDays: number | null
  verificationBlocker: string | null
  createdAt: string
}

/** Samma sanningskvitto i chattscenariot och projektets efterkalkyl. */
export function ForecastReceipt({ forecast }: { forecast: ForecastReceiptData }) {
  if (forecast.status === 'watching') {
    return (
      <div className="flex items-start gap-2 text-xs text-teal-900">
        <Eye className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden />
        <div>
          <p className="m-0 font-semibold">Business Twin bevakar prognosen</p>
          <p className="m-0 mt-0.5 text-teal-800">
            Jämförs med den verifierade efterkalkylen när projektet avslutas.
          </p>
        </div>
      </div>
    )
  }

  if (forecast.status === 'unverifiable') {
    return (
      <div className="flex items-start gap-2 text-xs text-amber-900">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
        <div>
          <p className="m-0 font-semibold">Utfallet kunde inte jämföras säkert</p>
          <p className="m-0 mt-0.5 text-amber-800">{forecast.verificationBlocker || 'Efterkalkylen saknar tillräckligt underlag.'}</p>
        </div>
      </div>
    )
  }

  const error = forecast.marginErrorPp ?? 0
  const sign = error > 0 ? '+' : ''
  return (
    <div className="space-y-2 text-xs text-teal-950">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
        <div>
          <p className="m-0 font-semibold">Prognosen har fått ett verifierat utfall</p>
          <p className="m-0 mt-0.5 text-teal-800">
            Prognos {forecast.predictedMarginPct.toLocaleString('sv-SE')} % → utfall {forecast.actualMarginPct?.toLocaleString('sv-SE')} %
            {' · '}{sign}{error.toLocaleString('sv-SE')} procentenheter
          </p>
        </div>
      </div>
      {forecast.leadTimeDays != null && (
        <p className="m-0 pl-6 font-medium text-teal-800">
          Signalen fanns {forecast.leadTimeDays} {forecast.leadTimeDays === 1 ? 'dag' : 'dagar'} före avslut.
        </p>
      )}
    </div>
  )
}
