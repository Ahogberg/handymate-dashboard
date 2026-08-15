import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeSwedishPhone } from '@/lib/phone-normalize'

/**
 * Kundmeddelandets avsikt är ett obligatoriskt säkerhetskontrakt, inte något
 * som gissas ur fri text. Bara proaktiva meddelanden omfattas av sjudagars-
 * samordningen; alla kundklasser omfattas av STOPP.
 */
export type SmsPurpose =
  | 'internal'
  | 'transactional'
  | 'conversational'
  | 'proactive'
  | 'consent_confirmation'

export type SmsRecipient = 'customer' | 'internal'

export type SmsGateCode =
  | 'invalid_contract'
  | 'guard_unavailable'
  | 'customer_not_found'
  | 'recipient_mismatch'
  | 'customer_opted_out'
  | 'recent_customer_contact'
  | 'already_sent'

export type SmsGateDecision =
  | { allowed: true; customerId: string | null }
  | {
      allowed: false
      code: SmsGateCode
      error: string
      customerId?: string | null
      previous?: { smsId: string; elksId?: string }
    }

export interface SmsGateInput {
  supabase: SupabaseClient
  businessId: string
  phoneE164: string
  customerId?: string | null
  recipient: SmsRecipient
  purpose: SmsPurpose
  messageType: string
  approvalId?: string | null
  now?: Date
}

export interface ResolvedSmsCustomer {
  customerId: string
  phoneE164: string
  optedOut: boolean
}

export type SmsCustomerResolution =
  | { ok: true; customer: ResolvedSmsCustomer }
  | { ok: false; code: 'guard_unavailable' | 'customer_not_found' | 'recipient_mismatch'; error: string }

/**
 * Strikt tenantbunden kundupplösning. Till skillnad från den äldre
 * fail-soft-resolvern returneras DB-fel som fel — säkerhetsgrinden får aldrig
 * göra "kunde inte kontrollera" likvärdigt med "tillåtet".
 */
export async function resolveSmsCustomer(args: {
  supabase: SupabaseClient
  businessId: string
  phoneE164: string
  customerId?: string | null
}): Promise<SmsCustomerResolution> {
  const { supabase, businessId, customerId } = args
  const targetPhone = normalizeSwedishPhone(args.phoneE164)
  if (!targetPhone) {
    return { ok: false, code: 'recipient_mismatch', error: 'Mottagarens telefonnummer är ogiltigt' }
  }

  if (customerId) {
    const { data, error } = await supabase
      .from('customer')
      .select('customer_id, phone_number, sms_opt_out')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .maybeSingle()

    if (error) {
      return { ok: false, code: 'guard_unavailable', error: `Kundskyddet kunde inte kontrolleras: ${error.message}` }
    }
    if (!data) {
      return { ok: false, code: 'customer_not_found', error: 'Kunden tillhör inte företaget eller finns inte' }
    }
    if (normalizeSwedishPhone(data.phone_number || '') !== targetPhone) {
      return { ok: false, code: 'recipient_mismatch', error: 'Telefonnumret hör inte till den valda kunden' }
    }
    return {
      ok: true,
      customer: {
        customerId: String(data.customer_id),
        phoneE164: targetPhone,
        optedOut: data.sms_opt_out === true,
      },
    }
  }

  const localPhone = targetPhone.startsWith('+46') ? `0${targetPhone.slice(3)}` : targetPhone
  const candidates = Array.from(new Set([targetPhone, localPhone]))
  const { data, error } = await supabase
    .from('customer')
    .select('customer_id, phone_number, sms_opt_out')
    .eq('business_id', businessId)
    .in('phone_number', candidates)
    .limit(2)

  if (error) {
    return { ok: false, code: 'guard_unavailable', error: `Kundskyddet kunde inte kontrolleras: ${error.message}` }
  }
  if (!data || data.length === 0) {
    return { ok: false, code: 'customer_not_found', error: 'Ingen tenantverifierad kund hittades för telefonnumret' }
  }
  if (data.length !== 1) {
    return { ok: false, code: 'recipient_mismatch', error: 'Telefonnumret matchar flera kunder och kan inte användas säkert' }
  }

  return {
    ok: true,
    customer: {
      customerId: String(data[0].customer_id),
      phoneE164: targetPhone,
      optedOut: data[0].sms_opt_out === true,
    },
  }
}

export async function gateCustomerSms(input: SmsGateInput): Promise<SmsGateDecision> {
  const { recipient, purpose } = input
  if ((recipient === 'internal') !== (purpose === 'internal')) {
    return {
      allowed: false,
      code: 'invalid_contract',
      error: 'SMS-kontraktet blandar intern mottagare och kundmeddelande',
    }
  }
  if (recipient === 'internal') return { allowed: true, customerId: null }

  const resolution = await resolveSmsCustomer(input)
  if (!resolution.ok) {
    return { allowed: false, code: resolution.code, error: resolution.error }
  }
  const customer = resolution.customer

  // Ett redan levererat approval-SMS är en lyckad idempotent retry. Vi
  // kontrollerar detta före dagens opt-out-status eftersom inget nytt skickas.
  if (input.approvalId) {
    const { data, error } = await input.supabase
      .from('sms_log')
      .select('sms_id, elks_id')
      .eq('business_id', input.businessId)
      .eq('direction', 'outbound')
      .eq('trigger_type', 'approval')
      .eq('trigger_id', input.approvalId)
      .in('status', ['sent', 'delivered'])
      .limit(1)
      .maybeSingle()
    if (error) {
      return {
        allowed: false,
        code: 'guard_unavailable',
        error: `Dubblettskyddet kunde inte kontrolleras: ${error.message}`,
      }
    }
    if (data) {
      return {
        allowed: false,
        code: 'already_sent',
        error: 'SMS:et är redan skickat',
        customerId: customer.customerId,
        previous: {
          smsId: String(data.sms_id),
          ...(data.elks_id ? { elksId: String(data.elks_id) } : {}),
        },
      }
    }
  }

  const isPersistedStopConfirmation =
    purpose === 'consent_confirmation' && input.messageType === 'opt_out_confirm'
  if (customer.optedOut && !isPersistedStopConfirmation) {
    return {
      allowed: false,
      code: 'customer_opted_out',
      error: 'Kunden har avböjt SMS',
      customerId: customer.customerId,
    }
  }

  if (purpose === 'proactive') {
    const now = input.now ?? new Date()
    const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await input.supabase
      .from('sms_log')
      .select('sms_id')
      .eq('business_id', input.businessId)
      .eq('customer_id', customer.customerId)
      .eq('direction', 'outbound')
      .in('status', ['sent', 'delivered'])
      .gte('sent_at', windowStart)
      .limit(1)
      .maybeSingle()
    if (error) {
      return {
        allowed: false,
        code: 'guard_unavailable',
        error: `Kontaktsamordningen kunde inte kontrolleras: ${error.message}`,
      }
    }
    if (data) {
      return {
        allowed: false,
        code: 'recent_customer_contact',
        error: 'Kunden har redan fått ett SMS de senaste sju dagarna',
        customerId: customer.customerId,
      }
    }
  }

  return { allowed: true, customerId: customer.customerId }
}
