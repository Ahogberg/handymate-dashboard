export const GTM_LEGAL_FORMS = [
  'limited_company',
  'sole_trader',
  'trading_partnership',
  'association',
  'other',
  'unknown',
] as const

export type GtmLegalForm = typeof GTM_LEGAL_FORMS[number]

export const GTM_CONTACT_BASES = [
  'warm_intro',
  'inbound',
  'customer_referral',
  'public_business_contact',
  'public_professional_role',
  'unknown',
] as const

export type GtmContactBasis = typeof GTM_CONTACT_BASES[number]

export const GTM_CHANNELS = [
  'warm_intro',
  'phone',
  'linkedin',
  'email',
  'letter',
  'video',
  'none',
] as const

export type GtmChannel = typeof GTM_CHANNELS[number]

export const GTM_ACTIVITY_CHANNELS = [
  'warm_intro',
  'phone',
  'linkedin',
  'email',
  'letter',
  'video',
  'meeting',
  'demo',
  'other',
] as const

export type GtmActivityChannel = typeof GTM_ACTIVITY_CHANNELS[number]

export const GTM_OUTCOMES = [
  'attempted',
  'no_answer',
  'spoke',
  'replied',
  'meeting_booked',
  'demo_booked',
  'offer_sent',
  'won',
  'lost',
  'note',
] as const

export type GtmOutcome = typeof GTM_OUTCOMES[number]

export const GTM_STATUSES = [
  'imported',
  'qualified',
  'ready',
  'contacted',
  'replied',
  'meeting_booked',
  'demo_booked',
  'offer_sent',
  'won',
  'lost',
  'suppressed',
] as const

export type GtmStatus = typeof GTM_STATUSES[number]

export const GTM_SUPPRESSION_REASONS = [
  'opt_out',
  'wrong_person',
  'legal_unclear',
  'duplicate',
  'do_not_contact',
  'other',
] as const

export type GtmSuppressionReason = typeof GTM_SUPPRESSION_REASONS[number]

export interface GtmSourceFact {
  label: string
  value: string
  source_url?: string | null
}

export interface GtmAccount {
  id: string
  org_number: string | null
  company_name: string
  legal_form: GtmLegalForm
  website: string | null
  company_phone: string | null
  company_email: string | null
  municipality: string | null
  county: string | null
  sni_code: string | null
  industry: string | null
  employee_band: string | null
  turnover_band: string | null
  source_name: string
  source_url: string | null
  source_checked_at: string
  source_facts: GtmSourceFact[]
  factual_notes: string | null
  processing_purpose: 'handymate_b2b_launch'
  lawful_basis: 'legitimate_interest' | 'warm_relationship' | 'inbound_request'
  retention_review_at: string
  primary_contact_name: string | null
  primary_contact_role: string | null
  primary_contact_email: string | null
  primary_contact_phone: string | null
  primary_contact_linkedin: string | null
  contact_basis: GtmContactBasis
  fit_score: number
  fit_reasons: string[]
  status: GtmStatus
  suggested_channel: GtmChannel
  owner_user_id: string | null
  next_action_at: string | null
  last_contact_at: string | null
  contact_count: number
  research_summary: string | null
  relevance_hypothesis: string | null
  opening_angle: string | null
  call_opener: string | null
  email_draft: string | null
  linkedin_draft: string | null
  video_script: string | null
  brief_generated_at: string | null
  brief_generated_by: 'ai' | 'template' | null
  // Pass 1b (tasks/plan-launch-desk-signaler.md): innehåller bl.a.
  // signals — antingen den fulla GtmSignalSnapshot (skriven av
  // signaler-rutten) eller en förenklad label+evidence-lista (skriven när
  // ett brief regenereras, se lib/launch-desk/brief.ts). Ostrukturerad med
  // avsikt — ingen ny kolumn, ingen migration.
  brief_source_snapshot?: Record<string, unknown>

  created_at: string
  updated_at: string
}

export interface GtmActivity {
  id: string
  account_id: string
  admin_user_id: string
  channel: GtmActivityChannel | 'other'
  outcome: GtmOutcome | 'opt_out'
  notes: string | null
  happened_at: string
  next_action_at: string | null
  created_at: string
}

export interface GtmAccountInput {
  org_number?: string | null
  company_name: string
  legal_form?: GtmLegalForm
  website?: string | null
  company_phone?: string | null
  company_email?: string | null
  municipality?: string | null
  county?: string | null
  sni_code?: string | null
  industry?: string | null
  employee_band?: string | null
  turnover_band?: string | null
  source_name: string
  source_url?: string | null
  source_checked_at: string
  source_facts?: GtmSourceFact[]
  factual_notes?: string | null
  primary_contact_name?: string | null
  primary_contact_role?: string | null
  primary_contact_email?: string | null
  primary_contact_phone?: string | null
  primary_contact_linkedin?: string | null
  contact_basis?: GtmContactBasis
  suggested_channel?: GtmChannel
  owner_user_id?: string | null
  next_action_at?: string | null
}

export interface GtmFunnel {
  total: number
  ready: number
  due: number
  contacted: number
  replied: number
  meetings: number
  demos: number
  offers: number
  won: number
  suppressed: number
}
