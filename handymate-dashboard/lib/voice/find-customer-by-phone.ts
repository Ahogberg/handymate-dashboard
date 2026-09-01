import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeSwedishPhone } from '@/lib/phone-normalize'
import { findCustomerDuplicates } from '@/lib/customer-dedupe'

/**
 * Kundmatchning på telefonnummer för samtalsvägen.
 *
 * 46elks levererar E.164 (+46701234567); kunder är ofta sparade som
 * "070-123 45 67". Fram till 2026-09-01 gjorde fyra ställen
 * `.eq('phone_number', from)` på råvärdet → samtalet hamnade på ingen kund,
 * och lead-grinden i pipeline-ai fällde dessutom rått "07…" som ogiltigt.
 *
 * Strategi: först ett billigt `.in()` på [rå, E.164], sedan fallback till
 * findCustomerDuplicates som normaliserar varje sparad rad i JS. Inget
 * DB-index på normaliserat nummer — det hade krävt en SQL-kopia av
 * normaliseringen som kan glida ifrån lib/phone-normalize.
 */

export interface PhoneCustomerMatch {
  customer_id: string
  name: string | null
  phone_number: string | null
}

/** Kandidater att slå upp exakt: råvärdet och E.164-formen (dedupade). Tomt om numret inte är ett nummer. */
export function phoneCandidates(phone: string | null | undefined): string[] {
  const raw = (phone || '').trim()
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 7) return []
  const e164 = normalizeSwedishPhone(raw)
  return Array.from(new Set([raw, e164].filter(Boolean)))
}

export async function findCustomerByPhone(
  supabase: SupabaseClient,
  businessId: string,
  phone: string | null | undefined,
): Promise<PhoneCustomerMatch | null> {
  const candidates = phoneCandidates(phone)
  if (candidates.length === 0) return null
  const raw = candidates[0]

  const { data, error } = await supabase
    .from('customer')
    .select('customer_id, name, phone_number, created_at')
    .eq('business_id', businessId)
    .in('phone_number', candidates)
    .order('created_at', { ascending: true })
  if (error) throw error

  const rows = (data || []) as Array<PhoneCustomerMatch & { created_at: string }>
  if (rows.length > 0) {
    if (rows.length > 1) {
      console.warn(`[find-customer-by-phone] ${rows.length} kunder delar numret i ${businessId} — äldsta/exakt match vinner`)
    }
    const exact = rows.find(r => r.phone_number === raw)
    const pick = exact || rows[0]
    return { customer_id: pick.customer_id, name: pick.name, phone_number: pick.phone_number }
  }

  // Fallback: sparat nummer i annan form ("070 123 45 67", "0046…").
  const dubbletter = await findCustomerDuplicates(supabase, { business_id: businessId, phone: raw })
  const viaPhone = dubbletter
    .filter(d => d.match_type === 'phone')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  if (viaPhone.length === 0) return null
  if (viaPhone.length > 1) {
    console.warn(`[find-customer-by-phone] ${viaPhone.length} normaliserade träffar i ${businessId} — äldsta vinner`)
  }
  return { customer_id: viaPhone[0].customer_id, name: viaPhone[0].name, phone_number: viaPhone[0].phone_number }
}
