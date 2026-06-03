import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { streamInline } from '@/lib/storage/stream-inline'

const BUCKET = 'project-files'

/**
 * GET /api/projects/[id]/documents/[docId]
 * Default: returnerar signedUrl JSON (legacy).
 * ?view=inline: streamar bytes med Content-Disposition: inline så
 *   PDF/bilder visas i browsern istället för att tvingas ner.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    const { data: doc, error } = await supabase
      .from('project_document')
      .select('*')
      .eq('id', params.docId)
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (error || !doc) {
      return NextResponse.json({ error: 'Dokument hittades inte' }, { status: 404 })
    }

    const viewMode = request.nextUrl.searchParams.get('view')
    if (viewMode === 'inline') {
      return streamInline(supabase, BUCKET, doc.file_path, doc.name || 'dokument', doc.mime_type)
    }

    // Generate signed URL
    const { data: signedUrl, error: urlError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.file_path, 3600) // 1 hour

    if (urlError) throw urlError

    return NextResponse.json({ url: signedUrl.signedUrl, document: doc })

  } catch (error: any) {
    console.error('Get document URL error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/projects/[id]/documents/[docId] - Ta bort dokument
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // Fetch document
    const { data: doc, error: fetchError } = await supabase
      .from('project_document')
      .select('*')
      .eq('id', params.docId)
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (fetchError || !doc) {
      return NextResponse.json({ error: 'Dokument hittades inte' }, { status: 404 })
    }

    // Delete from storage
    await supabase.storage
      .from(BUCKET)
      .remove([doc.file_path])

    // Delete record
    const { error: deleteError } = await supabase
      .from('project_document')
      .delete()
      .eq('id', params.docId)

    if (deleteError) throw deleteError

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Delete document error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
