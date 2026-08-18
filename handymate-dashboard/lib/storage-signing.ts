import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Etapp Z (v151_private_buckets.sql): customer-documents och project-files
 * är privata — ingen anon/authenticated-policy finns kvar på storage.objects
 * för dem. Signerade URL:er lagras ALDRIG i databasen (de blir ogiltiga och
 * är dessutom en läcka så länge de lever) — vi lagrar storage-PATH och
 * signerar vid LÄSNING, med kort TTL (default 1h).
 *
 * Den här filen är medvetet fri från 'server-only' — extractStoragePath är
 * en ren strängfunktion som klientkomponenter (quotes/new, quotes/edit)
 * också behöver, för att mappa en visnings-URL tillbaka till den path som
 * faktiskt ska sparas.
 */

/**
 * Extraherar en storage-path ur:
 *  - en publik Supabase-URL (.../storage/v1/object/public/<bucket>/<path>)
 *  - en signerad/authenticated-URL (.../object/sign|authenticated/<bucket>/<path>...)
 *    — stödjs bara som läkning av legacy-data; nya skrivningar ska ALDRIG
 *    producera såna.
 *  - en redan lagrad path (inget protokoll) → returneras oförändrad.
 *
 * Returnerar null om strängen är tom, eller om den är en URL för FEL bucket
 * (skydd mot att av misstag signera/peka mot en annan buckets objekt).
 */
export function extractStoragePath(
  urlOrPath: string | null | undefined,
  bucket: string,
): string | null {
  if (!urlOrPath) return null
  const trimmed = urlOrPath.trim()
  if (!trimmed) return null

  // Ingen protokolldel → redan en path. Oförändrad.
  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  const match = trimmed.match(
    /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?]+)/,
  )
  if (!match) return null

  const [, matchedBucket, rawPath] = match
  if (matchedBucket !== bucket) return null

  try {
    return decodeURIComponent(rawPath)
  } catch {
    return rawPath
  }
}

/**
 * Signerar en lagrad path (eller legacy publik URL) till en kortlivad,
 * hämtningsbar URL. Kräver en service-role-klient för de privata buckets
 * (customer-documents/project-files saknar läspolicy sedan v151) — en
 * anon/authenticated-klient får PGRST/403 från createSignedUrl.
 *
 * Returnerar null (aldrig kastar) om path saknas eller signeringen
 * misslyckas — anropande route bestämmer själv fallback-beteendet.
 */
export async function signStorageUrl(
  supabase: SupabaseClient,
  bucket: string,
  urlOrPath: string | null | undefined,
  ttlSeconds = 3600,
): Promise<string | null> {
  const path = extractStoragePath(urlOrPath, bucket)
  if (!path) return null

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttlSeconds)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

/**
 * Signerar en lista bilagor på formen {name, url, size} — url-fältet bär en
 * lagrad path (eller legacy publik URL). Returnerar en NY lista där `url`
 * är utbytt mot en signerad, visningsbar URL och `path` är den underliggande
 * lagrade pathen — så anropande kod kan spara `path` tillbaka utan att av
 * misstag persistera den signerade länken.
 *
 * Poster som inte går att signera (path saknas/fel bucket) behåller sin
 * ursprungliga `url` oförändrad — hellre en möjligen död legacy-länk än en
 * tyst borttagen bilaga.
 */
export async function signAttachmentList<T extends { url: string }>(
  supabase: SupabaseClient,
  bucket: string,
  attachments: T[] | null | undefined,
  ttlSeconds = 3600,
): Promise<Array<T & { path: string | null }>> {
  if (!Array.isArray(attachments) || attachments.length === 0) return []

  return Promise.all(
    attachments.map(async (att) => {
      const path = extractStoragePath(att.url, bucket)
      const signed = path ? await signStorageUrl(supabase, bucket, path, ttlSeconds) : null
      return { ...att, path, url: signed || att.url }
    }),
  )
}
