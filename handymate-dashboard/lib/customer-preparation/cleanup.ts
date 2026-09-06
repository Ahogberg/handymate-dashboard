import type { SupabaseClient } from '@supabase/supabase-js'
/** Remove private images BEFORE deleting rows. Errors preserve references for retry. */
export async function removePreparationImages(db: SupabaseClient, businessId: string): Promise<void> {
  let offset = 0
  while (true) {
    const { data, error } = await db.from('customer_preparation').select('id,images')
      .eq('business_id', businessId).order('id').range(offset, offset + 99)
    if (error) {
      // Pre-migration accounts have no new table or images.
      if (['42P01', 'PGRST205'].includes(error.code)) return
      throw error
    }
    for (const row of data || []) {
      const images = Array.isArray(row.images) ? row.images : []
      if (images.some((path: unknown) => typeof path !== 'string' || !path.startsWith(`${businessId}/${row.id}/`))) throw new Error('Ogiltig bildreferens i kundunderlag')
      if (images.length) {
        const { error: removeError } = await db.storage.from('customer-preparation').remove(images)
        if (removeError) throw removeError
      }
    }
    if (!data || data.length < 100) return
    offset += 100
  }
}
