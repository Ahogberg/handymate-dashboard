'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, PartyPopper, Lightbulb } from 'lucide-react'

/**
 * ProjectCloseoutModal (2026-08-13 — "Project Closeout Magic", ÄTA+ekonomi-
 * scope, Andreas beslut: ingen kundfakta-/mötesräkning i den här omgången).
 *
 * Visas EN gång, direkt efter att ett projekt verkligen blir 'completed'
 * (inte vid ett fyra-ögon-gated försök — se anropsstället i
 * app/dashboard/projects/[id]/page.tsx). Läser samma /efterkalkyl-rutt
 * som EfterkalkylCard redan använder, plus den nytillagda ata_count.
 *
 * Ärlighetsprincip (samma som EfterkalkylCard/MarginalCard): finns ingen
 * frusen outcome-rad, eller är intern timkostnad inte konfigurerad, visas
 * bara det som verkligen går att räkna fram — aldrig en påhittad siffra.
 */

interface ProjectOutcome {
  quote_id: string | null
  quoted_amount: number | null
  ata_signed_kr: number | null
  invoiced_kr: number | null
  margin_kr: number | null
  margin_pct: number | null
  labor_cost_configured: boolean
}

interface ExpectedMarginSnapshot {
  margin_pct: number | null
}

interface Props {
  projectId: string
  projectName: string
  onClose: () => void
}

function formatKr(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' kr'
}

export default function ProjectCloseoutModal({ projectId, projectName, onClose }: Props) {
  const [outcome, setOutcome] = useState<ProjectOutcome | null>(null)
  const [expectedMargin, setExpectedMargin] = useState<ExpectedMarginSnapshot | null>(null)
  const [ataCount, setAtaCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectId}/efterkalkyl`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setOutcome(data.outcome || null)
        setExpectedMargin(data.expected_margin_snapshot || null)
        setAtaCount(typeof data.ata_count === 'number' ? data.ata_count : null)
      } catch {
        // Tyst degradering — modalen visar bara det som gick att hämta.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [projectId])

  // Ärlighetsprincip: ingen frusen outcome-rad → inget att visa. Skickar
  // hellre ingen skärm alls än en skärm med gissade siffror.
  if (loading || !outcome) return null

  const ataAmount = outcome.ata_signed_kr || 0
  const slutvarde = (outcome.quoted_amount || 0) + ataAmount

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <PartyPopper className="w-5 h-5 text-primary-700" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">{projectName} är klart</h2>
              <p className="text-xs text-gray-400">Resultat</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {outcome.quote_id ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Offert</span>
                <span className="font-medium text-slate-900 tabular-nums">{formatKr(outcome.quoted_amount)}</span>
              </div>
              {ataAmount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">ÄTA{typeof ataCount === 'number' && ataCount > 0 ? ` (${ataCount} st)` : ''}</span>
                  <span className="font-medium text-slate-900 tabular-nums">+{formatKr(ataAmount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="font-semibold text-slate-700">Slutvärde</span>
                <span className="font-bold text-slate-900 tabular-nums">{formatKr(slutvarde)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Ingen offert kopplad — inget resultat att visa.</p>
          )}

          {outcome.labor_cost_configured ? (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Marginal (utfall)</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {formatKr(outcome.margin_kr)}
                  {outcome.margin_pct != null ? ` (${outcome.margin_pct}%)` : ''}
                </span>
              </div>
              {expectedMargin?.margin_pct != null && (
                <p className="text-xs text-slate-400 mt-1 tabular-nums">
                  Förväntad vid accept: {expectedMargin.margin_pct}%
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-amber-700">
              Intern timkostnad ej konfigurerad — marginal visas inte.
            </p>
          )}

          <Link
            href="/dashboard/approvals"
            onClick={onClose}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-primary-700 text-white text-sm font-semibold hover:bg-primary-800 transition-colors"
          >
            <Lightbulb className="w-4 h-4" />
            Tre snabba så blir nästa jobb bättre
          </Link>
        </div>
      </div>
    </div>
  )
}
