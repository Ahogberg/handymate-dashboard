import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeSwedishPhone } from '@/lib/phone-normalize'

/**
 * Delad logik för "Ring via Handymate" (utgående inspelat samtal).
 *
 * Hantverkarens nummer löses ALLTID server-side och ALDRIG ur en URL:
 * 46elks-webhookarna bär bara recording_id, och connect-steget slår upp
 * numret på nytt härifrån. Prioritet: den som tryckte på knappen
 * (business_users.phone) → business_config.personal_phone →
 * forward_phone_number — samma fallbackkedja som consent-routen använder
 * för inkommande samtal, plus personen först.
 */

export const OUTBOUND_RECORDING_PREFIX = 'rec_out_'

export interface OutboundBusinessConfig {
  business_id: string
  business_name: string | null
  assigned_phone_number: string | null
  personal_phone: string | null
  forward_phone_number: string | null
  call_recording_enabled: boolean | null
}

export async function loadOutboundBusinessConfig(
  supabase: SupabaseClient,
  businessId: string,
): Promise<OutboundBusinessConfig | null> {
  const { data, error } = await supabase
    .from('business_config')
    .select('business_id, business_name, assigned_phone_number, personal_phone, forward_phone_number, call_recording_enabled')
    .eq('business_id', businessId)
    .maybeSingle()
  if (error || !data) return null
  return data as OutboundBusinessConfig
}

/** E.164 eller null — ett nummer som inte går att normalisera får inte ringas. */
export function toE164OrNull(raw: string | null | undefined): string | null {
  if (!raw) return null
  const n = normalizeSwedishPhone(String(raw))
  return /^\+\d{8,15}$/.test(n) ? n : null
}

export async function resolveCraftsmanPhone(
  supabase: SupabaseClient,
  config: OutboundBusinessConfig,
  businessUserId: string | null,
): Promise<string | null> {
  if (businessUserId) {
    const { data: user } = await supabase
      .from('business_users')
      .select('id, phone')
      .eq('business_id', config.business_id)
      .eq('id', businessUserId)
      .maybeSingle()
    const own = toE164OrNull(user?.phone)
    if (own) return own
  }
  return toE164OrNull(config.personal_phone) || toE164OrNull(config.forward_phone_number)
}

/** +46701234567 → +46 70 ••• •• 67 — nog för att känna igen sin egen mobil. */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '')
  if (digits.length < 6) return '•••'
  return `${e164.slice(0, 3)} ${e164.slice(3, 5)} ••• •• ${e164.slice(-2)}`
}

export function elksCredentials(): { user: string; password: string } | null {
  const user = process.env.ELKS_API_USER
  const password = process.env.ELKS_API_PASSWORD
  if (!user || !password) return null
  return { user, password }
}
