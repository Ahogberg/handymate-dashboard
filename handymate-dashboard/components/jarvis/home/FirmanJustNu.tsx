'use client'

import { useEffect, useState } from 'react'

/**
 * "Firman just nu" — högerspaltens pulskort (Etapp C4, 2026-08-17).
 *
 * Tre rader i mockupens label+värde+stapel+fotnot-form, var och en med
 * sin egen ärliga datakälla och sin egen tystnadsregel:
 *
 *   1. Pengar in · 5 veckor — cash-radar-API:t (see_financials-grindat;
 *      403/fel → raden döljs tyst, samma regel som CashRadarCard).
 *      Värdet är FAKTURERAT på väg in (verkliga fakturor, KÄNT); den
 *      viktade pipeline-potentialen står i fotnoten med ~. Etiketten
 *      säger "Pengar in", aldrig "Kassa" — API:t mäter inflöden över
 *      radarns fem veckor och ser inga utgifter.
 *   2. Beläggning — /api/dashboard/belaggning (tunt skal över
 *      lib/capacity/week-capacity.ts). pct null → raden döljs; gissad
 *      kapacitet (configured false) märks "uppskattat".
 *   3. Pengar på bordet — pengarData som JarvisHome redan hämtat
 *      (ägargrindad; null → raden döljs). Ingen stapel: det finns ingen
 *      ärlig skala att rita den mot.
 *
 * Företagsmarginal-raden ur mockupen är MEDVETET skuren (ingen pålitlig
 * månadsaggregering finns — X2-angränsande, se planens skärlista).
 * Inga rader alls → inget kort.
 */

interface RadarWeek {
  week_start: string
  invoiced_kr: number
  potential_kr: number
}

interface CashRadar {
  ready: boolean
  normal_kr: number
  weeks: RadarWeek[]
  dips: Array<{ week_start: string }>
}

interface Belaggning {
  pct: number | null
  fria_timmar_nasta_veckor: number | null
  configured: boolean
  vecka_start: number | null
  vecka_slut: number | null
}

function kr(n: number): string {
  return `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)} kr`
}

function Rad({
  label,
  varde,
  vardeClass,
  stapelPct,
  stapelClass,
  fotnot,
}: {
  label: string
  varde: string
  vardeClass: string
  stapelPct?: number
  stapelClass?: string
  fotnot: string
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline gap-2 mb-1">
        <span className="text-[13px] text-slate-500 min-w-0 truncate">{label}</span>
        <strong className={`font-heading tabular-nums text-[15px] font-semibold shrink-0 ${vardeClass}`}>
          {varde}
        </strong>
      </div>
      {stapelPct != null && (
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${stapelClass}`}
            style={{ width: `${Math.min(100, Math.max(0, stapelPct))}%` }}
          />
        </div>
      )}
      <p className="m-0 mt-1 text-xs text-slate-400">{fotnot}</p>
    </div>
  )
}

export function FirmanJustNu({ pengarTotalKr }: { pengarTotalKr: number | null }) {
  const [radar, setRadar] = useState<CashRadar | null>(null)
  const [belaggning, setBelaggning] = useState<Belaggning | null>(null)

  // Tyst hämtning: 403 (anställd utan see_financials) eller fel betyder
  // ingen rad — aldrig ett felmeddelande i railen.
  useEffect(() => {
    let aktiv = true
    fetch('/api/dashboard/cash-radar')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (aktiv && d && Array.isArray(d.weeks)) setRadar(d) })
      .catch(() => { /* raden är grädde, aldrig mjölk */ })
    fetch('/api/dashboard/belaggning')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (aktiv && d) setBelaggning(d) })
      .catch(() => { /* samma tystnadsregel */ })
    return () => { aktiv = false }
  }, [])

  // ── Rad 1: pengar in (cold start-gaten `ready` är API:ts egen) ─────────
  const radarKlar = radar != null && radar.ready && radar.weeks.length > 0
  const faktureratKr = radarKlar ? radar.weeks.reduce((s, w) => s + w.invoiced_kr, 0) : 0
  const potentialKr = radarKlar ? radar.weeks.reduce((s, w) => s + w.potential_kr, 0) : 0
  const normalPeriodKr = radarKlar ? radar.normal_kr * radar.weeks.length : 0
  const tunnPeriod = radarKlar && radar.dips.length > 0

  // ── Rad 2: beläggning ──────────────────────────────────────────────────
  const visaBelaggning = belaggning != null && belaggning.pct != null

  // ── Rad 3: pengar på bordet ────────────────────────────────────────────
  const visaPengar = pengarTotalKr != null

  if (!radarKlar && !visaBelaggning && !visaPengar) return null

  return (
    <div className="bg-white border border-slate-200 rounded-card p-4">
      <h3 className="m-0 mb-3 font-heading text-sm font-semibold text-slate-900">Firman just nu</h3>
      <div className="flex flex-col gap-3.5">
        {radarKlar && (
          <Rad
            label="Pengar in · 5 veckor"
            varde={kr(faktureratKr)}
            vardeClass={tunnPeriod ? 'text-amber-700' : 'text-slate-900'}
            stapelPct={normalPeriodKr > 0 ? (faktureratKr / normalPeriodKr) * 100 : 0}
            stapelClass={tunnPeriod ? 'bg-amber-500' : 'bg-primary-600'}
            fotnot={
              potentialKr > 0
                ? `Fakturerat. + ~${kr(potentialKr)} viktad potential · utgifter ingår inte`
                : 'Fakturerat på väg in · utgifter ingår inte'
            }
          />
        )}

        {visaBelaggning && (
          <Rad
            label={
              belaggning!.vecka_start != null && belaggning!.vecka_slut != null
                ? `Beläggning v${belaggning!.vecka_start}–v${belaggning!.vecka_slut}`
                : 'Beläggning'
            }
            varde={`${belaggning!.pct}%`}
            vardeClass={
              belaggning!.pct! >= 80 ? 'text-emerald-700'
                : belaggning!.pct! < 40 ? 'text-amber-700'
                : 'text-slate-900'
            }
            stapelPct={belaggning!.pct!}
            stapelClass={
              belaggning!.pct! >= 80 ? 'bg-emerald-500'
                : belaggning!.pct! < 40 ? 'bg-amber-500'
                : 'bg-primary-600'
            }
            fotnot={
              `${(belaggning!.fria_timmar_nasta_veckor ?? 0).toLocaleString('sv-SE')} tim fria de närmaste tre veckorna` +
              (belaggning!.configured ? '' : ' · uppskattat ur teamets storlek')
            }
          />
        )}

        {visaPengar && (
          <Rad
            label="Pengar på bordet"
            varde={kr(pengarTotalKr!)}
            vardeClass={pengarTotalKr! > 0 ? 'text-slate-900' : 'text-slate-400'}
            fotnot={
              pengarTotalKr! > 0
                ? 'Väntar på åtgärd — se Pengar just nu'
                : 'Inget ligger och väntar just nu'
            }
          />
        )}
      </div>
    </div>
  )
}
