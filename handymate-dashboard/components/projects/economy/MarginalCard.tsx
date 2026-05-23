'use client'

import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  Check,
  Info,
  Settings,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import {
  COST_COMPLETENESS_THRESHOLD,
  type ProjectEconomics,
} from '@/lib/projects/compute-economics'

/**
 * MarginalCard (Etapp 4b steg 1, 2026-05-23).
 *
 * Bär ärlighets-hierarkin för marginal-presentation. Designprincip från
 * Claude Design + Andreas TD-63 + TD-69:
 *   "Siffran får aldrig se bättre ut än den är."
 *
 * Fem visnings-tillstånd (mappas från ProjectEconomics-helpern):
 *
 *   gate         arbetskostnad_konfigurerad=false
 *                → Amber CTA till /dashboard/settings/internal-costs.
 *                → Aldrig en marginal-siffra.
 *
 *   empty        är_tomt=true (varken budget eller kostnad)
 *                → Neutralt "—", inget värde.
 *
 *   potential    budget>0, completeness=0 (FARLIGAST — ser ut som vinst)
 *                → Slate-grå siffra (INTE grön), stor "Preliminär"-pill,
 *                  completeness-bar 0%.
 *
 *   preliminary  0 < completeness < 30%
 *                → Slate-grå siffra, samma pill, completeness-bar visar
 *                  framsteg mot 30%-tröskel.
 *
 *   confirmed    kostnad_sannolikt_komplett=true (status='completed'
 *                ELLER completeness >= 30%)
 *                → Färgen "förtjänas": grön om positiv marginal,
 *                  röd om negativ.
 *
 * 30%-tröskeln (COST_COMPLETENESS_THRESHOLD) importeras från helpern —
 * en sanning, hårdkoda inte 30 här.
 */

export type MarginalCardSize = 'hero' | 'normal' | 'compact'

export interface MarginalCardProps {
  economics: ProjectEconomics
  size?: MarginalCardSize
}

type DisplayState = 'gate' | 'empty' | 'potential' | 'preliminary' | 'confirmed'

function deriveState(eco: ProjectEconomics): DisplayState {
  if (!eco.marginal.arbetskostnad_konfigurerad) return 'gate'
  if (eco.marginal.är_tomt) return 'empty'
  // confirmed = helpern säger att data är rimligt komplett
  // (status='completed' eller completeness >= 30%)
  if (eco.marginal.kostnad_sannolikt_komplett) return 'confirmed'
  const completeness = eco.marginal.kostnad_completeness_pct ?? 0
  return completeness === 0 ? 'potential' : 'preliminary'
}

function formatKr(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(n)
}

const THRESHOLD_PCT = Math.round(COST_COMPLETENESS_THRESHOLD * 100)

// ─────────────────────────────────────────────────────────────────
// Sub-components (Pill, Eyebrow, CompletenessBar)
// ─────────────────────────────────────────────────────────────────

function Eyebrow({
  children,
  icon,
  colorClass = 'text-slate-500',
}: {
  children: React.ReactNode
  icon?: React.ReactNode
  colorClass?: string
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${colorClass}`}>
      {icon}
      {children}
    </span>
  )
}

function Pill({
  text,
  variant,
  small,
}: {
  text: string
  variant: 'amber' | 'emerald' | 'red'
  small?: boolean
}) {
  const variantClasses = {
    amber: 'bg-amber-50 text-amber-700 border-amber-300',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  }[variant]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-bold uppercase tracking-wider ${variantClasses} ${
        small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-[11px]'
      }`}
    >
      {text}
    </span>
  )
}

function CompletenessBar({
  pct,
  variant,
}: {
  pct: number
  variant: 'amber' | 'emerald' | 'red'
}) {
  const barColor = {
    amber: 'bg-amber-500',
    emerald: 'bg-emerald-500',
    red: 'bg-red-500',
  }[variant]
  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Kostnadsregistrering
        </span>
        <span className="text-[11px] font-bold text-slate-700 tabular-nums">{pct}%</span>
      </div>
      <div className="relative h-1.5 bg-slate-200 rounded-full overflow-visible">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
        {/* Tröskel-tick på 30% */}
        <div
          className="absolute top-[-2px] bottom-[-2px] w-0.5 bg-slate-400 rounded-sm"
          style={{ left: `${THRESHOLD_PCT}%` }}
        />
        <div
          className="absolute top-2 text-[9px] text-slate-400 whitespace-nowrap"
          style={{ left: `${THRESHOLD_PCT}%`, transform: 'translateX(-50%)' }}
        >
          tröskel
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────

export function MarginalCard({ economics, size = 'normal' }: MarginalCardProps) {
  const { isOwnerOrAdmin } = useCurrentUser()
  const state = deriveState(economics)
  const { marginal, intakter, kostnader } = economics

  // ── Gate-tillstånd: arbetskostnad ej konfigurerad ──────────────
  if (state === 'gate') {
    const padding = size === 'compact' ? 'p-3' : 'p-5'
    return (
      <div className={`bg-white border border-slate-200 rounded-2xl ${padding}`}>
        <Eyebrow icon={<TrendingUp className="w-3 h-3" />} colorClass="text-amber-700">
          Marginal
        </Eyebrow>
        <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3.5 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-700">
              Sätt intern timkostnad
            </p>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
              {marginal.timrader_utan_kostnad > 0 ? (
                <>
                  {marginal.timrader_utan_kostnad} timrad
                  {marginal.timrader_utan_kostnad === 1 ? '' : 'er'} saknar kostnadsdata.
                  Vi visar inte marginal förrän intern timkostnad är satt — annars hade
                  siffran blivit missvisande.
                </>
              ) : (
                <>
                  Vi visar inte marginal förrän intern timkostnad (lön + sociala + overhead)
                  är satt — annars hade siffran blivit missvisande.
                </>
              )}
            </p>
            {isOwnerOrAdmin && (
              <Link
                href="/dashboard/settings/internal-costs"
                className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors"
              >
                <Settings className="w-3 h-3" />
                Inställningar
                <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Empty-tillstånd: varken budget eller kostnad ───────────────
  if (state === 'empty') {
    return renderCard({
      size,
      eyebrowColor: 'text-slate-500',
      cardBg: 'bg-slate-50',
      cardBorder: 'border-slate-200',
      numColor: 'text-slate-400',
      pctColor: 'text-slate-400',
      icon: null,
      label: '—',
      pctLabel: null,
      pill: null,
      completeness: 0,
      barVariant: 'amber',
      helper: 'Inget registrerat än',
      helperColor: 'text-slate-500',
      showHelperIcon: false,
      budget: intakter.forvantad_intakt_kr,
      kostnad: kostnader.total_kr,
    })
  }

  // ── Potential/Preliminary/Confirmed: gemensam config ──────────
  const completenessPct = marginal.kostnad_completeness_pct ?? 0
  const isConfirmed = state === 'confirmed'
  const isPositive = (marginal.marginal_kr ?? 0) >= 0

  if (state === 'potential' || state === 'preliminary') {
    return renderCard({
      size,
      eyebrowColor: 'text-slate-500',
      cardBg: 'bg-slate-50',
      cardBorder: 'border-slate-200',
      numColor: 'text-slate-700',
      pctColor: 'text-slate-500',
      icon: null,  // ingen trending-icon förrän confirmed
      label: marginal.marginal_kr,
      pctLabel: marginal.marginal_pct,
      pill: { text: 'Preliminär', variant: 'amber' },
      completeness: completenessPct,
      barVariant: 'amber',
      helper:
        state === 'potential'
          ? 'Inga kostnader registrerade än — siffran är vad du tar in, inte vad du tjänar'
          : `${completenessPct}% av budget registrerad som kostnad — siffran kan ändras`,
      helperColor: 'text-slate-500',
      showHelperIcon: true,
      budget: intakter.forvantad_intakt_kr,
      kostnad: kostnader.total_kr,
    })
  }

  // ── Confirmed: färg förtjänas ──────────────────────────────────
  return renderCard({
    size,
    eyebrowColor: isPositive ? 'text-emerald-700' : 'text-red-700',
    cardBg: isPositive ? 'bg-emerald-50' : 'bg-red-50',
    cardBorder: isPositive ? 'border-emerald-200' : 'border-red-200',
    numColor: isPositive ? 'text-emerald-700' : 'text-red-700',
    pctColor: isPositive ? 'text-emerald-600' : 'text-red-600',
    icon: isPositive ? (
      <TrendingUp className={size === 'hero' ? 'w-5 h-5' : 'w-6 h-6'} />
    ) : (
      <TrendingDown className={size === 'hero' ? 'w-5 h-5' : 'w-6 h-6'} />
    ),
    label: marginal.marginal_kr,
    pctLabel: marginal.marginal_pct,
    pill: {
      text: isPositive ? 'Bekräftad' : 'Underskott',
      variant: isPositive ? 'emerald' : 'red',
    },
    completeness: completenessPct,
    barVariant: isPositive ? 'emerald' : 'red',
    helper: `${completenessPct}% kostnader registrerade · uppdaterad nyss`,
    helperColor: isPositive ? 'text-emerald-700' : 'text-red-700',
    showHelperIcon: true,
    showCheckIcon: true,
    budget: intakter.forvantad_intakt_kr,
    kostnad: kostnader.total_kr,
  })
}

// ─────────────────────────────────────────────────────────────────
// Render-helper
// ─────────────────────────────────────────────────────────────────

interface RenderArgs {
  size: MarginalCardSize
  eyebrowColor: string
  cardBg: string
  cardBorder: string
  numColor: string
  pctColor: string
  icon: React.ReactNode
  label: number | string | null
  pctLabel: number | null
  pill: { text: string; variant: 'amber' | 'emerald' | 'red' } | null
  completeness: number
  barVariant: 'amber' | 'emerald' | 'red'
  helper: string
  helperColor: string
  showHelperIcon?: boolean
  showCheckIcon?: boolean
  budget: number
  kostnad: number | null
}

function renderCard(args: RenderArgs) {
  const isHero = args.size === 'hero'
  const isCompact = args.size === 'compact'

  // Hero: kompaktare, tighter spacing — passar top of Ekonomi-page
  if (isHero) {
    return (
      <div className={`${args.cardBg} border ${args.cardBorder} rounded-2xl p-5 relative overflow-hidden min-w-0`}>
        <div className="flex items-baseline gap-2 mb-2">
          <Eyebrow colorClass={args.eyebrowColor}>Marginal</Eyebrow>
          <span className="ml-auto" />
          {args.pill && <Pill {...args.pill} small />}
        </div>
        <div className="flex items-baseline gap-2.5 mb-1">
          {args.icon && <span className={args.numColor}>{args.icon}</span>}
          <div
            className={`text-3xl font-bold tabular-nums ${args.numColor}`}
            style={{ fontFamily: 'var(--font-display, "Space Grotesk", system-ui)', letterSpacing: '-0.025em' }}
          >
            {renderLabel(args.label)}
          </div>
          {args.pctLabel != null && (
            <div className={`text-base font-semibold ${args.pctColor}`}>
              ({args.pctLabel > 0 ? '+' : ''}{args.pctLabel}%)
            </div>
          )}
        </div>
        <p className="text-[11px] text-slate-500 mb-3">Netto, exkl moms</p>
        <CompletenessBar pct={args.completeness} variant={args.barVariant} />
        <p className={`text-[11px] mt-2 leading-relaxed ${args.helperColor}`}>{args.helper}</p>
      </div>
    )
  }

  // Default / compact: detaljerat kort
  const outerPadding = isCompact ? 'p-3' : 'p-5'
  const innerPadding = isCompact ? 'p-3' : 'p-4'
  const numSize = isCompact ? 'text-2xl' : 'text-4xl'
  const pctSize = isCompact ? 'text-sm' : 'text-base'

  return (
    <div className={`bg-white border border-slate-200 rounded-2xl ${outerPadding}`}>
      <div className="flex items-baseline mb-1.5">
        <Eyebrow icon={<TrendingUp className="w-3 h-3" />} colorClass="text-slate-500">
          Marginal
        </Eyebrow>
        <span className="ml-auto" />
        {args.pill && <Pill {...args.pill} />}
      </div>
      <div className={`rounded-xl border ${args.cardBorder} ${args.cardBg} ${innerPadding}`}>
        <div className="flex items-baseline gap-3 mb-1">
          {args.icon && <span className={args.numColor}>{args.icon}</span>}
          <div
            className={`${numSize} font-bold tabular-nums ${args.numColor}`}
            style={{ fontFamily: 'var(--font-display, "Space Grotesk", system-ui)', letterSpacing: '-0.025em' }}
          >
            {renderLabel(args.label)}
          </div>
          {args.pctLabel != null && (
            <div className={`${pctSize} font-bold tabular-nums ${args.pctColor}`}>
              ({args.pctLabel > 0 ? '+' : ''}{args.pctLabel}%)
            </div>
          )}
        </div>
        <p className="text-xs text-slate-500 mb-3.5">
          Netto, exkl moms · Intäkt {formatKr(args.budget)} − Kostnad {args.kostnad == null ? '—' : formatKr(args.kostnad)}
        </p>
        <CompletenessBar pct={args.completeness} variant={args.barVariant} />
        <div className={`flex items-center gap-1.5 mt-2 text-xs leading-relaxed ${args.helperColor}`}>
          {args.showHelperIcon && !args.showCheckIcon && (
            <Info className="w-3 h-3 text-amber-600 flex-shrink-0" />
          )}
          {args.showCheckIcon && <Check className="w-3 h-3 flex-shrink-0" />}
          <span>{args.helper}</span>
        </div>
      </div>
    </div>
  )
}

function renderLabel(label: number | string | null): string {
  if (label === '—' || label === null) return '—'
  if (typeof label === 'string') return label
  return `${label > 0 ? '+' : ''}${formatKr(label)}`
}
