import { NextRequest, NextResponse } from 'next/server'
import { loadDiaryContext } from '@/lib/diary/route-context'
import { canEditDiaryRow } from '@/lib/diary/permissions'
import { isDiaryRowLocked } from '@/lib/diary/locking'
import { updateDiaryEntry } from '@/lib/diary/write'
import {
  DIARY_BUCKET,
  DIARY_PHOTO_MAX_BYTES,
  diaryPhotoPath,
  isDiaryPhotoPath,
} from '@/lib/diary/photos'
import { ensureBucket } from '@/lib/storage'
import { signStorageUrl } from '@/lib/storage-signing'
// Auth via request.headers i importerad helper — utan force-dynamic kan
// rutten frysas i Full Route Cache (2026-08-22-klassen, se CLAUDE.md).
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Ctx = Extract<Awaited<ReturnType<typeof loadDiaryContext>>, { ok: true }>

/**
 * Laddar raden, kontrollerar redigeringsrätt och låsning. Foton får bara
 * läggas till/tas bort på olåsta rader — en attesterad dagboksrad ska inte
 * kunna få sin bildbevisning ändrad i efterhand.
 */
async function laddaRedigerbarRad(ctx: Ctx, logId: string): Promise<
  { ok: true; photos: string[] } | { ok: false; response: NextResponse }
> {
  const { data: row, error } = await ctx.supabase
    .from('project_log')
    .select('id, business_user_id, date, photos, locked_at, attested_at')
    .eq('id', logId)
    .eq('order_id', ctx.projectId)
    .eq('business_id', ctx.businessId)
    .maybeSingle()
  if (error) {
    return { ok: false, response: NextResponse.json({ error: `Dagboksraden kunde inte läsas: ${error.message}` }, { status: 500 }) }
  }
  if (!row) {
    return { ok: false, response: NextResponse.json({ error: 'Dagboksraden finns inte' }, { status: 404 }) }
  }
  if (!canEditDiaryRow(ctx.user, { business_user_id: row.business_user_id ?? null }, ctx.assignment)) {
    return { ok: false, response: NextResponse.json({ error: 'Du får inte ändra den här dagboksraden' }, { status: 403 }) }
  }
  if (isDiaryRowLocked({ date: String(row.date ?? ''), locked_at: row.locked_at ?? null, attested_at: row.attested_at ?? null })) {
    return { ok: false, response: NextResponse.json({ error: 'Raden är låst. Lägg till en tilläggsanteckning i stället.', locked: true }, { status: 409 }) }
  }
  const photos = Array.isArray(row.photos) ? (row.photos as unknown[]).filter((p): p is string => typeof p === 'string') : []
  return { ok: true, photos }
}

/**
 * POST /api/projects/[id]/logs/[logId]/photos — Etapp D4 (2026-09-02)
 *
 * multipart/form-data med fältet `file` (≤ 10 MB, bild). Laddar upp till
 * den privata bucketen, lägger sökvägen sist i radens `photos` och svarar
 * `{ path, url }` där url är signerad i en timme. Mobilens B1-kontrakt.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; logId: string } }
) {
  const ctx = await loadDiaryContext(request, params.id)
  if (!ctx.ok) return ctx.response

  const rad = await laddaRedigerbarRad(ctx, params.logId)
  if (!rad.ok) return rad.response

  try {
    const formData = await request.formData().catch(() => null)
    const file = formData?.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Ingen fil skickades' }, { status: 400 })
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'Filen är tom' }, { status: 400 })
    }
    if (file.size > DIARY_PHOTO_MAX_BYTES) {
      return NextResponse.json({ error: 'Fotot är för stort (max 10 MB)' }, { status: 413 })
    }
    if (file.type && !file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Bara bilder kan läggas i dagboken' }, { status: 415 })
    }

    await ensureBucket(ctx.supabase, DIARY_BUCKET, { public: false })

    const path = diaryPhotoPath(ctx.businessId, ctx.projectId, params.logId, file.name || 'foto.jpg')
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await ctx.supabase.storage
      .from(DIARY_BUCKET)
      .upload(path, buffer, { contentType: file.type || 'image/jpeg', upsert: false })
    if (uploadError) {
      return NextResponse.json({ error: `Uppladdningen misslyckades: ${uploadError.message}` }, { status: 500 })
    }

    const r = await updateDiaryEntry(ctx.supabase, {
      business_id: ctx.businessId,
      id: params.logId,
      changed_by: ctx.user.id,
      action: 'photo_add',
      patch: { photos: [...rad.photos, path] },
    })
    if (!r.ok) {
      // Raden gick inte att uppdatera — lämna inte en föräldralös fil kvar.
      await ctx.supabase.storage.from(DIARY_BUCKET).remove([path]).catch(() => null)
      return NextResponse.json({ error: r.error }, { status: r.status })
    }

    const url = await signStorageUrl(ctx.supabase, DIARY_BUCKET, path, 3600)
    return NextResponse.json({ path, url })
  } catch (error: any) {
    console.error('Diary photo upload error:', error)
    return NextResponse.json({ error: error.message ?? 'Uppladdningen misslyckades' }, { status: 500 })
  }
}

/**
 * DELETE /api/projects/[id]/logs/[logId]/photos?path=… — tar bort ett foto
 * från raden och ur storage. Sökvägen måste ligga i företagets dagboksmapp
 * OCH finnas på just den här raden.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; logId: string } }
) {
  const ctx = await loadDiaryContext(request, params.id)
  if (!ctx.ok) return ctx.response

  const path = request.nextUrl.searchParams.get('path') ?? ''
  if (!path || !isDiaryPhotoPath(path, ctx.businessId)) {
    return NextResponse.json({ error: 'Ogiltig sökväg' }, { status: 400 })
  }

  const rad = await laddaRedigerbarRad(ctx, params.logId)
  if (!rad.ok) return rad.response
  if (!rad.photos.includes(path)) {
    return NextResponse.json({ error: 'Fotot finns inte på den här raden' }, { status: 404 })
  }

  const r = await updateDiaryEntry(ctx.supabase, {
    business_id: ctx.businessId,
    id: params.logId,
    changed_by: ctx.user.id,
    action: 'photo_remove',
    patch: { photos: rad.photos.filter(p => p !== path) },
  })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })

  // Storage-borttagningen är sekundär: raden är redan sanningen, en kvar-
  // liggande fil i en privat bucket läcker inget.
  const { error: removeError } = await ctx.supabase.storage.from(DIARY_BUCKET).remove([path])
  if (removeError) console.warn('Diary photo storage remove failed:', removeError.message)

  return NextResponse.json({ success: true, photos: rad.photos.filter(p => p !== path) })
}
