import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Säkerställ att en Supabase Storage bucket existerar OCH har rätt
 * visibility. Skapar den om den saknas, eller uppdaterar en existerande
 * bucket om dess `public`-flag inte matchar.
 *
 * KRITISKT: får ALDRIG kasta exception. Anropas före upload-flöden och
 * måste låta upload köra även om bucket-konfiguration misslyckas (t.ex.
 * om service-rollen saknar update-rättighet på storage.buckets, eller om
 * Supabase-API:t har övergående fel). Bucket-state är best-effort —
 * uploaden använder service_role som ändå bypassar RLS.
 */
export async function ensureBucket(
  supabase: SupabaseClient,
  bucketName: string,
  options?: { public?: boolean },
): Promise<void> {
  const wantPublic = options?.public ?? false

  try {
    const { data: existing, error } = await supabase.storage.getBucket(bucketName)

    // "not found" → skapa
    if (error && error.message?.toLowerCase().includes('not found')) {
      try {
        const { error: createError } = await supabase.storage.createBucket(bucketName, {
          public: wantPublic,
        })
        if (createError && !createError.message?.toLowerCase().includes('already exists')) {
          console.error(`[storage] createBucket "${bucketName}" misslyckades:`, createError.message)
        }
      } catch (createEx) {
        console.error(`[storage] createBucket "${bucketName}" kastade:`, createEx)
      }
      return
    }

    // Annan typ av error från getBucket — logga men låt upload fortsätta
    if (error) {
      console.error(`[storage] getBucket "${bucketName}" gav error:`, error.message)
      return
    }

    // Bucket finns — synka public-flaggan om den driftat
    if (existing && existing.public !== wantPublic) {
      try {
        const { error: updateError } = await supabase.storage.updateBucket(bucketName, {
          public: wantPublic,
        })
        if (updateError) {
          console.error(`[storage] updateBucket "${bucketName}" misslyckades:`, updateError.message)
        }
      } catch (updateEx) {
        console.error(`[storage] updateBucket "${bucketName}" kastade:`, updateEx)
      }
    }
  } catch (ex) {
    // getBucket kan kasta vid nätverksfel — svälj exception så upload kör vidare
    console.error(`[storage] ensureBucket("${bucketName}") svalde exception:`, ex)
  }
}
