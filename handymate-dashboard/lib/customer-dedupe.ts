import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeSwedishPhone } from './phone-normalize'

export interface CustomerDuplicateMatch {
  customer_id: string
  name: string
  phone_number: string | null
  email: string | null
  address_line: string | null
  created_at: string
  /** Vilket fält som triggade matchen — bestämmer hur stark dubbletten är */
  match_type: 'phone' | 'email' | 'name_address'
}

interface FindDuplicatesArgs {
  business_id: string
  phone?: string | null
  email?: string | null
  name?: string | null
  address?: string | null
  /** Customer-id att exkludera (vid update — vi vill inte matcha kunden mot sig själv) */
  exclude_id?: string | null
}

/**
 * Letar potentiella dubbletter i `customer`-tabellen baserat på telefon,
 * e-post och namn+adress. Används vid create/update för att förhindra att
 * samma kund läggs in dubbelt.
 *
 * Match-typer (rangordnade):
 *   1. phone — normaliserat svenskt nummer (E.164)
 *   2. email — case-insensitive, trimmad
 *   3. name_address — namn + adress kombination (case-insensitive)
 *
 * Returnerar dedupade matchningar (samma customer_id rapporteras bara en
 * gång — starkaste match-type vinner).
 */
export async function findCustomerDuplicates(
  supabase: SupabaseClient,
  args: FindDuplicatesArgs,
): Promise<CustomerDuplicateMatch[]> {
  const matchesById = new Map<string, CustomerDuplicateMatch>()

  // 1. Telefon-match (starkaste signal)
  const normalizedPhone = args.phone ? normalizeSwedishPhone(args.phone) : ''
  if (normalizedPhone) {
    let query = supabase
      .from('customer')
      .select('customer_id, name, phone_number, email, address_line, created_at')
      .eq('business_id', args.business_id)
      .not('phone_number', 'is', null)

    if (args.exclude_id) {
      query = query.neq('customer_id', args.exclude_id)
    }

    const { data } = await query
    for (const row of data || []) {
      if (normalizeSwedishPhone(row.phone_number || '') === normalizedPhone) {
        matchesById.set(row.customer_id, { ...row, match_type: 'phone' })
      }
    }
  }

  // 2. E-post-match
  const normalizedEmail = args.email?.toLowerCase().trim()
  if (normalizedEmail) {
    let query = supabase
      .from('customer')
      .select('customer_id, name, phone_number, email, address_line, created_at')
      .eq('business_id', args.business_id)
      .ilike('email', normalizedEmail)

    if (args.exclude_id) {
      query = query.neq('customer_id', args.exclude_id)
    }

    const { data } = await query
    for (const row of data || []) {
      if (!matchesById.has(row.customer_id)) {
        matchesById.set(row.customer_id, { ...row, match_type: 'email' })
      }
    }
  }

  // 3. Namn + adress (svagare — ofta legitima fall som BRF + företag på
  // samma adress). Bara om båda är satta.
  const trimmedName = args.name?.trim()
  const trimmedAddress = args.address?.trim()
  if (trimmedName && trimmedAddress) {
    let query = supabase
      .from('customer')
      .select('customer_id, name, phone_number, email, address_line, created_at')
      .eq('business_id', args.business_id)
      .ilike('name', trimmedName)
      .ilike('address_line', trimmedAddress)

    if (args.exclude_id) {
      query = query.neq('customer_id', args.exclude_id)
    }

    const { data } = await query
    for (const row of data || []) {
      if (!matchesById.has(row.customer_id)) {
        matchesById.set(row.customer_id, { ...row, match_type: 'name_address' })
      }
    }
  }

  return Array.from(matchesById.values())
}
