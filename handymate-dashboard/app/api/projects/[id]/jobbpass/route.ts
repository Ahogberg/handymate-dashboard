import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { signStorageUrl } from '@/lib/storage-signing'
import {
  getOrCreateDraftJobbpass,
  setJobbpassSelection,
  loadJobbpassSourceData,
  loadSelectedJobbpassPhotos,
  deriveJobbpassView,
} from '@/lib/jobbpass/jobbpass'

export const dynamic = 'force-dynamic'

const PROJECT_FILES_BUCKET = 'project-files'

/**
 * GET/PATCH /api/projects/[id]/jobbpass — Etapp Ä (Jobbpass V1).
 *
 * Ägarens egen yta: väljer vilka projektfoton som får följa med, bockar
 * i/ur samtycke till framtida servicepåminnelse, ser exakt den vy kunden
 * kommer se innan publicering. Owner-admin, precis som app/api/absence
 * (registrerad i tests/permission-contract.spec.ts).
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const projectId = params.id

    const draft = await getOrCreateDraftJobbpass(supabase, business.business_id, projectId)
    if (!draft.ok) return NextResponse.json({ error: draft.error }, { status: 500 })

    const sourceData = await loadJobbpassSourceData(supabase, business.business_id, projectId)
    if (!sourceData) return NextResponse.json({ error: 'Projektet hittades inte' }, { status: 404 })

    // Kandidatpoolen: ALLA projektets bilder, för att ägaren ska kunna
    // välja UR den. Skiljer sig medvetet från loadSelectedJobbpassPhotos
    // (som bara läser det som redan är valt) — den här rutten är den enda
    // som får se hela poolen, eftersom den bara nås av ägare/admin.
    const { data: allDocs } = await supabase
      .from('project_document')
      .select('id, file_path, mime_type, name')
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })
    const imageDocs = ((allDocs || []) as Array<{ id: string; file_path: string; mime_type: string | null; name: string | null }>)
      .filter(d => (d.mime_type || '').startsWith('image/'))

    const candidatePhotos = (
      await Promise.all(
        imageDocs.map(async d => ({
          id: d.id,
          name: d.name,
          url: await signStorageUrl(supabase, PROJECT_FILES_BUCKET, d.file_path, 3600),
        })),
      )
    ).filter((p): p is { id: string; name: string | null; url: string } => !!p.url)

    const selectedRows = await loadSelectedJobbpassPhotos(
      supabase, business.business_id, projectId, draft.row.selected_photo_ids,
    )
    const selectedPhotos = (
      await Promise.all(
        selectedRows.map(async r => ({
          id: r.id,
          url: await signStorageUrl(supabase, PROJECT_FILES_BUCKET, r.file_path, 3600),
          caption: null as string | null,
        })),
      )
    ).filter((p): p is { id: string; url: string; caption: null } => !!p.url)

    const preview = deriveJobbpassView({
      ...sourceData,
      photos: selectedPhotos,
      serviceConsent: draft.row.service_consent,
    })

    return NextResponse.json({
      jobbpass: {
        id: draft.row.id,
        status: draft.row.status,
        token: draft.row.token,
        published_at: draft.row.published_at,
        selected_photo_ids: draft.row.selected_photo_ids,
        service_consent: draft.row.service_consent,
      },
      candidate_photos: candidatePhotos,
      preview,
    })
  } catch (error: any) {
    console.error('[projects/jobbpass] GET oväntat fel:', error)
    return NextResponse.json({ error: 'Jobbpasset kunde inte läsas' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const projectId = params.id
    const body = await request.json().catch(() => ({}))

    const patch: { selectedPhotoIds?: string[]; serviceConsent?: boolean } = {}
    if (Array.isArray(body.selected_photo_ids)) {
      patch.selectedPhotoIds = body.selected_photo_ids.filter((v: unknown): v is string => typeof v === 'string')
    }
    if (typeof body.service_consent === 'boolean') {
      patch.serviceConsent = body.service_consent
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Inget att spara' }, { status: 400 })
    }

    // Säkerställ att raden finns (t.ex. om ägaren länkas hit direkt utan att
    // GET hunnit skapa draften) innan vi försöker uppdatera den.
    const ensured = await getOrCreateDraftJobbpass(supabase, business.business_id, projectId)
    if (!ensured.ok) return NextResponse.json({ error: ensured.error }, { status: 500 })

    const result = await setJobbpassSelection(supabase, business.business_id, projectId, patch)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })

    return NextResponse.json({
      jobbpass: {
        id: result.row.id,
        status: result.row.status,
        token: result.row.token,
        published_at: result.row.published_at,
        selected_photo_ids: result.row.selected_photo_ids,
        service_consent: result.row.service_consent,
      },
    })
  } catch (error: any) {
    console.error('[projects/jobbpass] PATCH oväntat fel:', error)
    return NextResponse.json({ error: 'Jobbpasset kunde inte sparas' }, { status: 500 })
  }
}
