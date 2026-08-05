'use client'

import { useEffect, useState } from 'react'
import { Users, ShieldAlert } from 'lucide-react'
import { useCurrentUser } from '@/lib/CurrentUserContext'

/**
 * PerPersonCard (R4-E, tasks/resurs-masterplan.md) — Lönsamhet per person.
 *
 * Självförsörjande — precis som EfterkalkylCard/ProjectEconomicsCard hämtar
 * den sin egen data (/api/projects/[id]/profitability/per-person). Kräver
 * owner/admin: dubbelt skydd, precis som mönstret i övriga interna
 * kostnadsytor (Inställningar → Interna kostnader) —
 * 1) klient: useCurrentUser().isOwnerOrAdmin styr om vi ens fetchar,
 * 2) server: routen 403:ar icke-owner/admin oavsett (se route.ts).
 *
 * Renderar INGENTING (return null) för icke-owner/admin, eller om
 * projektet inte har några fakturarader med utförare kopplad än.
 */

interface PersonProfitabilityRow {
  business_user_id: string
  name: string
  color: string | null
  fakturerat_kr: number
  timmar: number
  kostnad_kr: number | null
  marginal_kr: number | null
  kostnad_konfigurerad: boolean
}

interface PerPersonCardProps {
  projectId: string
  refreshKey?: number
}

function formatKr(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(n)
}

function formatHours(n: number): string {
  return `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 }).format(n)} h`
}

export function PerPersonCard({ projectId, refreshKey = 0 }: PerPersonCardProps) {
  const { isOwnerOrAdmin, loading: userLoading } = useCurrentUser()
  const [rows, setRows] = useState<PersonProfitabilityRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [someMissingCost, setSomeMissingCost] = useState(false)

  useEffect(() => {
    if (userLoading) return
    if (!isOwnerOrAdmin) {
      setLoading(false)
      return
    }

    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectId}/profitability/per-person`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        const list: PersonProfitabilityRow[] = data.rows || []
        setRows(list)
        setSomeMissingCost(list.some(r => !r.kostnad_konfigurerad))
      } catch {
        // Tyst degradering — sektionen visas bara inte.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [projectId, refreshKey, isOwnerOrAdmin, userLoading])

  if (userLoading || loading || !isOwnerOrAdmin) return null
  if (!rows || rows.length === 0) return null

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <div className="flex items-baseline justify-between mb-4">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <Users className="w-3 h-3" />
          Lönsamhet per person
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400">
          <ShieldAlert className="w-3 h-3" />
          Endast ägare/admin
        </span>
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-1 py-2 font-semibold">Person</th>
              <th className="px-1 py-2 font-semibold text-right">Fakturerat</th>
              <th className="px-1 py-2 font-semibold text-right">Timmar</th>
              <th className="px-1 py-2 font-semibold text-right">Kostnad</th>
              <th className="px-1 py-2 font-semibold text-right">Marginal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.business_user_id} className="border-t border-slate-100">
                <td className="px-1 py-2.5">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"
                      style={{ backgroundColor: row.color || '#94A3B8' }}
                    />
                    <span className="font-medium text-slate-700">{row.name}</span>
                  </span>
                </td>
                <td className="px-1 py-2.5 text-right tabular-nums text-slate-700">{formatKr(row.fakturerat_kr)}</td>
                <td className="px-1 py-2.5 text-right tabular-nums text-slate-500">{formatHours(row.timmar)}</td>
                <td className="px-1 py-2.5 text-right tabular-nums text-slate-500">
                  {row.kostnad_konfigurerad ? formatKr(row.kostnad_kr) : '—'}
                </td>
                <td
                  className={`px-1 py-2.5 text-right tabular-nums font-semibold ${
                    row.marginal_kr == null
                      ? 'text-slate-400'
                      : row.marginal_kr >= 0
                      ? 'text-emerald-700'
                      : 'text-red-700'
                  }`}
                >
                  {row.marginal_kr == null ? '—' : formatKr(row.marginal_kr)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {someMissingCost && (
        <p className="text-xs text-amber-700 mt-3">
          Intern timkostnad saknas för minst en person — kostnad/marginal visas inte för den raden
          (samma princip som ekonomikorten ovan).
        </p>
      )}
    </div>
  )
}
