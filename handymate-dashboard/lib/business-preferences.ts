import { getServerSupabase } from '@/lib/supabase'

/**
 * Fetch all business preferences as a key→value map.
 * Returns an empty object if none exist.
 */
export async function getBusinessPreferences(
  businessId: string
): Promise<Record<string, string>> {
  const supabase = getServerSupabase()

  const { data, error } = await supabase
    .from('business_preferences')
    .select('key, value')
    .eq('business_id', businessId)

  if (error || !data) return {}

  return Object.fromEntries(data.map((row: { key: string; value: string }) => [row.key, row.value]))
}

/**
 * Set / upsert a single business preference.
 *
 * Returnerar false vid fel istället för att svälja det — upserten kräver en
 * unik constraint på (business_id, key); saknas den failar ON CONFLICT tyst
 * och flaggor "fastnar" aldrig (rotorsaken till att dag-7-mailet gick om
 * varje dag, 2026-07-31). Anropare som använder flaggan som skydd mot
 * dubbletter MÅSTE kolla returvärdet.
 */
export async function setBusinessPreference(
  businessId: string,
  key: string,
  value: string,
  source: 'agent' | 'user' | 'onboarding' = 'user'
): Promise<boolean> {
  const supabase = getServerSupabase()

  const { error } = await supabase.from('business_preferences').upsert(
    {
      business_id: businessId,
      key,
      value,
      source,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'business_id,key' }
  )
  if (error) {
    console.error('[business-preferences] upsert misslyckades:', businessId, key, error.message)
    return false
  }
  return true
}

/**
 * Delete a business preference.
 */
export async function deleteBusinessPreference(
  businessId: string,
  key: string
): Promise<void> {
  const supabase = getServerSupabase()
  await supabase
    .from('business_preferences')
    .delete()
    .eq('business_id', businessId)
    .eq('key', key)
}
