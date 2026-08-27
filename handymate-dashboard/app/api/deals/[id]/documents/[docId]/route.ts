import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { extractStoragePath } from '@/lib/storage-signing'
import { streamInline } from '@/lib/storage/stream-inline'

const BUCKET = 'customer-documents'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: dealId, docId } = await params
  const supabase = getServerSupabase()
  const { data: doc, error } = await supabase
    .from('customer_document')
    .select('*')
    .eq('id', docId)
    .eq('deal_id', dealId)
    .eq('business_id', business.business_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!doc) return NextResponse.json({ error: 'Dokumentet hittades inte' }, { status: 404 })

  const path = extractStoragePath(doc.file_url, BUCKET)
  if (!path) return NextResponse.json({ error: 'Filen saknar lagringsplats' }, { status: 404 })

  const view = request.nextUrl.searchParams.get('view')
  if (view === 'inline' || view === 'download') {
    return streamInline(
      supabase,
      BUCKET,
      path,
      doc.file_name || 'dokument',
      doc.file_type,
      view === 'download' ? 'attachment' : 'inline',
    )
  }

  const { data: signed, error: signError } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (signError || !signed) return NextResponse.json({ error: 'Filen kunde inte öppnas' }, { status: 500 })
  return NextResponse.json({ url: signed.signedUrl, document: doc })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: dealId, docId } = await params
  const supabase = getServerSupabase()
  const { data: doc, error: fetchError } = await supabase
    .from('customer_document')
    .select('file_url')
    .eq('id', docId)
    .eq('deal_id', dealId)
    .eq('business_id', business.business_id)
    .maybeSingle()

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!doc) return NextResponse.json({ error: 'Dokumentet hittades inte' }, { status: 404 })

  const path = extractStoragePath(doc.file_url, BUCKET)
  if (path) {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([path])
    if (storageError) return NextResponse.json({ error: 'Filen kunde inte tas bort från lagringen' }, { status: 500 })
  }

  const { error: deleteError } = await supabase
    .from('customer_document')
    .delete()
    .eq('id', docId)
    .eq('deal_id', dealId)
    .eq('business_id', business.business_id)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

