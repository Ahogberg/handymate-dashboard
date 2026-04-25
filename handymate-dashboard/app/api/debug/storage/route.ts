import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { isAdmin } from '@/lib/admin-auth'

/**
 * GET /api/debug/storage — diagnostisera storage-problem (admin-only i produktion)
 */
export async function GET(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') {
      const adminCheck = await isAdmin(request)
      if (!adminCheck.isAdmin) {
        return NextResponse.json({ error: 'Endast för admin i produktion' }, { status: 403 })
      }
    }

    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const results: Record<string, unknown> = {}

    // 1. Lista alla buckets
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()
    results.buckets = bucketsError
      ? { error: bucketsError.message }
      : (buckets || []).map(b => ({ name: b.name, public: b.public, created_at: b.created_at }))

    // 2. Kolla specifika buckets
    for (const bucketName of ['customer-documents', 'project-files', 'logos', 'quote-images']) {
      const { error: getErr } = await supabase.storage.getBucket(bucketName)
      results[`bucket_${bucketName}`] = getErr ? { exists: false, error: getErr.message } : { exists: true }
    }

    // 3. Testa upload med en minimal PDF
    const testPdf = Buffer.from('%PDF-1.4 test content')
    const testPath = `${business.business_id}/debug/test_${Date.now()}.pdf`

    // Skapa bucket om den saknas
    const { error: ensureErr } = await supabase.storage.getBucket('customer-documents')
    if (ensureErr) {
      const { error: createErr } = await supabase.storage.createBucket('customer-documents', { public: true })
      results.bucket_created = createErr ? { error: createErr.message } : { success: true }
    }

    const { error: uploadErr } = await supabase.storage
      .from('customer-documents')
      .upload(testPath, testPdf, {
        contentType: 'application/pdf',
        upsert: true,
      })

    results.test_upload = uploadErr
      ? { success: false, error: uploadErr.message }
      : { success: true, path: testPath }

    // Rensa testfilen
    if (!uploadErr) {
      await supabase.storage.from('customer-documents').remove([testPath])
      results.test_cleanup = true
    }

    // 4. Kolla customer_document-tabellen
    const { count, error: tableErr } = await supabase
      .from('customer_document')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business.business_id)

    results.customer_document_table = tableErr
      ? { error: tableErr.message }
      : { exists: true, row_count: count }

    // 5. Kolla env
    results.env = {
      SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'MISSING',
      SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'MISSING',
    }

    return NextResponse.json(results)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
