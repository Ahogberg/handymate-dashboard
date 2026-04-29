import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

const BUCKET = 'customer-documents'

/**
 * Extraherar storage-path från en publik Supabase storage-URL.
 *
 * Format: https://<proj>.supabase.co/storage/v1/object/public/customer-documents/<path>
 * Returnerar: <path>
 */
function extractPathFromUrl(fileUrl: string | null | undefined): string | null {
  if (!fileUrl) return null
  // Matcha allt efter bucket-namnet (med både public/ och utan)
  const match = fileUrl.match(/customer-documents\/(.+?)(?:\?|$)/)
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * GET /api/customers/[id]/documents/[docId]
 * Returnerar signerad URL (1h expiry) för att öppna dokumentet.
 *
 * Anledning till denna endpoint: kund-dokumenten lagrar `file_url` som
 * publik URL från getPublicUrl(). Om bucket:en är privat (eller saknar
 * RLS-policy för storage.objects) 403:ar den URL:en. Genom att alltid
 * generera signerad URL server-side undviker vi det helt — fungerar
 * oavsett bucket-konfiguration.
 *
 * Detta speglar projektets mönster (/api/projects/[id]/documents/[docId]).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: customerId, docId } = await params
    const supabase = getServerSupabase()

    const { data: doc, error } = await supabase
      .from('customer_document')
      .select('*')
      .eq('id', docId)
      .eq('business_id', business.business_id)
      .single()

    if (error || !doc) {
      return NextResponse.json({ error: 'Dokument hittades inte' }, { status: 404 })
    }

    // Verifiera att doc tillhör rätt kund (eller är deal-uppladdat — då matchar
    // customer_id deal_id i den äldre upload-pathen)
    if (doc.customer_id !== customerId) {
      return NextResponse.json({ error: 'Dokument hittades inte' }, { status: 404 })
    }

    const path = extractPathFromUrl(doc.file_url)
    if (!path) {
      // Fallback — om URL saknar canonical path, returnera den lagrade URL:en
      // (kan vara extern länk eller legacy-data)
      return NextResponse.json({ url: doc.file_url, document: doc })
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600)

    if (signErr || !signed) {
      console.error('createSignedUrl error:', signErr)
      // Fallback till lagrad URL (kan ändå fungera om bucket är publik)
      return NextResponse.json({ url: doc.file_url, document: doc })
    }

    return NextResponse.json({ url: signed.signedUrl, document: doc })
  } catch (error: any) {
    console.error('GET customer document URL error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/customers/[id]/documents/[docId]
 * Tar bort både fil från storage och rad från customer_document.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: customerId, docId } = await params
    const supabase = getServerSupabase()

    const { data: doc, error: fetchErr } = await supabase
      .from('customer_document')
      .select('file_url, customer_id')
      .eq('id', docId)
      .eq('business_id', business.business_id)
      .single()

    if (fetchErr || !doc) {
      return NextResponse.json({ error: 'Dokument hittades inte' }, { status: 404 })
    }

    if (doc.customer_id !== customerId) {
      return NextResponse.json({ error: 'Dokument hittades inte' }, { status: 404 })
    }

    // Försök ta bort från storage (inte fatal om det misslyckas)
    const path = extractPathFromUrl(doc.file_url)
    if (path) {
      await supabase.storage.from(BUCKET).remove([path])
    }

    const { error: delErr } = await supabase
      .from('customer_document')
      .delete()
      .eq('id', docId)
      .eq('business_id', business.business_id)

    if (delErr) throw delErr

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE customer document error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
