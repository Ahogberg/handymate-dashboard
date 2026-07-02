'use client'

import { useEffect, useState } from 'react'

/**
 * "Din vecka med Handymate" — veckovärde i tre ärligt etiketterade nivåer,
 * lett av bekräftade kronor. Lyfter värdet till huvud-dashboarden (tidigare
 * begravt på /dashboard/agent). Döljs vid cold start (inget att skryta om än).
 */

interface WeeklyValue {
  range_days: number
  confirmed_kr: number
  confirmed_items: Array<{ label: string; amount: number }>
  captured_count: number
  captured_kr: number
  time_minutes: number
  time_hours: number
  autonomous_count: number
}

function kr(n: number): string {
  return n.toLocaleString('sv-SE')
}

export default function WeeklyValueDigest() {
  const [data, setData] = useState<WeeklyValue | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetch('/api/dashboard/weekly-value')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (active) {
          setData(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  if (loading || !data) return null

  // Cold start: visa inget förrän det finns något att skryta om.
  const hasValue = data.confirmed_kr > 0 || data.captured_count > 0 || data.time_minutes > 0
  if (!hasValue) return null

  return (
    <div className="mb-6 rounded-2xl border border-primary-100 bg-gradient-to-br from-primary-50 to-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-gray-900">Din vecka med Handymate</h2>
        <span className="text-xs text-gray-400">senaste 7 dagarna</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Nivå 1 — bekräftade kronor (hårdast, leder) */}
        <div className="sm:border-r sm:border-primary-100 sm:pr-4">
          <div className="text-2xl sm:text-3xl font-extrabold text-primary-700">{kr(data.confirmed_kr)} kr</div>
          <div className="text-sm font-medium text-gray-700">intjänat</div>
          <div className="text-xs text-gray-400">bekräftat · offert + faktura efter påminnelse</div>
        </div>

        {/* Nivå 2 — fångad potential */}
        <div className="sm:border-r sm:border-primary-100 sm:pr-4">
          <div className="text-2xl sm:text-3xl font-extrabold text-gray-900">
            {data.captured_count} jobb
          </div>
          <div className="text-sm font-medium text-gray-700">fångade ~{kr(data.captured_kr)} kr</div>
          <div className="text-xs text-gray-400">potential · leads du annars kunnat missa</div>
        </div>

        {/* Nivå 3 — sparad tid (uppskattning) */}
        <div>
          <div className="text-2xl sm:text-3xl font-extrabold text-gray-900">~{data.time_hours} tim</div>
          <div className="text-sm font-medium text-gray-700">sparat åt dig</div>
          <div className="text-xs text-gray-400">uppskattat</div>
          {data.autonomous_count > 0 && (
            <div className="text-xs text-primary-700 mt-1">
              varav {data.autonomous_count} utförda självständigt
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
