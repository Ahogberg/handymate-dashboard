import type { SupabaseClient } from '@supabase/supabase-js'
import { AGREEMENT_VERSION } from '@/lib/partners/agreement'

export const PARTNER_REFERRAL_PREFIX = 'P-'

export type PartnerAttributionReason =
  | 'accepted'
  | 'invalid_partner_code'
  | 'agreement_not_current'
  | 'self_referral'
  | 'existing_handymate_account'
  | 'existing_sales_relationship'
  | 'already_attributed'
  | 'business_not_found'
  | 'technical_error'

export interface PartnerAttributionResult {
  accepted: boolean
  reason: PartnerAttributionReason
  partnerId: string | null
  referralId: string | null
  idempotent: boolean
}

export function isPartnerReferralCode(value: unknown): value is string {
  return typeof value === 'string' && value.trim().toUpperCase().startsWith(PARTNER_REFERRAL_PREFIX)
}

function technicalFailure(): PartnerAttributionResult {
  return {
    accepted: false,
    reason: 'technical_error',
    partnerId: null,
    referralId: null,
    idempotent: false,
  }
}

/**
 * Den enda skrivvägen för partnerattribution.
 *
 * RPC:n låser företagsraden och beslutar atomiskt om attributionen får
 * skapas. Saknas migrationen faller vi ALDRIG tillbaka på en oskyddad
 * insert: kontot får fortsätta utan partnerattribution och felet loggas.
 */
export async function claimPartnerAttribution(
  supabase: SupabaseClient,
  input: { businessId: string; referralCode: string },
): Promise<PartnerAttributionResult> {
  const referralCode = input.referralCode.trim().toUpperCase()
  if (!isPartnerReferralCode(referralCode)) {
    return { ...technicalFailure(), reason: 'invalid_partner_code' }
  }

  const { data, error } = await supabase.rpc('claim_partner_attribution', {
    p_business_id: input.businessId,
    p_referral_code: referralCode,
    p_required_agreement_version: AGREEMENT_VERSION,
  })

  if (error || !data || typeof data !== 'object') {
    console.error('[partner-attribution] Atomisk attribution misslyckades', {
      businessId: input.businessId,
      code: error?.code,
      message: error?.message,
    })
    return technicalFailure()
  }

  const row = data as Record<string, unknown>
  const reason = typeof row.reason === 'string' ? row.reason : 'technical_error'
  const allowedReasons: PartnerAttributionReason[] = [
    'accepted',
    'invalid_partner_code',
    'agreement_not_current',
    'self_referral',
    'existing_handymate_account',
    'existing_sales_relationship',
    'already_attributed',
    'business_not_found',
    'technical_error',
  ]

  return {
    accepted: row.accepted === true,
    reason: allowedReasons.includes(reason as PartnerAttributionReason)
      ? reason as PartnerAttributionReason
      : 'technical_error',
    partnerId: typeof row.partner_id === 'string' ? row.partner_id : null,
    referralId: typeof row.referral_id === 'string' ? row.referral_id : null,
    idempotent: row.idempotent === true,
  }
}
