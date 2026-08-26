'use client'

import { Check } from 'lucide-react'
import { formatSEK } from '@/lib/format-price'
import { FLOW_SYSTEM_STAGES } from '@/components/pipeline/unified/flow-constants'
import { deriveMarginalState } from '@/components/projects/economy/MarginalCard'
import type { ProjectEconomics } from '@/lib/projects/compute-economics'

/**
 * ProjectStatusCard — "Hur ligger vi till?" (Projektvy Fas 1, 2026-07-31).
 *
 * Ersätter den gamla vertikala/horisontella 8-fas-stripen som toppelement
 * med canvasens statuskort: 3-stegs fas-stepper (Planering/Pågående/Klart,
 * härledd från projektets faktiska 8-stegs workflow_stage-modell) +
 * ekonomistaplar (Offererat/Nedlagt/Fakturerat) + prognosrad.
 *
 * Ägar-gating (HANDOFF.md): rubrik + stepper visas för alla roller.
 * Ekonomistaplar + prognosrad (`canSeeFinancials=true` + `economics`
 * laddad) visas ENDAST för ägaren — layouten fungerar utan dem.
 *
 * ROT-fotrad (Projektvy Fas 2, 2026-07-31): /api/projects/[id]/
 * profitability exponerar nu `quote_rot_rut` — lagrade ROT/RUT-fält
 * från projektets kopplade offert (se getQuoteRotRut i profitability/
 * route.ts + ProjectEconomics.quote_rot_rut i compute-economics.ts).
 * Raden renderas ENDAST när arbetskostnad, avdrag OCH kunden-betalar
 * samtliga finns — annars utelämnas den helt (ingen gissad matte,
 * lib/rot-rut.ts äger fortfarande själva beräkningen).
 *
 * Fas-stepper-mappning (tolkning, ej explicit i HANDOFF — dokumenterad i
 * rapporten): position 1–2 (Kontrakt signerat, Startmöte bokat) =
 * Planering; 3–4 (Jobb påbörjat, Delmål uppnått) = Pågående; 5–8
 * (Slutbesiktning → Recension mottagen) = Klart. Slutbesiktning räknas
 * som "Klart" eftersom det är den punkt där arbetet är fysiskt utfört
 * och det som återstår är fakturering/betalning — vilket är precis det
 * "Klart + ofakturerat"-läget i Att göra-blocket beskriver.
 */

export type StageBucket = 'planering' | 'pagaende' | 'klart'

export function getStageBucket(stageId: string | null | undefined): StageBucket {
  const pos = FLOW_SYSTEM_STAGES.find(s => s.id === stageId)?.position ?? 1
  if (pos <= 2) return 'planering'
  if (pos <= 4) return 'pagaende'
  return 'klart'
}

const FASER: { key: StageBucket; label: string }[] = [
  { key: 'planering', label: 'Planering' },
  { key: 'pagaende', label: 'Pågående' },
  { key: 'klart', label: 'Klart' },
]
const FAS_ORDER: Record<StageBucket, number> = { planering: 0, pagaende: 1, klart: 2 }

interface ProjectStatusCardProps {
  currentStageId: string | null | undefined
  quoteTitle?: string | null
  startDate?: string | null
  endDate?: string | null
  canSeeFinancials: boolean
  economics: ProjectEconomics | null
  economicsLoading: boolean
  onStageClick?: () => void
  /** Projektsidan visar nu den fulla 8-stegsstripen i sidhuvudet. */
  showStageStepper?: boolean
}

/** "Vecka X av Y" ur projektets start/slutdatum. Exporterad (Etapp D1) så
    TwinStrips "Planerat klart"-kort visar exakt samma text som chipen här —
    en beräkning, två ytor. */
import { weekChip } from '@/lib/projects/derive-dates'
export { weekChip }

export function ProjectStatusCard({
  currentStageId,
  quoteTitle,
  startDate,
  endDate,
  canSeeFinancials,
  economics,
  economicsLoading,
  onStageClick,
  showStageStepper = true,
}: ProjectStatusCardProps) {
  const bucket = getStageBucket(currentStageId)
  const bucketPos = FAS_ORDER[bucket]

  const state = economics ? deriveMarginalState(economics) : null
  const overBudget =
    canSeeFinancials && state === 'confirmed' && (economics?.marginal.marginal_kr ?? 0) < 0
  const chip = weekChip(startDate, endDate) || (quoteTitle ? 'Skapad från offert' : null)

  // När den fulla fasöversikten ägs av sidhuvudet skulle ett tomt statuskort
  // sakna funktion för roller utan ekonomibehörighet.
  if (!showStageStepper && !canSeeFinancials) return null

  return (
    <div className={`bg-white border rounded-card p-4 sm:p-5 ${overBudget ? 'border-red-200' : 'border-[#E2E8F0]'}`}>
      {/* Rubrikrad */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-[15px] font-semibold text-slate-900">Hur ligger vi till?</h2>
        {chip && (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 whitespace-nowrap">
            {chip}
          </span>
        )}
      </div>

      {/* Fas-stepper — valfri när projektsidans header visar alla åtta steg. */}
      {showStageStepper && (
      <div className="flex items-center mb-1">
        {FASER.map((f, i) => {
          const status: 'done' | 'current' | 'upcoming' =
            FAS_ORDER[f.key] < bucketPos ? 'done' : FAS_ORDER[f.key] === bucketPos ? 'current' : 'upcoming'
          const isGreenActive = status === 'current' && f.key === 'klart'
          return (
            <div key={f.key} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                onClick={onStageClick}
                className="flex flex-col items-center gap-1.5 flex-shrink-0"
                title={`${f.label} (klicka för detaljer)`}
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                    status === 'done'
                      ? 'bg-primary-700 text-white'
                      : status === 'current'
                        ? isGreenActive
                          ? 'bg-white ring-2 ring-emerald-500'
                          : 'bg-white ring-2 ring-primary-600'
                        : 'bg-slate-100'
                  }`}
                >
                  {status === 'done' ? (
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  ) : status === 'current' ? (
                    <span className={`w-2 h-2 rounded-full ${isGreenActive ? 'bg-emerald-500' : 'bg-primary-600'}`} />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-slate-300" />
                  )}
                </span>
                <span
                  className={`text-[11px] font-medium whitespace-nowrap ${
                    status === 'done'
                      ? 'text-primary-700'
                      : status === 'current'
                        ? isGreenActive ? 'text-emerald-600' : 'text-primary-700'
                        : 'text-slate-400'
                  }`}
                >
                  {f.label}
                </span>
              </button>
              {i < FASER.length - 1 && (
                <span
                  className={`h-0.5 flex-1 mx-1.5 -mt-4 rounded ${
                    FAS_ORDER[f.key] < bucketPos ? 'bg-primary-700' : 'bg-slate-200'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>
      )}

      {/* Ekonomistaplar + prognosrad — ägar-gating */}
      {canSeeFinancials && (
        <div className="mt-5 pt-4 border-t border-slate-100">
          {economicsLoading && !economics ? (
            <div className="h-16 flex items-center justify-center">
              <span className="text-xs text-slate-400">Laddar ekonomi…</span>
            </div>
          ) : economics ? (
            <EkonomiStaplar economics={economics} state={state!} />
          ) : (
            <p className="text-xs text-slate-400">Kunde inte hämta ekonomi</p>
          )}
        </div>
      )}
    </div>
  )
}

function EkonomiStaplar({ economics, state }: { economics: ProjectEconomics; state: NonNullable<ReturnType<typeof deriveMarginalState>> }) {
  const { intakter, kostnader, meta } = economics
  const offererat = intakter.forvantad_intakt_kr
  const nedlagt = kostnader.total_kr
  const fakturerat = intakter.fakturerat_kr

  const nedlagtPct = offererat > 0 && nedlagt != null ? (nedlagt / offererat) * 100 : 0
  const nedlagtOver = nedlagtPct > 100
  const fakturaPct = offererat > 0 ? Math.min((fakturerat / offererat) * 100, 100) : 0

  const nedlagtSub =
    nedlagt != null && (kostnader.arbete_timmar > 0 || kostnader.material_inkop_kr > 0)
      ? [
          kostnader.arbete_timmar > 0
            ? `${kostnader.arbete_timmar.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} tim${
                kostnader.arbete_kr != null && kostnader.arbete_timmar > 0
                  ? ` à ${Math.round(kostnader.arbete_kr / kostnader.arbete_timmar).toLocaleString('sv-SE')} kr`
                  : ''
              }`
            : null,
          kostnader.material_inkop_kr > 0 ? `material ${formatSEK(kostnader.material_inkop_kr)}` : null,
        ]
          .filter(Boolean)
          .join(' + ')
      : null

  const fakturaSub =
    fakturerat > 0
      ? intakter.betalt_kr >= fakturerat
        ? `${meta.invoice_count} faktura${meta.invoice_count === 1 ? '' : 'or'} · betald${meta.invoice_count === 1 ? '' : 'a'}`
        : `${meta.invoice_count} faktura${meta.invoice_count === 1 ? '' : 'or'} skickad${meta.invoice_count === 1 ? '' : 'e'}`
      : null

  // Prognosrad — deriverad från samma deriveMarginalState som Ekonomi-fliken
  // (en sanning, två presentationer). Icke-bekräftade tillstånd (gate/empty/
  // potential/preliminary) får den neutrala amber-varianten — att påstå
  // "Inom budget" eller "över offererat" innan kostnaden är rimligt
  // komplett hade varit att låtsas veta mer än vi gör.
  const kvarAttFakturera = Math.max(0, offererat - fakturerat)
  const isConfirmed = state === 'confirmed'
  const isPositive = isConfirmed && (economics.marginal.marginal_kr ?? 0) >= 0
  const isNegative = isConfirmed && (economics.marginal.marginal_kr ?? 0) < 0

  // ROT-fotrad (statuskort.rot_rad) — lagrade värden från kopplad offert,
  // aldrig omräknade här. Visas bara när arbetsbas, avdrag OCH
  // kunden-betalar samtliga finns för den aktiva typen (rot|rut).
  const qrr = economics.quote_rot_rut
  const rotIsRot = qrr?.rot_rut_type === 'rot'
  const rotIsRut = qrr?.rot_rut_type === 'rut'
  const rotWork = rotIsRot ? qrr!.rot_work_cost : rotIsRut ? qrr!.rut_work_cost : undefined
  const rotDeduction = rotIsRot ? qrr!.rot_deduction : rotIsRut ? qrr!.rut_deduction : undefined
  const rotCustomerPays = qrr?.customer_pays
  const rotLabel = rotIsRot ? 'ROT' : rotIsRut ? 'RUT' : null
  const showRotRow =
    rotLabel != null && rotWork != null && rotDeduction != null && rotCustomerPays != null

  let dotClass = 'bg-amber-500'
  // copy.projektvy.sv.json prognos_kvar = "kvar att fakturera {belopp}" (belopp
  // sist) — DESIGN-NOTES.md-exemplet visar motsatt ordning, men JSON:en är
  // uttryckligen "exakt copy"-källan, se HANDOFF.md.
  let prognosText = `kvar att fakturera ${formatSEK(kvarAttFakturera)}`
  if (isPositive) {
    dotClass = 'bg-emerald-500'
    prognosText = kvarAttFakturera > 0 ? `Inom budget · kvar att fakturera ${formatSEK(kvarAttFakturera)}` : 'Inom budget'
  } else if (isNegative) {
    dotClass = 'bg-red-500'
    const over = nedlagt != null ? Math.max(0, nedlagt - offererat) : 0
    prognosText = `${formatSEK(over)} över offererat`
  }

  return (
    <div className="space-y-3.5">
      <Ebar label="Offererat" value={offererat} pct={100} barClass="bg-primary-700" />
      <Ebar
        label="Nedlagt"
        value={nedlagt}
        pct={Math.min(nedlagtPct, 100)}
        barClass={nedlagtOver ? 'bg-red-500' : 'bg-amber-500'}
        valueClass={nedlagtOver ? 'text-red-600' : undefined}
        sub={nedlagtSub}
      />
      <Ebar label="Fakturerat" value={fakturerat} pct={fakturaPct} barClass="bg-emerald-500" sub={fakturaSub} />

      <div className="flex items-center gap-2 pt-1">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
        <span className="text-xs font-medium text-slate-700">{prognosText}</span>
      </div>

      {showRotRow && (
        <p className="text-xs text-slate-500 pt-3 mt-1 border-t border-slate-100">
          Varav arbete <span className="font-semibold text-slate-700">{formatSEK(rotWork!)}</span>{' '}
          → {rotLabel}-avdrag <span className="font-semibold text-slate-700">{formatSEK(rotDeduction!)}</span>{' '}
          · kunden betalar <span className="font-semibold text-slate-700">{formatSEK(rotCustomerPays!)}</span>
        </p>
      )}
    </div>
  )
}

function Ebar({
  label,
  value,
  pct,
  barClass,
  valueClass,
  sub,
}: {
  label: string
  value: number | null
  pct: number
  barClass: string
  valueClass?: string
  sub?: string | null
}) {
  return (
    <div>
      {/* Etapp D3 (reskin): mockupens formspråk — font-heading + tabular-nums
          på beloppet, helt rundade staplar. Samma data, samma procentmatte. */}
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <span className={`font-heading text-sm font-bold tabular-nums text-right ${valueClass || 'text-slate-900'}`}>
          {value == null ? '—' : formatSEK(value)}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${Math.max(0, Math.min(pct, 100))}%` }} />
      </div>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}
