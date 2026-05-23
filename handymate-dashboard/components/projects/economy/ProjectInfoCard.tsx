'use client'

import Link from 'next/link'
import { Briefcase, Calendar, ExternalLink, User } from 'lucide-react'

/**
 * ProjectInfoCard (Etapp 4b steg 3, 2026-05-23).
 *
 * Städad projektinfo för Översikt-tabben. Ersätter den platta
 * grid-baserade Projektinfo-card:en som låg inline i page.tsx.
 *
 * Designprincip (matchar Design:s OversiktDesktop): meta-rad med ikon +
 * label överst, värde under. Kund och kopplad offert renderas som
 * länkar med ExternalLink-glyph. Beskrivning som separat block om
 * den finns.
 */

interface ProjectInfoCardProps {
  projectType: string | null | undefined
  /** Display-label (slå upp i PROJECT_TYPE_LABELS före du skickar in). */
  projectTypeLabel: string
  startDate: string | null | undefined
  endDate: string | null | undefined
  customer: { customer_id: string; name: string } | null | undefined
  quote: { quote_id: string; title: string | null } | null | undefined
  description: string | null | undefined
  /** Sv-format SE-datum, t.ex. 2026-05-23 → 23 maj 2026. */
  formatDate: (iso: string) => string
}

function Eyebrow({
  children,
  icon,
}: {
  children: React.ReactNode
  icon: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
      {icon}
      {children}
    </span>
  )
}

export function ProjectInfoCard({
  projectTypeLabel,
  startDate,
  endDate,
  customer,
  quote,
  description,
  formatDate,
}: ProjectInfoCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Briefcase className="w-4 h-4 text-primary-700" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-primary-700">
          Projektinfo
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div>
          <Eyebrow icon={<Briefcase className="w-3 h-3" />}>Typ</Eyebrow>
          <p className="mt-1.5 text-sm text-slate-900">{projectTypeLabel || '—'}</p>
        </div>

        <div>
          <Eyebrow icon={<Calendar className="w-3 h-3" />}>Startdatum</Eyebrow>
          <p className="mt-1.5 text-sm text-slate-900 tabular-nums">
            {startDate ? formatDate(startDate) : '—'}
          </p>
        </div>

        <div>
          <Eyebrow icon={<Calendar className="w-3 h-3" />}>Slutdatum</Eyebrow>
          <p className="mt-1.5 text-sm text-slate-900 tabular-nums">
            {endDate ? formatDate(endDate) : '—'}
          </p>
        </div>

        <div>
          <Eyebrow icon={<User className="w-3 h-3" />}>Kund</Eyebrow>
          {customer ? (
            <Link
              href={`/dashboard/customers/${customer.customer_id}`}
              className="mt-1.5 inline-flex items-center gap-1 text-sm text-primary-700 hover:text-primary-800 hover:underline"
            >
              {customer.name}
              <ExternalLink className="w-3 h-3" />
            </Link>
          ) : (
            <p className="mt-1.5 text-sm text-slate-400">—</p>
          )}
        </div>

        {quote && (
          <div className="sm:col-span-2">
            <Eyebrow icon={<ExternalLink className="w-3 h-3" />}>Kopplad offert</Eyebrow>
            <Link
              href={`/dashboard/quotes/${quote.quote_id}`}
              className="mt-1.5 inline-flex items-center gap-1 text-sm text-primary-700 hover:text-primary-800 hover:underline"
            >
              {quote.title || 'Offert'}
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        )}
      </div>

      {description && (
        <div className="mt-5 pt-5 border-t border-slate-100">
          <Eyebrow icon={null}>Beskrivning</Eyebrow>
          <p className="mt-1.5 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
            {description}
          </p>
        </div>
      )}
    </div>
  )
}
