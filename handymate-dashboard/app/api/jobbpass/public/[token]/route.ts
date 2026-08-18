import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { signStorageUrl } from '@/lib/storage-signing'
import {
  getPublishedJobbpassByToken,
  loadJobbpassSourceData,
  loadSelectedJobbpassPhotos,
  deriveJobbpassView,
} from '@/lib/jobbpass/jobbpass'

export const dynamic = 'force-dynamic'

const PROJECT_FILES_BUCKET = 'project-files'

/**
 * GET /api/jobbpass/public/[token] — Etapp Ä (Jobbpass V1). Ingen auth,
 * samma publika-länk-mönster som app/api/quotes/public/[token].
 *
 * Svarar BARA för ett jobbpass med status 'published' —
 * getPublishedJobbpassByToken filtrerar bort draft-rader även om en token
 * mot förmodan skulle finnas på en (den kan inte, se v154:s CHECK-
 * constraint, men rutten litar aldrig på det ensamt). Allt annat är 404,
 * aldrig ett läckt "hittades inte men här är strukturen ändå".
 */
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const token = params.token
    if (!token) return NextResponse.json({ error: 'Token saknas' }, { status: 400 })

    const supabase = getServerSupabase()
    const jobbpass = await getPublishedJobbpassByToken(supabase, token)
    if (!jobbpass) {
      return NextResponse.json({ error: 'Jobbpasset hittades inte eller är inte publicerat' }, { status: 404 })
    }

    const sourceData = await loadJobbpassSourceData(supabase, jobbpass.business_id, jobbpass.project_id)
    if (!sourceData) {
      return NextResponse.json({ error: 'Jobbpasset hittades inte' }, { status: 404 })
    }

    const selectedRows = await loadSelectedJobbpassPhotos(
      supabase, jobbpass.business_id, jobbpass.project_id, jobbpass.selected_photo_ids,
    )
    const signedPhotos = (
      await Promise.all(
        selectedRows.map(async r => ({
          id: r.id,
          url: await signStorageUrl(supabase, PROJECT_FILES_BUCKET, r.file_path, 3600),
          caption: null as string | null,
        })),
      )
    ).filter((p): p is { id: string; url: string; caption: null } => !!p.url)

    const view = deriveJobbpassView({
      ...sourceData,
      photos: signedPhotos,
      serviceConsent: jobbpass.service_consent,
    })

    return NextResponse.json({ jobbpass: view })
  } catch (error) {
    console.error('[jobbpass/public] oväntat fel:', error)
    return NextResponse.json({ error: 'Jobbpasset kunde inte visas' }, { status: 500 })
  }
}
