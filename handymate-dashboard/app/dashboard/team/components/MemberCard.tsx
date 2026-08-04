'use client'

import { Mail, Phone, Briefcase, Clock, CalendarOff, Award } from 'lucide-react'
import { resolveMemberSkills } from '@/lib/skills'
import { utilizationColorClasses } from '@/lib/schedule/utilization'
import type { PersonWeekUtilization } from '@/lib/schedule/utilization'
import { classifyCertStatus } from '@/lib/certifikat/status'
import type { TeamMember, JobType, Certificate, UpcomingTimeOff, WeekShiftSummary } from './types'
import { getInitials, getStatusInfo, getRoleBadge, timeOffLabel, CERT_STATUS_BADGE } from './helpers'

interface MemberCardProps {
  member: TeamMember
  jobTypes: JobType[]
  utilization?: PersonWeekUtilization
  weekShifts?: WeekShiftSummary
  upcomingTimeOff?: UpcomingTimeOff
  certificates: Certificate[]
  canOpen: boolean
  onOpen: () => void
}

/**
 * Profilkortet på /dashboard/team (R3, tasks/resurs-masterplan.md).
 * Ren visning — all redigering sker i sheeten som öppnas via onOpen (se
 * page.tsx). Operationell kontext (beläggning, veckans pass, frånvaro,
 * certifikat) är medvetet READ-ONLY här, samma "kortfront visar, sheet
 * redigerar"-uppdelning som schema-fliken redan etablerat.
 */
export function MemberCard({ member, jobTypes, utilization, weekShifts, upcomingTimeOff, certificates, canOpen, onOpen }: MemberCardProps) {
  const status = getStatusInfo(member)
  const roleBadge = getRoleBadge(member.role)
  const specialtySlugs = resolveMemberSkills(member)
  const utilPct = utilization ? Math.round(utilization.utilizationPct) : null
  const utilColors = utilPct !== null ? utilizationColorClasses(utilPct) : null

  const visibleCerts = certificates.slice(0, 2)
  const extraCertCount = certificates.length - visibleCerts.length

  return (
    <div
      onClick={() => canOpen && onOpen()}
      className={`bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 transition-colors ${
        canOpen ? 'cursor-pointer hover:border-slate-300 hover:shadow-sm' : ''
      }`}
    >
      {/* Header: avatar + namn/roll/status */}
      <div className="flex items-start gap-3">
        {member.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.avatar_url}
            alt={member.name}
            className="w-12 h-12 rounded-full object-cover shrink-0 border border-slate-200"
          />
        ) : (
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-gray-900 text-sm font-semibold shrink-0"
            style={{ backgroundColor: member.color }}
          >
            {getInitials(member.name)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-900 font-semibold truncate">{member.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${roleBadge.className}`}>{roleBadge.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${status.className}`}>{status.label}</span>
          </div>
          {member.title && <p className="text-gray-400 text-sm mt-0.5 truncate">{member.title}</p>}
        </div>
      </div>

      {/* Kontakt */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
        <a
          href={`mailto:${member.email}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 hover:text-primary-700 transition-colors truncate max-w-[220px]"
        >
          <Mail className="w-3.5 h-3.5 shrink-0" />
          {member.email}
        </a>
        {member.phone && (
          <a
            href={`tel:${member.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 hover:text-primary-700 transition-colors"
          >
            <Phone className="w-3.5 h-3.5 shrink-0" />
            {member.phone}
          </a>
        )}
      </div>

      {/* Specialiteter */}
      {specialtySlugs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {specialtySlugs.map((slug) => {
            const jt = jobTypes.find((j) => j.slug === slug)
            return (
              <span
                key={slug}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border border-transparent text-white"
                style={{ backgroundColor: jt?.color || '#94A3B8' }}
              >
                {jt?.name || slug}
              </span>
            )
          })}
        </div>
      )}

      {/* Beläggning + veckans pass */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Beläggning denna vecka</p>
          {utilPct !== null ? (
            <div className="mt-1.5">
              <div className="flex items-baseline gap-1">
                <span className={`text-lg font-bold ${utilColors!.text}`}>{utilPct}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                <div className={`h-full rounded-full ${utilColors!.bar}`} style={{ width: `${Math.min(100, utilPct)}%` }} />
              </div>
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-gray-400">—</p>
          )}
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Veckans pass</p>
          <div className="mt-1.5 flex items-center gap-1.5 text-gray-900">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-sm font-semibold">
              {weekShifts ? `${weekShifts.count} pass · ${Math.round(weekShifts.hours)}h` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Frånvaro (bara om något faktiskt finns — inget saldosystem, se R3-specen) */}
      {upcomingTimeOff && (
        <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
          <CalendarOff className="w-3.5 h-3.5" />
          {timeOffLabel(upcomingTimeOff)}
        </div>
      )}

      {/* Certifikat-summering */}
      {certificates.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
          <Award className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          {visibleCerts.map((c) => {
            const st = classifyCertStatus(c.valid_until)
            const badge = CERT_STATUS_BADGE[st]
            return (
              <span key={c.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${badge.className}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                {c.cert_type}
              </span>
            )
          })}
          {extraCertCount > 0 && <span className="text-xs text-gray-400">+{extraCertCount} till</span>}
        </div>
      )}

      {specialtySlugs.length === 0 && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
          <Briefcase className="w-3.5 h-3.5" />
          Inga specialiteter satta
        </div>
      )}
    </div>
  )
}
