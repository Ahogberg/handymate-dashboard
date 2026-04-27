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

/**
 * Nästa ärende-nummer (NNNN, utan prefix). Delas mellan deal och project så
 * att en deal #1003 alltid blir P-1003 när den vinner och konverteras.
 *
 * Använder samma räknare som getNextProjectNumber ('project') — bara att
 * dealen tilldelas det rena heltalet (deal_number är INTEGER) medan projektet
 * får prefix 'P-'.
 */
export async function getNextCaseNumber(
  supabase: SupabaseClient,
  businessId: string
): Promise<number> {
  const { data, error } = await supabase.rpc('increment_counter', {
    p_business_id: businessId,
    p_counter_type: 'project',
  })

  if (error) {
    console.error('[numbering] getNextCaseNumber error:', error.message)
    // Fallback: timestamp-baserat 4-siffrigt nummer om RPC saknas
    return parseInt(Date.now().toString().slice(-4), 10) || 1001
  }

  return data
}

/**
 * Säkerställ att räknaren ligger på MINST minValue. Sänker aldrig värdet.
 * Används när ett projekt skapas med ett specifikt nummer från en deal —
 * räknaren synkas så att framtida fristående projekt inte krockar.
 *
 * Kräver bump_counter-RPC (sql/v39_align_case_numbering.sql). Loggar
 * felet men kraschar inte om RPC:n saknas.
 */
export async function bumpCounter(
  supabase: SupabaseClient,
  businessId: string,
  counterType: 'customer' | 'project' | 'lead',
  minValue: number
): Promise<void> {
  const { error } = await supabase.rpc('bump_counter', {
    p_business_id: businessId,
    p_counter_type: counterType,
    p_min_value: minValue,
  })
  if (error) {
    console.warn(`[numbering] bumpCounter ${counterType}=${minValue} failed:`, error.message)
  }
}
