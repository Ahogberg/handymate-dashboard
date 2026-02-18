import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET - Lista dokument för en kund
 */
export async function GET(
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

    const { data: documents, error } = await supabase
      .from('customer_document')
      .select('*')
      .eq('customer_id', customerId)
      .eq('business_id', business.business_id)
      .order('uploaded_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ documents: documents || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Ladda upp ett dokument (metadata)
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
    const body = await request.json()

    const { file_name, file_url, file_type, file_size, category } = body

    if (!file_name || !file_url) {
      return NextResponse.json({ error: 'Missing file_name or file_url' }, { status: 400 })
    }

    const docId = 'doc_' + Math.random().toString(36).substr(2, 9)

    const { data, error } = await supabase
      .from('customer_document')
      .insert({
        id: docId,
        customer_id: customerId,
        business_id: business.business_id,
        file_name,
        file_url,
        file_type: file_type || null,
        file_size: file_size || null,
        category: category || 'other',
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ document: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort ett dokument
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const docId = request.nextUrl.searchParams.get('docId')

    if (!docId) {
      return NextResponse.json({ error: 'Missing docId' }, { status: 400 })
    }

    // Get the document to find the file path for storage deletion
    const { data: doc } = await supabase
      .from('customer_document')
      .select('file_url')
      .eq('id', docId)
      .eq('business_id', business.business_id)
      .single()

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Try to delete from storage if it's a Supabase storage URL
    if (doc.file_url?.includes('/storage/')) {
      const pathMatch = doc.file_url.match(/customer-documents\/(.+)/)
      if (pathMatch) {
        await supabase.storage.from('customer-documents').remove([pathMatch[1]])
      }
    }

    const { error } = await supabase
      .from('customer_document')
      .delete()
      .eq('id', docId)
      .eq('business_id', business.business_id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
