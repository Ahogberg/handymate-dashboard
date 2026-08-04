/**
 * Delade UI-hjälpare för Team-fliken (R3, tasks/resurs-masterplan.md).
 * Ren presentationslogik, ingen affärslogik — certstatus-KLASSNINGEN
 * (giltigt/går-ut/utgånget) bor i lib/certifikat/status.ts och facit-testas
 * där; det som ligger här är bara hur den statusen färgläggs/textas.
 */
import type { TeamMember, UpcomingTimeOff } from './types'
import { TIME_OFF_LABELS } from './types'
import type { CertStatus } from '@/lib/certifikat/status'

export function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()
}

export function getStatusInfo(member: TeamMember): { label: string; className: string } {
  if (!member.is_active) return { label: 'Inaktiv', className: 'bg-red-100 text-red-600 border-red-200' }
  if (member.invite_token && !member.accepted_at) return { label: 'Inbjuden', className: 'bg-amber-100 text-amber-600 border-amber-200' }
  return { label: 'Aktiv', className: 'bg-emerald-100 text-emerald-600 border-emerald-200' }
}

export function getRoleBadge(role: string): { label: string; className: string } {
  if (role === 'owner') return { label: 'Ägare', className: 'bg-[#F0FDFA] text-primary-700 border-primary-300' }
  if (role === 'admin') return { label: 'Admin', className: 'bg-primary-100 text-primary-600 border-primary-600/30' }
  if (role === 'project_manager') return { label: 'Projektledare', className: 'bg-blue-100 text-blue-600 border-blue-300' }
  if (role === 'kalkylator') return { label: 'Kalkylator', className: 'bg-amber-100 text-amber-600 border-amber-300' }
  return { label: 'Anställd', className: 'bg-gray-100 text-gray-500 border-gray-300' }
}

export function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just nu'
  if (diffMins < 60) return `${diffMins} min sedan`
  if (diffHours < 24) return `${diffHours} tim sedan`
  if (diffDays < 7) return `${diffDays} dagar sedan`
  return date.toLocaleDateString('sv-SE')
}

/** "3–7 aug" eller "5 aug" om start=slut. Datumen är YYYY-MM-DD (DATE-kolumner). */
export function formatDateRangeSv(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T12:00:00Z`)
  const end = new Date(`${endDate}T12:00:00Z`)
  const startDay = start.getUTCDate()
  const endLabel = end.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  if (startDate === endDate) return endLabel
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear()
  return sameMonth ? `${startDay}–${endLabel}` : `${start.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', timeZone: 'UTC' })}–${endLabel}`
}

export function timeOffLabel(t: UpcomingTimeOff): string {
  return `${TIME_OFF_LABELS[t.type]} ${formatDateRangeSv(t.start_date, t.end_date)}`
}

export const CERT_STATUS_BADGE: Record<CertStatus, { label: string; className: string; dot: string }> = {
  valid: { label: 'Giltigt', className: 'bg-emerald-100 text-emerald-600 border-emerald-200', dot: 'bg-emerald-500' },
  no_expiry: { label: 'Giltigt', className: 'bg-emerald-100 text-emerald-600 border-emerald-200', dot: 'bg-emerald-500' },
  expiring_soon: { label: 'Går ut snart', className: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  expired: { label: 'Utgånget', className: 'bg-red-100 text-red-600 border-red-200', dot: 'bg-red-500' },
}

export function formatCertDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
