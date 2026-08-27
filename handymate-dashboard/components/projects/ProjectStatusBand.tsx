'use client'

import Link from 'next/link'
import { Check } from 'lucide-react'
import { formatSEK } from '@/lib/format-price'
import type { ProjectEconomics } from '@/lib/projects/compute-economics'
import type { Fakturaberedskap, FakturaberedskapDel } from '@/lib/projects/fakturaberedskap'
import type { StageBucket } from '@/lib/projects/derive-todo'
import { deriveMarginalState } from '@/components/projects/economy/MarginalCard'

/**
 * Statusbandet (Claude Design-handoff "Projektöversikt — Statusbandet",
 * 2026-08-26). ETT kort som ersätter KPI-raden, "Hur ligger vi till?"-
 * kortet, "Redo att fakturera?"-panelen och Ekonomi-pulsen på Översikt —
 * varje uppgift visas exakt en gång.
 *
 *   Zon 1  3-stegs stepper (Planering → Pågående → Klart) ur samma
 *          stageBucket som resten av sidan + "Visa alla 8 steg" (öppnar
 *          den befintliga stegmodalen — motorns 8 steg är sanningen, tre
 *          är vad hantverkaren vill läsa).
 *   Zon 2  Ekonomistaplarna (Offererat / Nedlagt / Fakturerat) + prognos.
 *          Planering utan arbete: BARA offererat + notis, aldrig nollstaplar.
 *          Utan see_financials: "Ekonomin visas för ägaren."
 *   Zon 3  Redo att fakturera — MEDVETET INTE en procent (handoffen hade
 *          "67 %"): aggregatets pct är medel av de delar som råkar ha data
 *          och hoppar när en flik öppnas. I stället klarspråk: "Ja — X kr
 *          ofakturerat" / "Nej — {värsta blockeraren}" + delraderna, och
 *          marginalen per 5-statskontraktet (färg först vid bekräftad).
 */

interface ProjectStatusBandProps {
  stageBucket: StageBucket
  canSeeFinancials: boolean
  economics: ProjectEconomics | null
  economicsLoading: boolean
  beredskap: Fakturaberedskap | null
  /** Ofakturerat belopp — null utan see_financials. */
  uninvoicedKr: number | null
  onShowAllStages: () => void
}

const STEPS: Array<{ key: StageBucket; label: string }> = [
  { key: 'planering', label: 'Planering' },
  { key: 'pagaende', label: 'Pågående' },
  { key: 'klart', label: 'Klart' },
]

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-[10.5px] tracking-[0.14em] font-semibold uppercase text-slate-400">{children}</div>
}

function Stepper({ bucket }: { bucket: StageBucket }) {
  const idx = STEPS.findIndex(s => s.key === bucket)
  return (
    <div className="flex items-start mt-4">
      {STEPS.map((s, i) => {
        const done = i < idx
        const current = i === idx
        const green = current && s.key === 'klart'
        const ringCls = green ? 'ring-emerald-500' : 'ring-primary-700'
        const dotCls = current ? (green ? 'bg-emerald-500' : 'bg-primary-700') : 'bg-slate-300'
        const labelCls = done ? 'text-primary-700' : current ? (green ? 'text-emerald-600' : 'text-primary-700') : 'text-slate-400'
        return (
          <div key={s.key} className={`flex items-start min-w-0 ${i < STEPS.length - 1 ? 'flex-1' : 'flex-none'}`}>
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={`w-6 h-6 rounded-full inline-flex items-center justify-center flex-shrink-0 ${
                  done ? 'bg-primary-700 text-white' : current ? `bg-white ring-2 ${ringCls}` : 'bg-slate-100'
                }`}
                aria-current={current ? 'step' : undefined}
              >
                {done ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <span className={`w-2 h-2 rounded-full ${dotCls}`} />}
              </span>
              <span className={`text-[11px] font-semibold whitespace-nowrap ${labelCls}`}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <span className={`h-0.5 flex-1 min-w-[16px] mt-[11px] mx-2 rounded ${done ? 'bg-primary-700' : 'bg-slate-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function Bar({ label, value, pct, colorCls }: { label: string; value: string; pct: number; colorCls: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-[3px]">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <span className="font-heading text-[13px] font-bold text-slate-900 tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <span className={`block h-full rounded-full ${colorCls}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  )
}

function EconomyZone({ economics, loading, bucket }: { economics: ProjectEconomics | null; loading: boolean; bucket: StageBucket }) {
  if (loading && !economics) {
    return <p className="text-xs text-slate-400 my-6">Hämtar ekonomin…</p>
  }
  if (!economics) {
    return <p className="text-xs text-slate-400 my-6">Ekonomin kunde inte hämtas.</p>
  }
  const offererat = economics.intakter.forvantad_intakt_kr
  const nedlagt = economics.kostnader.total_kr
  const fakturerat = economics.intakter.fakturerat_kr
  const ingetArbete = (nedlagt ?? 0) <= 0 && fakturerat <= 0 && economics.kostnader.arbete_timmar <= 0

  if (bucket === 'planering' && ingetArbete) {
    return (
      <div className="flex flex-col justify-center gap-2 h-full min-h-[96px]">
        <div className="flex items-baseline justify-between max-w-[320px]">
          <span className="text-xs font-medium text-slate-500">Offererat</span>
          <span className="font-heading text-[15px] font-bold text-slate-900 tabular-nums">{formatSEK(offererat)}</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed max-w-[320px] m-0">
          Inget nedlagt eller fakturerat än — staplarna fylls när arbetet börjar.
        </p>
      </div>
    )
  }

  const pct = (v: number) => (offererat > 0 ? (v / offererat) * 100 : 0)
  const kvar = Math.max(0, offererat - fakturerat)
  const inomBudget = nedlagt != null && offererat > 0 && nedlagt <= offererat
  const overBudget = nedlagt != null && offererat > 0 && nedlagt > offererat

  return (
    <div>
      <div className="flex flex-col gap-[9px]">
        <Bar label="Offererat" value={formatSEK(offererat)} pct={offererat > 0 ? 100 : 0} colorCls="bg-primary-700" />
        {nedlagt == null ? (
          <div>
            <div className="flex items-baseline justify-between mb-[3px]">
              <span className="text-xs font-medium text-slate-500">Nedlagt</span>
              {/* Lars ber om intern timkostnad HÄR — där marginalen ska bedömas —
                  i stället för i onboardingen (Lager 3 / B10, 2026-08-27). */}
              <Link href="/dashboard/settings?tab=economics" className="text-xs text-amber-700 font-semibold hover:underline">
                Timkostnad ej satt — ange den →
              </Link>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full" />
          </div>
        ) : (
          <Bar label="Nedlagt" value={formatSEK(nedlagt)} pct={pct(nedlagt)} colorCls={overBudget ? 'bg-red-500' : 'bg-amber-500'} />
        )}
        <Bar label="Fakturerat" value={formatSEK(fakturerat)} pct={pct(fakturerat)} colorCls="bg-emerald-500" />
      </div>
      <div className="flex items-center gap-2 mt-2.5">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${overBudget ? 'bg-red-500' : inomBudget ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        <span className="text-xs font-medium text-slate-700">
          {overBudget
            ? `Över offererat med ${formatSEK(nedlagt - offererat)}`
            : inomBudget
              ? `Inom budget · kvar att fakturera ${formatSEK(kvar)}`
              : `kvar att fakturera ${formatSEK(kvar)}`}
        </span>
      </div>
    </div>
  )
}

function delVarde(del: FakturaberedskapDel, uninvoicedKr: number | null): React.ReactNode {
  const klar = del.done >= del.total
  const ok = 'text-[12.5px] font-semibold text-emerald-700 whitespace-nowrap'
  const warn = 'text-[12.5px] font-semibold text-amber-700 whitespace-nowrap'
  if (del.total === 1) {
    if (del.key === 'underlag' && klar && uninvoicedKr != null && uninvoicedKr > 0) {
      return <span className={`${ok} tabular-nums`}>{formatSEK(uninvoicedKr)}</span>
    }
    return <span className={klar ? ok : warn}>{klar ? 'Klar' : 'Saknas'}</span>
  }
  return <span className={`${klar ? ok : warn} tabular-nums`}>{del.done} av {del.total}</span>
}

function MarginalRow({ economics }: { economics: ProjectEconomics }) {
  const state = deriveMarginalState(economics)
  const kr = economics.marginal.marginal_kr
  const pctVal = economics.marginal.marginal_pct
  let value: React.ReactNode
  let sub: string | null = null
  switch (state) {
    case 'gate':
      value = (
        <Link href="/dashboard/settings?tab=economics" className="text-[12.5px] font-semibold text-amber-700 hover:underline">
          Timkostnad ej satt — ange den →
        </Link>
      )
      break
    case 'empty':
      value = <span className="font-heading text-base font-bold text-slate-400">—</span>
      break
    case 'confirmed': {
      const neg = (kr ?? 0) < 0
      value = (
        <span className={`font-heading text-base font-bold tabular-nums ${neg ? 'text-red-600' : 'text-emerald-700'}`}>
          {neg ? '' : '+'}{formatSEK(kr ?? 0)}{pctVal != null ? ` (${Math.round(pctVal)}%)` : ''}
        </span>
      )
      sub = 'Bekräftad'
      break
    }
    default:
      value = <span className="font-heading text-base font-bold tabular-nums text-slate-700">{formatSEK(kr ?? 0)}</span>
      sub = 'Preliminär'
  }
  return (
    <div className="border-t border-slate-100 mt-3 pt-2.5 flex items-baseline justify-between gap-2.5">
      <Eyebrow>Marginal</Eyebrow>
      <span className="text-right">
        {value}
        {sub && <span className="text-[11px] text-slate-400 ml-1">{sub}</span>}
      </span>
    </div>
  )
}

export function ProjectStatusBand({
  stageBucket,
  canSeeFinancials,
  economics,
  economicsLoading,
  beredskap,
  uninvoicedKr,
  onShowAllStages,
}: ProjectStatusBandProps) {
  const redo = !beredskap
    ? { text: 'Underlag saknas', tone: 'muted' as const }
    : beredskap.pct >= 100
      ? { text: uninvoicedKr != null && uninvoicedKr > 0 ? `Ja — ${formatSEK(uninvoicedKr)} ofakturerat` : 'Ja', tone: 'ok' as const }
      : { text: `Nej — ${beredskap.varsta_blocker || 'underlag saknas'}`, tone: 'warn' as const }

  return (
    <section className="bg-white border border-slate-200 rounded-[14px] px-5 py-5 sm:px-6 mb-5 grid grid-cols-1 lg:grid-cols-[300px_1fr_250px] gap-5 lg:gap-0">
      {/* Zon 1 */}
      <div className="lg:pr-[26px]">
        <Eyebrow>Hur ligger vi till?</Eyebrow>
        <Stepper bucket={stageBucket} />
        <div className="mt-3.5">
          <button type="button" onClick={onShowAllStages} className="text-xs font-semibold text-primary-700 hover:text-primary-800">
            Visa alla 8 steg
          </button>
        </div>
      </div>

      {/* Zon 2 */}
      <div className="lg:border-l lg:border-r lg:border-slate-100 lg:px-[26px] border-t lg:border-t-0 border-slate-100 pt-4 lg:pt-0">
        {canSeeFinancials ? (
          <EconomyZone economics={economics} loading={economicsLoading} bucket={stageBucket} />
        ) : (
          <p className="text-[12.5px] text-slate-400 my-6">Ekonomin visas för ägaren.</p>
        )}
      </div>

      {/* Zon 3 */}
      <div className="lg:pl-[26px] border-t lg:border-t-0 border-slate-100 pt-4 lg:pt-0">
        <Eyebrow>Redo att fakturera</Eyebrow>
        <div
          className={`mt-1.5 font-heading text-[15px] font-bold leading-snug ${
            redo.tone === 'ok' ? 'text-emerald-700' : redo.tone === 'warn' ? 'text-amber-700' : 'text-slate-400'
          }`}
        >
          {redo.text}
        </div>
        {beredskap && (
          <div className="mt-2 flex flex-col gap-1">
            {beredskap.delar.map(del => (
              <div key={del.key} className="flex justify-between gap-2.5 text-xs text-slate-500">
                <span className="min-w-0 truncate">{del.label}</span>
                {delVarde(del, canSeeFinancials ? uninvoicedKr : null)}
              </div>
            ))}
          </div>
        )}
        {canSeeFinancials && economics && <MarginalRow economics={economics} />}
      </div>
    </section>
  )
}

export default ProjectStatusBand
