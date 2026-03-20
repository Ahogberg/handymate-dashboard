import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Säkerställ att en Supabase Storage bucket existerar.
 * Skapar den automatiskt om den saknas (kräver service role).
 */
export async function ensureBucket(
  supabase: SupabaseClient,
  bucketName: string,
  options?: { public?: boolean }
): Promise<void> {
  const { error } = await supabase.storage.getBucket(bucketName)
  if (error && error.message?.includes('not found')) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: options?.public ?? false,
    })
    if (createError && !createError.message?.includes('already exists')) {
      console.error(`[storage] Kunde inte skapa bucket "${bucketName}":`, createError.message)
    }
  }
}
