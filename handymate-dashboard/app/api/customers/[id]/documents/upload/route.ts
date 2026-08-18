import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { ensureBucket } from '@/lib/storage'

/**
 * POST /api/customers/[id]/documents/upload
 * Server-side file upload to Supabase Storage + metadata save
 * Accepts FormData with: file, category (optional)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: customerId } = await params
    const supabase = getServerSupabase()
    // v151: bucketen är privat sedan 2026-08-18 — public:true hade tyst
    // synkat den tillbaka till publik (se lib/storage.ts "Bucket finns —
    // synka public-flaggan om den driftat").
    await ensureBucket(supabase, 'customer-documents', { public: false })

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const category = (formData.get('category') as string) || 'other'

    if (!file) {
      return NextResponse.json({ error: 'Ingen fil bifogad' }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Filen är för stor (max 10 MB)' }, { status: 400 })
    }

    // Upload to Supabase Storage using service role (bypasses RLS)
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${business.business_id}/${customerId}/${timestamp}_${safeName}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from('customer-documents')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({ error: 'Kunde inte ladda upp filen: ' + uploadError.message }, { status: 500 })
    }

    // v151: bucketen är privat — file_url lagrar PATH (inte en publik URL,
    // som ändå skulle 403:a). Läsning signerar via /documents/[docId].
    const docId = 'doc_' + Math.random().toString(36).substr(2, 9)
    const { data, error } = await supabase
      .from('customer_document')
      .insert({
        id: docId,
        customer_id: customerId,
        business_id: business.business_id,
        file_name: file.name,
        file_url: filePath,
        file_type: file.type || null,
        file_size: file.size || null,
        category,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ document: data })
  } catch (error: any) {
    console.error('POST document upload error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
