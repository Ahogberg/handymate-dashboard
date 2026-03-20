import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { ensureBucket } from '@/lib/storage'

/**
 * POST /api/deals/[id]/documents/upload
 * Upload documents for a deal that may not have a customer yet.
 * Uses deal_id-based storage path instead of customer_id.
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

    const { id: dealId } = await params
    const supabase = getServerSupabase()
    await ensureBucket(supabase, 'customer-documents', { public: true })

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const category = (formData.get('category') as string) || 'other'

    if (!file) {
      return NextResponse.json({ error: 'Ingen fil bifogad' }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Filen är för stor (max 10 MB)' }, { status: 400 })
    }

    // Look up the deal to get customer_id if available
    const { data: deal } = await supabase
      .from('deal')
      .select('customer_id')
      .eq('id', dealId)
      .eq('business_id', business.business_id)
      .single()

    // Upload to Supabase Storage using service role (bypasses RLS)
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')

    // Use customer-based path if customer exists, otherwise deal-based path
    const filePath = deal?.customer_id
      ? `${business.business_id}/${deal.customer_id}/documents/${timestamp}_${safeName}`
      : `${business.business_id}/deals/${dealId}/documents/${timestamp}_${safeName}`

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

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('customer-documents')
      .getPublicUrl(filePath)

    // Save metadata - use customer_id if available, otherwise use deal_id as reference
    const docId = 'doc_' + Math.random().toString(36).substr(2, 9)
    const { data, error } = await supabase
      .from('customer_document')
      .insert({
        id: docId,
        customer_id: deal?.customer_id || dealId,
        business_id: business.business_id,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_type: file.type || null,
        file_size: file.size || null,
        category,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ document: data })
  } catch (error: unknown) {
    console.error('POST deal document upload error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
