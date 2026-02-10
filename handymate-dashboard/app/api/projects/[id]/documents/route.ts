import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

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

    const formData = await request.formData()
    const file = formData.get('file') as File
    const category = (formData.get('category') as string) || 'other'

    if (!file) {
      return NextResponse.json({ error: 'Fil saknas' }, { status: 400 })
    }

    // Upload to Supabase Storage
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${business.business_id}/${projectId}/${timestamp}_${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('project-files')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Kunde inte ladda upp fil' }, { status: 500 })
    }

    // Create document record
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
        mime_type: file.type,
        category,
      })
      .select()
      .single()

    if (insertError) throw insertError

    return NextResponse.json({ document })

  } catch (error: any) {
    console.error('Upload document error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
