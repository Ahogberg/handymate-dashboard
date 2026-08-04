/**
 * Delade typer för Team-kortgriden (R3, tasks/resurs-masterplan.md).
 * Extraherat ur app/dashboard/team/page.tsx så MemberCard/CertificatesPanel
 * kan importera dem utan en cyklisk import mot sidan själv.
 */

export interface TeamMember {
  id: string
  business_id: string
  user_id: string | null
  role: 'owner' | 'admin' | 'project_manager' | 'kalkylator' | 'employee'
  name: string
  email: string
  phone: string | null
  title: string | null
  hourly_cost: number | null
  hourly_rate: number | null
  color: string
  avatar_url: string | null
  is_active: boolean
  can_see_all_projects: boolean
  can_see_financials: boolean
  can_manage_users: boolean
  can_approve_time: boolean
  can_create_invoices: boolean
  invite_token: string | null
  invite_expires_at: string | null
  invited_at: string | null
  accepted_at: string | null
  last_login_at: string | null
  created_at: string
  specialties?: string[]
  skills?: unknown
}

export interface JobType {
  id: string
  name: string
  slug: string
  color: string
}

/** employee_certificate-raden (sql/v84_certifikat.sql). */
export interface Certificate {
  id: string
  business_id: string
  business_user_id: string
  cert_type: string
  cert_number: string | null
  issued_date: string | null
  valid_until: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** Godkänd, kommande/pågående frånvaro (time_off_request) — bara det som FINNS visas, se R3 punkt 1. */
export interface UpcomingTimeOff {
  id: string
  business_user_id: string
  start_date: string
  end_date: string
  type: 'vacation' | 'sick' | 'parental' | 'other'
}

export const TIME_OFF_LABELS: Record<UpcomingTimeOff['type'], string> = {
  vacation: 'Semester',
  sick: 'Sjukfrånvaro',
  parental: 'Föräldraledighet',
  other: 'Frånvaro',
}

/** Sammanfattning av veckans pass för ett kort — R3 punkt 1 ("antal + timmar räcker"). */
export interface WeekShiftSummary {
  count: number
  hours: number
}
