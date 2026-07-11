'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

/**
 * Pengar in-radarn — 5 veckostaplar framåt (fakturerat + viktad potential)
 * mot företagets egen veckonormal, med Karins en-trycks-åtgärder vid tunna
 * veckor. Ren CSS, ingen chart-lib. Spec: tasks/cash-radar-spec.md.
 */

interface RadarWeek {
  week_start: string
  invoiced_kr: number
  potential_kr: number
}

type RadarAction =
  | { type: 'remind_invoice'; invoice_id: string; invoice_number: string | null; amount: number }
  | { type: 'nudge_quote'; quote_id: string; title: string | null; amount: number; already_pending: boolean }
  | { type: 'wake_customer'; link: string }

interface RadarDip {
  week_start: string
  expected_kr: number
  actions: RadarAction[]
}

interface CashRadar {
  ready: boolean
  normal_kr: number
  weeks: RadarWeek[]
  dips: RadarDip[]
}

function kr(n: number): string {
  return n.toLocaleString('sv-SE')
}

/** Kompakt beloppslabel under stapeln: "14 tkr" / "800 kr". */
function compactKr(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)} tkr` : `${kr(n)} kr`
}

/** ISO 8601-veckonummer (torsdagsregeln) ur ett ISO-datum, t.ex. '2026-07-06' → 28. */
function isoWeekNo(isoDate: string): number {
  const d = new Date(isoDate + 'T00:00:00Z')
  const dow = (d.getUTCDay() + 6) % 7 // mån=0 ... sön=6
  d.setUTCDate(d.getUTCDate() - dow + 3) // torsdagen i samma vecka
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const fdow = (firstThu.getUTCDay() + 6) % 7
  firstThu.setUTCDate(firstThu.getUTCDate() - fdow + 3) // årets första torsdag
  return 1 + Math.round((d.getTime() - firstThu.getTime()) / (7 * 86_400_000))
}

/** Skrafferad "potential"-yta: teal i halv styrka, diagonala ränder. */
const HATCH_STYLE = {
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(15,118,110,0.45) 0px, rgba(15,118,110,0.45) 4px, rgba(15,118,110,0.15) 4px, rgba(15,118,110,0.15) 8px)',
}

type RemindState = 'idle' | 'pending' | 'done' | 'error'
type NudgeState = 'idle' | 'pending' | 'created' | 'waiting' | 'error'

export default function CashRadarCard() {
  const [data, setData] = useState<CashRadar | null>(null)
  const [remindState, setRemindState] = useState<Record<string, RemindState>>({})
  const [nudgeState, setNudgeState] = useState<Record<string, NudgeState>>({})

  useEffect(() => {
    let active = true
    fetch('/api/dashboard/cash-radar')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (active) setData(d)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  async function remind(invoiceId: string) {
    setRemindState(s => ({ ...s, [invoiceId]: 'pending' }))
    try {
      const r = await fetch(`/api/invoices/${invoiceId}/reminder`, { method: 'POST' })
      setRemindState(s => ({ ...s, [invoiceId]: r.ok ? 'done' : 'error' }))
    } catch {
      setRemindState(s => ({ ...s, [invoiceId]: 'error' }))
    }
  }

  async function nudge(quoteId: string) {
    setNudgeState(s => ({ ...s, [quoteId]: 'pending' }))
    try {
      const r = await fetch('/api/dashboard/cash-radar/nudge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_id: quoteId }),
      })
      const d = r.ok ? await r.json() : null
      if (d?.ok) {
        setNudgeState(s => ({ ...s, [quoteId]: d.already_pending ? 'waiting' : 'created' }))
      } else {
        setNudgeState(s => ({ ...s, [quoteId]: 'error' }))
      }
    } catch {
      setNudgeState(s => ({ ...s, [quoteId]: 'error' }))
    }
  }

  if (!data || !Array.isArray(data.weeks)) return null

  // Cold start: prognosen kräver några veckors fakturahistorik. Visa INGET
  // tills den är redo — ett löfteskort är bara brus för ett nytt konto, och
  // interna namn ("radarn", "normal") hör aldrig hemma i UI-text.
  if (!data.ready) return null

  // Skala: högsta veckostapeln ELLER normalen (så att normal-linjen alltid ryms).
  const maxScale = Math.max(data.normal_kr, ...data.weeks.map(w => w.invoiced_kr + w.potential_kr), 1)
  const dipWeeks = new Set(data.dips.map(d => d.week_start))
  const actions = data.dips[0]?.actions || []

  return (
    <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-2 mb-4 flex-wrap">
        <h2 className="text-base font-bold text-gray-900">Pengar in — 5 veckor framåt</h2>
        <span className="text-xs text-gray-400">en vanlig vecka: ~{kr(data.normal_kr)} kr</span>
      </div>

      {/* Staplarna */}
      <div className="relative h-28">
        {/* Normal-linjen */}
        <div
          className="absolute left-0 right-0 border-t-2 border-dashed border-gray-300 z-0"
          style={{ bottom: `${(data.normal_kr / maxScale) * 100}%` }}
        />
        <div className="relative z-10 flex items-end gap-2 h-full">
          {data.weeks.map(w => {
            const total = w.invoiced_kr + w.potential_kr
            const isDip = dipWeeks.has(w.week_start)
            return (
              <div key={w.week_start} className="flex-1 h-full flex flex-col justify-end items-stretch">
                {total > 0 ? (
                  <div
                    className={`flex flex-col rounded-t-md overflow-hidden ${
                      isDip ? 'ring-2 ring-amber-400' : ''
                    }`}
                    style={{ height: `${Math.max((total / maxScale) * 100, 3)}%` }}
                  >
                    {w.potential_kr > 0 && <div style={{ ...HATCH_STYLE, flexGrow: w.potential_kr }} />}
                    {w.invoiced_kr > 0 && <div className="bg-primary-700" style={{ flexGrow: w.invoiced_kr }} />}
                  </div>
                ) : (
                  <div className={`h-1 rounded-full bg-gray-200 ${isDip ? 'ring-2 ring-amber-400' : ''}`} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Veckolabels */}
      <div className="flex gap-2 mt-1.5">
        {data.weeks.map(w => {
          const total = w.invoiced_kr + w.potential_kr
          const isDip = dipWeeks.has(w.week_start)
          return (
            <div key={w.week_start} className="flex-1 text-center min-w-0">
              <div className={`text-[11px] font-medium ${isDip ? 'text-amber-600' : 'text-gray-600'}`}>
                {isDip ? '⚠ ' : ''}v.{isoWeekNo(w.week_start)}
              </div>
              <div className="text-[11px] text-gray-400 truncate">{compactKr(total)}</div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Visar pengar in (fakturor + viktad potential). Utgifter ingår inte.
      </p>

      {/* Karins åtgärder vid tunna veckor */}
      {data.dips.length > 0 && actions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-sm font-bold text-gray-900 mb-2">Karin föreslår:</p>
          <div className="space-y-2">
            {actions.map((a, idx) => {
              if (a.type === 'remind_invoice') {
                const st = remindState[a.invoice_id] || 'idle'
                if (st === 'done') {
                  return (
                    <div key={`r-${a.invoice_id}`} className="text-sm font-medium text-emerald-700">
                      ✓ Påmind{a.invoice_number ? ` — faktura ${a.invoice_number}` : ''}
                    </div>
                  )
                }
                return (
                  <div key={`r-${a.invoice_id}`}>
                    <button
                      onClick={() => remind(a.invoice_id)}
                      disabled={st === 'pending'}
                      className="w-full sm:w-auto text-left text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 px-3 py-2 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {st === 'pending'
                        ? 'Skickar påminnelse…'
                        : `Påminn ${a.invoice_number ? `faktura ${a.invoice_number}` : 'fakturan'} (${kr(a.amount)} kr)`}
                    </button>
                    {st === 'error' && (
                      <p className="text-xs text-red-600 mt-1">
                        Påminnelsen kunde inte skickas — försök igen om en stund.
                      </p>
                    )}
                  </div>
                )
              }
              if (a.type === 'nudge_quote') {
                const st = nudgeState[a.quote_id] || 'idle'
                if (a.already_pending || st === 'waiting') {
                  return (
                    <div key={`n-${a.quote_id}`} className="text-sm font-medium text-emerald-700">
                      ✓ Förslag väntar{a.title ? ` — ${a.title}` : ''}
                    </div>
                  )
                }
                if (st === 'created') {
                  return (
                    <div key={`n-${a.quote_id}`} className="text-sm font-medium text-emerald-700">
                      ✓ Förslag skapat — godkänn under{' '}
                      <Link href="/dashboard/approvals" className="underline">
                        Att godkänna
                      </Link>
                    </div>
                  )
                }
                return (
                  <div key={`n-${a.quote_id}`}>
                    <button
                      onClick={() => nudge(a.quote_id)}
                      disabled={st === 'pending'}
                      className="w-full sm:w-auto text-left text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 px-3 py-2 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {st === 'pending'
                        ? 'Skapar förslag…'
                        : `Jaga offerten${a.title ? `: ${a.title}` : ''} (${kr(a.amount)} kr)`}
                    </button>
                    {st === 'error' && (
                      <p className="text-xs text-red-600 mt-1">
                        Förslaget kunde inte skapas — försök igen om en stund.
                      </p>
                    )}
                  </div>
                )
              }
              return (
                <div key={`w-${idx}`}>
                  <Link
                    href={a.link}
                    className="text-sm font-medium text-primary-700 hover:text-primary-800 underline"
                  >
                    Väck en gammal kund →
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
