import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Streamar en fil från Supabase Storage direkt till browsern med
 * `Content-Disposition: inline` så browsern visar PDF/bilder/etc.
 * istället för att tvinga nedladdning.
 *
 * Default-beteendet via signedUrl är `attachment` (Supabase sätter
 * Content-Disposition i sin signed-URL-svar). Vi kringgår det genom
 * att hämta bytes via service-role-klienten och streama tillbaka
 * med våra egna headers.
 *
 * 10 MB-limit på upload (se /api/customers/[id]/documents/upload)
 * gör buffer-load säkert — vi behöver inte ReadableStream-komplexitet.
 *
 * Inline-renderar i moderna browsers:
 *   PDF (application/pdf), bilder (image/*), video, audio, text/plain.
 * Word/Excel: browser respekterar Content-Type men kan inte rendera
 *   native — defaults till "öppna med extern app" eller download.
 *   Det är samma upplevelse som idag, ingen försämring.
 *
 * Cache-Control: private + 5 min så browser kan re-rendera vid back-
 * navigation utan ny round-trip, men URL ej delbar (auth krävs ändå
 * eftersom proxy-routen kollar business-ownership).
 */
export async function streamInline(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  fileName: string,
  fileType: string | null,
): Promise<NextResponse> {
  const { data, error } = await supabase.storage.from(bucket).download(path)

  if (error || !data) {
    console.error('[streamInline] download failed:', { bucket, path, error })
    return NextResponse.json({ error: 'Filen kunde inte hämtas' }, { status: 404 })
  }

  const buffer = await data.arrayBuffer()

  // Encode filename för Content-Disposition. RFC 5987 stödjer UTF-8 via
  // filename*= så svenska tecken (å, ä, ö) i filnamn renderas korrekt
  // i browserns tab-titel.
  const safeName = encodeURIComponent(fileName)

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': fileType || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${safeName}`,
      'Content-Length': String(buffer.byteLength),
      'Cache-Control': 'private, max-age=300',
    },
  })
}
