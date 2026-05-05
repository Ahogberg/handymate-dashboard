import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { ensureBucket } from '@/lib/storage'

const BUCKET = 'customer-documents'

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

    // Bucket-config best-effort, kastar aldrig — uploaden funkar via service_role.
    await ensureBucket(supabase, BUCKET, { public: true })

    let formData: FormData
    try {
      formData = await request.formData()
    } catch (parseErr: any) {
      console.error('[deals/documents] FormData-parse misslyckades:', parseErr?.message || parseErr)
      return NextResponse.json({ error: 'Kunde inte läsa filuppladdningen' }, { status: 400 })
    }

    const file = formData.get('file') as File | null
    const category = (formData.get('category') as string) || 'other'

    if (!file) {
      console.error('[deals/documents] Ingen fil i FormData', { deal_id: dealId, category })
      return NextResponse.json({ error: 'Ingen fil bifogad' }, { status: 400 })
    }

    if (file.size === 0) {
      console.error('[deals/documents] Tom fil', { name: file.name, deal_id: dealId })
      return NextResponse.json({ error: 'Filen är tom' }, { status: 400 })
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

    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')

    // Use customer-based path if customer exists, otherwise deal-based path
    const filePath = deal?.customer_id
      ? `${business.business_id}/${deal.customer_id}/documents/${timestamp}_${safeName}`
      : `${business.business_id}/deals/${dealId}/documents/${timestamp}_${safeName}`

    let buffer: Buffer
    try {
      const arrayBuffer = await file.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
    } catch (bufErr: any) {
      console.error('[deals/documents] arrayBuffer misslyckades:', bufErr?.message || bufErr, {
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
      console.error('[deals/documents] Storage upload misslyckades:', {
        message: uploadError.message,
        path: filePath,
        bucket: BUCKET,
        size: file.size,
        type: file.type,
      })
      return NextResponse.json(
        { error: 'Kunde inte ladda upp filen: ' + uploadError.message },
        { status: 500 },
      )
    }

    // Get public URL — används som fallback i UI:t (signerad URL skapas
    // via /api/customers/[id]/documents/[docId] vid klick).
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath)

    const docId = 'doc_' + Math.random().toString(36).substr(2, 9)
    const { data, error: insertError } = await supabase
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

    if (insertError) {
      console.error('[deals/documents] DB insert misslyckades:', {
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        code: insertError.code,
        path: filePath,
      })
      // Rollback: ta bort filen så vi inte lämnar orphaner
      await supabase.storage.from(BUCKET).remove([filePath]).catch(() => {})
      return NextResponse.json(
        { error: 'Kunde inte spara dokument-metadata: ' + insertError.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ document: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const stack = error instanceof Error ? error.stack : undefined
    console.error('[deals/documents] Oväntat fel:', message, stack)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
