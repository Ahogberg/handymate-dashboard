import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { ensureBucket } from '@/lib/storage'

const BUCKET = 'project-files'

/**
 * GET /api/projects/[id]/documents - Lista projektdokument
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const projectId = params.id
    const category = request.nextUrl.searchParams.get('category')

    let query = supabase
      .from('project_document')
      .select('*')
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (category && category !== 'all') {
      query = query.eq('category', category)
    }

    const { data: documents, error } = await query

    if (error) throw error

    return NextResponse.json({ documents: documents || [] })

  } catch (error: any) {
    console.error('Get project documents error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/projects/[id]/documents - Ladda upp dokument
 *
 * Använder Buffer (inte raw File) — Web File-polyfillen i Next.js
 * server-runtime fungerar inte tillförlitligt med Supabase storage-js's
 * multipart-upload. Customer + deal upload-rutter använder samma mönster.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const projectId = params.id

    // Bucket-config är best-effort (kastar aldrig — se lib/storage.ts).
    // Uploaden funkar ändå via service_role om bucket finns.
    await ensureBucket(supabase, BUCKET, { public: true })

    // Parse multipart-body
    let formData: FormData
    try {
      formData = await request.formData()
    } catch (parseErr: any) {
      console.error('[projects/documents] FormData-parse misslyckades:', parseErr?.message || parseErr)
      return NextResponse.json({ error: 'Kunde inte läsa filuppladdningen' }, { status: 400 })
    }

    const file = formData.get('file') as File | null
    const category = (formData.get('category') as string) || 'other'

    if (!file) {
      console.error('[projects/documents] Ingen fil i FormData', { project_id: projectId, category })
      return NextResponse.json({ error: 'Fil saknas' }, { status: 400 })
    }

    if (file.size === 0) {
      console.error('[projects/documents] Tom fil', { name: file.name, project_id: projectId })
      return NextResponse.json({ error: 'Filen är tom' }, { status: 400 })
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'Filen är för stor (max 50 MB)' }, { status: 400 })
    }

    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${business.business_id}/${projectId}/${timestamp}_${safeName}`

    // Konvertera till Buffer — kritiskt för server-side Supabase upload
    let buffer: Buffer
    try {
      const arrayBuffer = await file.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
    } catch (bufErr: any) {
      console.error('[projects/documents] arrayBuffer misslyckades:', bufErr?.message || bufErr, {
        name: file.name,
        size: file.size,
      })
      return NextResponse.json({ error: 'Kunde inte läsa filinnehållet' }, { status: 500 })
    }

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (uploadError) {
      console.error('[projects/documents] Storage upload misslyckades:', {
        message: uploadError.message,
        path: filePath,
        bucket: BUCKET,
        size: file.size,
        type: file.type,
      })
      return NextResponse.json(
        { error: `Uppladdningsfel: ${uploadError.message}` },
        { status: 500 },
      )
    }

    const id = `doc_${timestamp}_${Math.random().toString(36).substring(2, 9)}`

    const { data: document, error: insertError } = await supabase
      .from('project_document')
      .insert({
        id,
        project_id: projectId,
        business_id: business.business_id,
        name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type || null,
        category,
      })
      .select()
      .single()

    if (insertError) {
      console.error('[projects/documents] DB insert misslyckades:', {
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        code: insertError.code,
        path: filePath,
      })
      // Rollback: ta bort filen från storage så vi inte lämnar orphaner
      await supabase.storage.from(BUCKET).remove([filePath]).catch(() => {})
      return NextResponse.json(
        { error: `Kunde inte spara dokument-metadata: ${insertError.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json({ document })
  } catch (error: any) {
    console.error('[projects/documents] Oväntat fel:', error?.message || error, error?.stack)
    return NextResponse.json(
      { error: error?.message || 'Oväntat fel vid uppladdning' },
      { status: 500 },
    )
  }
}
