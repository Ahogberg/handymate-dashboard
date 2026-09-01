// Delade typer för partnerportalen (partnerprogram v2, 2026-08-11).
// Speglar payloaden från GET /api/partners/dashboard.

export interface TierStep {
  min: number
  rate: number
}

export interface PartnerData {
  id: string
  name: string
  company: string | null
  email: string
  referral_code: string
  referral_url: string | null
  commission_tiers: TierStep[] | null
  base_rate_after: number
  tier_mode: 'book' | 'marginal'
  ladder_months: number
  legacy_commission_rate: number
  total_earned_sek: number
  total_pending_sek: number
  api_key_masked: string | null
  has_webhook_secret: boolean
  webhook_url: string | null
  webhook_events: string[]
}

export interface Stats {
  total_referred: number
  active_customers: number
  total_converted: number
  pending_commission_sek: number
  total_earned_sek: number
  current_tier_rate: number | null
}

export interface Followup {
  nr: 1 | 2 | 3
  done_at: string
  note: string | null
}

export interface Referral {
  id: string
  business_id: string
  email: string | null
  business_name: string | null
  status: string
  created_at: string
  converted_at: string | null
  referred_by: string | null
  activity_level: 'onboardar' | 'aktiv' | 'inaktiv' | 'churnad'
  activity_label: string
  customer_month: number
  ladder_months: number
  current_rate: number | null
  on_base_rate: boolean
  earned_total_sek: number
  followups: Followup[]
}

export interface StatementRow {
  kund: string
  manad: number
  sats: number
  belopp_sek: number
  status: 'accrued' | 'paid'
}

export interface Statement {
  period: string
  rows: StatementRow[]
  total_sek: number
  all_paid: boolean
}

export interface PartnerEvent {
  id: string
  business_id: string | null
  event_type: string
  created_at: string
  meta: Record<string, unknown> | null
}

export function formatSek(amount: number): string {
  return amount.toLocaleString('sv-SE') + ' kr'
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('sv-SE')
}

export function formatProcent(rate: number): string {
  return `${Math.round(rate * 1000) / 10} %`
}
