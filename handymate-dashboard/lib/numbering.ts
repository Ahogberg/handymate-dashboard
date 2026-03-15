import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Atomisk räknare för kundnummer och projektnummer.
 * Använder en SQL-funktion (increment_counter) som gör
 * INSERT ... ON CONFLICT DO UPDATE SET last_value = last_value + 1 RETURNING last_value
 * för att garantera unika, sekventiella nummer utan race conditions.
 */

async function getNextNumber(
  supabase: SupabaseClient,
  businessId: string,
  counterType: 'customer' | 'project' | 'lead',
  prefix: string
): Promise<string> {
  const { data, error } = await supabase.rpc('increment_counter', {
    p_business_id: businessId,
    p_counter_type: counterType,
  })

  if (error) {
    console.error(`[numbering] increment_counter error for ${counterType}:`, error.message)
    // Fallback: generera ett tidsstämplat nummer om RPC saknas
    const fallback = Date.now().toString().slice(-4)
    return `${prefix}-${fallback}`
  }

  return `${prefix}-${data}`
}

/**
 * Nästa kundnummer: K-1001, K-1002, ...
 */
export async function getNextCustomerNumber(
  supabase: SupabaseClient,
  businessId: string
): Promise<string> {
  return getNextNumber(supabase, businessId, 'customer', 'K')
}

/**
 * Nästa projektnummer: P-1001, P-1002, ...
 */
export async function getNextProjectNumber(
  supabase: SupabaseClient,
  businessId: string
): Promise<string> {
  return getNextNumber(supabase, businessId, 'project', 'P')
}

/**
 * Nästa leadnummer: L-1001, L-1002, ...
 */
export async function getNextLeadNumber(
  supabase: SupabaseClient,
  businessId: string
): Promise<string> {
  return getNextNumber(supabase, businessId, 'lead', 'L')
}
