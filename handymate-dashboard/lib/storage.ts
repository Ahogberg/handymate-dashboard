import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Säkerställ att en Supabase Storage bucket existerar OCH har rätt
 * visibility. Skapar den automatiskt om den saknas, eller uppdaterar
 * en existerande bucket om dess `public`-flag inte matchar önskad
 * konfiguration.
 *
 * Tidigare buggade detta: om bucketen redan fanns men var skapad som
 * privat (t.ex. via Supabase Dashboard) så ändrades den aldrig till
 * publik trots att API-koden bad om `public: true`. Resultatet: filer
 * laddades upp men direkta URL:er 403:ade.
 */
export async function ensureBucket(
  supabase: SupabaseClient,
  bucketName: string,
  options?: { public?: boolean }
): Promise<void> {
  const wantPublic = options?.public ?? false
  const { data: existing, error } = await supabase.storage.getBucket(bucketName)

  if (error && error.message?.includes('not found')) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: wantPublic,
    })
    if (createError && !createError.message?.includes('already exists')) {
      console.error(`[storage] Kunde inte skapa bucket "${bucketName}":`, createError.message)
    }
    return
  }

  // Bucket finns — synka public-flaggan om den driftat
  if (existing && existing.public !== wantPublic) {
    const { error: updateError } = await supabase.storage.updateBucket(bucketName, {
      public: wantPublic,
    })
    if (updateError) {
      console.error(`[storage] Kunde inte uppdatera bucket "${bucketName}":`, updateError.message)
    }
  }
}
