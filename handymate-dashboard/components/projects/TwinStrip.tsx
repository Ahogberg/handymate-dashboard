'use client'

import { formatSEK } from '@/lib/format-price'
import { weekChip, type StageBucket } from '@/components/projects/ProjectStatusCard'
import { TODO_PRIMARY_LABEL, type TodoMode } from '@/components/projects/ProjectTodoBlock'
import { deriveMarginalState } from '@/components/projects/economy/MarginalCard'
import type { ProjectEconomics } from '@/lib/projects/compute-economics'
import type { Fakturaberedskap } from '@/lib/projects/fakturaberedskap'

/**
 * Twin-strip (Etapp D1, design-integrationsplanen 2026-08-17) — mockupens
 * fem svarskort under projekttiteln, i den ÄRLIGA versionen (skärlistan i
 * planen): inget löftesdatum, ingen prognos, ingen marginaltrend.
 *
 *   Planerat klart   projektets slutdatum + "Vecka X av Y" (samma weekChip
 *                    som statuskortets chip — en beräkning, två ytor)
 *   Läge             stageBucket-etikett (samma vokabulär som titelchipen)
 *                    + över-offererat-flaggan (amber-ram)
 *   Marginal         deriveMarginalState — färg FÖRST vid confirmed
 *                    (5-statskontraktet); döljs helt utan see_financials
 *   Fakturaberedskap beraknaFakturaberedskap-aggregatet (delat med
 *                    "Redo att fakturera?"-panelen — EN beräkning per render)
 *   Nästa steg       exakt samma primäråtgärd som "Att göra"-blocket
 *                    (TODO_PRIMARY_LABEL[todoMode] — samma mode-värde sidan
 *                    redan räknat fram en gång, aldrig en andra härledning)
 *
 * Allt är props ur data sidan redan har — noll nya API-anrop.
 */

interface TwinStripProps {
  startDate: string | null
  endDate: string | null
  stageBucket: StageBucket
  isOverBudget: boolean
  canSeeFinancials: boolean
  economics: ProjectEconomics | null
  economicsLoading: boolean
  beredskap: Fakturaberedskap | null
  todoMode: TodoMode
  /** Antal väntande godkännandekort för projektet (från ProjectApprovalsBlock). */
  approvalsCount: number
}

const BUCKET_LABEL: Record<StageBucket, string> = {
  planering: 'Planering',
  pagaende: 'Pågående',
  klart: 'Klart',
}

function datumSv(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })
}

function Kort({
  eyebrow,
  eyebrowClass,
  border,
  bg,
  children,
  sub,
  subClass,
  outerClass,
}: {
  eyebrow: string
  eyebrowClass?: string
  border?: string
  bg?: string
  children: React.ReactNode
  sub?: string | null
  subClass?: string
  outerClass?: string
}) {
  return (
    <div className={`${bg || 'bg-white'} border ${border || 'border-slate-200'} rounded-card px-4 py-3.5 min-w-0 ${outerClass || ''}`}>
      <div className={`text-[11px] tracking-[0.14em] uppercase font-semibold mb-1.5 ${eyebrowClass || 'text-slate-400'}`}>
        {eyebrow}
      </div>
      {children}
      {sub && <div className={`text-xs mt-1 truncate ${subClass || 'text-slate-500'}`}>{sub}</div>}
    </div>
  )
}

function Varde({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`font-heading text-[15px] sm:text-base font-semibold truncate ${className || 'text-slate-900'}`}>
      {children}
    </div>
  )
}

export function TwinStrip({
  startDate,
  endDate,
  stageBucket,
  isOverBudget,
  canSeeFinancials,
  economics,
  economicsLoading,
  beredskap,
  todoMode,
  approvalsCount,
}: TwinStripProps) {
  const vecka = weekChip(startDate, endDate)
  const marginalState = economics ? deriveMarginalState(economics) : null

  // Marginalkortet döljs HELT utan behörighet — samma canSeeFinancials-grind
  // som sidans övriga ekonomiblock. Griden krymper då till fyra kolumner.
  const visaMarginal = canSeeFinancials

  return (
    <div className={`grid grid-cols-2 ${visaMarginal ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-2.5 sm:gap-3 mb-5`}>
      {/* 1. Planerat klart — projektets slutdatum, ingen prognos (skärlistan). */}
      <Kort eyebrow="Planerat klart" sub={endDate ? vecka : null}>
        {endDate ? (
          <Varde>Klart {datumSv(endDate)}</Varde>
        ) : (
          <Varde className="text-slate-400">Inget slutdatum satt</Varde>
        )}
      </Kort>

      {/* 2. Läge — samma stageBucket-vokabulär som titelchipen. */}
      <Kort
        eyebrow="Läge"
        border={isOverBudget ? 'border-amber-300' : undefined}
        sub={isOverBudget ? 'Över offererat' : null}
        subClass="text-amber-700 font-medium"
      >
        <Varde className={stageBucket === 'klart' ? 'text-emerald-700' : stageBucket === 'pagaende' ? 'text-primary-700' : 'text-slate-500'}>
          {BUCKET_LABEL[stageBucket]}
        </Varde>
      </Kort>

      {/* 3. Marginal — 5-statskontraktet: färg förtjänas först vid confirmed. */}
      {visaMarginal && (
        <Kort
          eyebrow="Marginal"
          sub={
            marginalState === 'confirmed'
              ? (economics!.marginal.marginal_kr ?? 0) >= 0 ? 'Bekräftad' : 'Underskott'
              : marginalState === 'potential' || marginalState === 'preliminary'
                ? 'Preliminär'
                : marginalState === 'gate'
                  ? 'Kräver intern timkostnad'
                  : marginalState === 'empty'
                    ? 'Inget registrerat än'
                    : economicsLoading
                      ? 'Hämtar…'
                      : 'Kunde inte hämtas'
          }
        >
          {marginalState === 'confirmed' ? (
            <Varde
              className={`tabular-nums ${(economics!.marginal.marginal_kr ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}
            >
              {(economics!.marginal.marginal_kr ?? 0) > 0 ? '+' : ''}
              {formatSEK(economics!.marginal.marginal_kr ?? 0)}
              {economics!.marginal.marginal_pct != null ? ` (${economics!.marginal.marginal_pct}%)` : ''}
            </Varde>
          ) : marginalState === 'potential' || marginalState === 'preliminary' ? (
            <Varde className="tabular-nums text-slate-700">
              {economics!.marginal.marginal_kr != null ? formatSEK(economics!.marginal.marginal_kr) : '—'}
            </Varde>
          ) : (
            <Varde className="text-slate-400">—</Varde>
          )}
        </Kort>
      )}

      {/* 4. Fakturaberedskap — delat aggregat; null → ärligt "Underlag saknas". */}
      <Kort eyebrow="Fakturaberedskap" sub={beredskap ? beredskap.varsta_blocker ?? 'Underlag komplett' : null}>
        {beredskap ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-heading text-[15px] sm:text-base font-semibold tabular-nums text-slate-900 shrink-0">
              {beredskap.pct}%
            </span>
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[24px]">
              <div
                className="h-full rounded-full bg-primary-500"
                style={{ width: `${Math.min(100, Math.max(0, beredskap.pct))}%` }}
              />
            </div>
          </div>
        ) : (
          <Varde className="text-slate-400">Underlag saknas</Varde>
        )}
      </Kort>

      {/* 5. Nästa steg — Att göra-blockets primäråtgärd, aldrig en egen.
          Vid udda kortantal (marginal synlig) spänner det över mobilens
          båda kolumner så griden aldrig lämnar ett hål. */}
      <Kort
        eyebrow="Nästa steg"
        eyebrowClass="text-primary-700"
        bg="bg-grad-tint"
        border="border-primary-600/30"
        outerClass={visaMarginal ? 'col-span-2 lg:col-span-1' : ''}
        sub={approvalsCount > 0 ? `Ägare: du · ${approvalsCount} förslag väntar` : null}
        subClass="text-primary-700"
      >
        <Varde className="text-primary-800">{TODO_PRIMARY_LABEL[todoMode]}</Varde>
      </Kort>
    </div>
  )
}
