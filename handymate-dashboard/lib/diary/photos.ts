import type { SupabaseClient } from '@supabase/supabase-js'
import { signStorageUrl } from '../storage-signing'

/**
 * Dagboksfoton (Etapp D3, 2026-09-02).
 *
 * Samma privata bucket som projektdokument och ÄTA-bilagor (v151:
 * project-files saknar läspolicy) — path lagras, signeras vid läsning
 * (lib/storage-signing.ts), aldrig en signerad URL i databasen.
 *
 * Sökvägen skiljer sig medvetet från documents-routens
 * `${business}/${project}/${ts}_${name}`: dagboken har EN mapp per
 * loggrad (`.../diary/<project>/<logId>/...`) så alla foton för en och
 * samma dagboksrad hör ihop i storage-trädet, inte bara i databasen.
 */

export const DIARY_BUCKET = 'project-files'

export const DIARY_PHOTO_MAX_BYTES = 10 * 1024 * 1024

/** Kapar filnamnet till säkra tecken och en rimlig längd — samma idé som
 * documents-routens `safeName`, men med en explicit maxlängd så ett väldigt
 * långt telefonkamera-filnamn inte producerar en orimlig storage-path. */
function safeFileName(fileName: string): string {
  const cleaned = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  return cleaned.slice(-80) || 'foto'
}

export function diaryPhotoPath(
  businessId: string,
  projectId: string,
  logId: string,
  fileName: string,
): string {
  return `${businessId}/diary/${projectId}/${logId}/${Date.now()}_${safeFileName(fileName)}`
}

/** Skydd mot att av misstag signera/radera en path som inte tillhör det
 * inloggade företagets dagboksmapp. */
export function isDiaryPhotoPath(path: string, businessId: string): boolean {
  return path.startsWith(`${businessId}/diary/`)
}

export interface SignedDiaryPhoto {
  path: string
  url: string | null
}

/** Signerar en lista lagrade paths till kortlivade, hämtningsbara URL:er.
 * En path som inte går att signera får `url: null` — anropande kod
 * bestämmer själv om den ska visas som trasig eller döljas. */
export async function signDiaryPhotos(
  supabase: SupabaseClient,
  paths: string[],
): Promise<SignedDiaryPhoto[]> {
  return Promise.all(
    paths.map(async (path) => ({
      path,
      url: await signStorageUrl(supabase, DIARY_BUCKET, path, 3600),
    })),
  )
}
