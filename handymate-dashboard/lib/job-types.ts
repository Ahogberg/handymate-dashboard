/**
 * Jobbtyper — delat helper-lib för routes och komponenter.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface JobType {
  id: string
  business_id: string
  name: string
  slug: string
  color: string
  icon: string | null
  default_hourly_rate: number | null
  sort_order: number
  is_active: boolean
  archived_at: string | null
  created_at: string
}

/**
 * Gör om ett namn till en URL-vänlig slug.
 */
export function slugifyJobType(name: string): string {
  return name
    .toLowerCase()
    .replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

/**
 * Lazy-migration från business_config.services_offered (TEXT[])
 * till job_types-tabellen. Körs första gången användaren öppnar sidan.
 * Skapar inga dubbletter om slug redan finns.
 */
export async function migrateServicesOfferedToJobTypes(
  supabase: SupabaseClient,
  businessId: string
): Promise<number> {
  const { data: biz } = await supabase
    .from('business_config')
    .select('services_offered')
    .eq('business_id', businessId)
    .single()

  const services: string[] = biz?.services_offered || []
  if (services.length === 0) return 0

  const { data: existing } = await supabase
    .from('job_types')
    .select('slug')
    .eq('business_id', businessId)

  const existingSlugs = new Set((existing || []).map((r: any) => r.slug))

  const rowsToInsert = services
    .map((name, idx) => ({
      business_id: businessId,
      name: name.trim(),
      slug: slugifyJobType(name),
      sort_order: idx,
    }))
    .filter(r => r.slug && !existingSlugs.has(r.slug))

  if (rowsToInsert.length === 0) return 0

  const { error } = await supabase.from('job_types').insert(rowsToInsert)
  if (error) return 0
  return rowsToInsert.length
}

/**
 * Färgpalett för jobbtyper — samma som lead-kategorier.
 */
export const JOB_TYPE_COLORS = [
  { name: 'Teal', value: '#0F766E' },
  { name: 'Blå', value: '#2563EB' },
  { name: 'Amber', value: '#D97706' },
  { name: 'Rosa', value: '#DB2777' },
  { name: 'Lila', value: '#7C3AED' },
  { name: 'Grön', value: '#16A34A' },
  { name: 'Orange', value: '#EA580C' },
  { name: 'Grå', value: '#64748B' },
]

/**
 * Hitta teammedlemmar som kan utföra en viss jobbtyp-slug.
 */
export async function findMatchingAssignees(
  supabase: SupabaseClient,
  businessId: string,
  jobTypeSlug: string
) {
  const { data } = await supabase
    .from('business_users')
    .select('id, name, color, avatar_url, specialties')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .contains('specialties', [jobTypeSlug])

  return data || []
}
