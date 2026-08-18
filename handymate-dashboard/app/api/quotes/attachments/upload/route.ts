import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { ensureBucket } from '@/lib/storage'
import { signStorageUrl } from '@/lib/storage-signing'

const BUCKET = 'customer-documents'

/**
 * POST /api/quotes/attachments/upload
 *
 * Server-side uppladdning av offert-bilagor (dokument + foton bifogade
 * medan offerten byggs). Ersätter den tidigare direkta webbläsar-
 * uppladdningen mot supabase.storage från quotes/new och quotes/[id]/edit
 * — customer-documents är privat sedan v151 och tar inte längre emot
 * anon/authenticated-uppladdningar.
 *
 * Bilagor på en offert är INTE alltid knutna till en kund (utkast innan
 * kund valts) — därför en egen rutt i stället för att återanvända
 * /api/customers/[id]/documents/upload, som kräver ett customer_id.
 *
 * Accepterar FormData: file (krävs), quoteId (valfri — styr bara sökvägen
 * så filer för samma offert grupperas).
 *
 * Returnerar { name, path, size, url }. `path` är det som ska SPARAS i
 * quotes.attachments (aldrig `url`, som är en kortlivad signerad länk bara
 * för direkt visning i uppladdningsögonblicket).
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    await ensureBucket(supabase, BUCKET, { public: false })

    let formData: FormData
    try {
      formData = await request.formData()
    } catch (parseErr: any) {
      console.error('[quotes/attachments/upload] FormData-parse misslyckades:', parseErr?.message || parseErr)
      return NextResponse.json({ error: 'Kunde inte läsa filuppladdningen' }, { status: 400 })
    }

    const file = formData.get('file') as File | null
    const quoteId = (formData.get('quoteId') as string) || 'drafts'

    if (!file) {
      return NextResponse.json({ error: 'Ingen fil bifogad' }, { status: 400 })
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'Filen är tom' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Filen är för stor (max 10 MB)' }, { status: 400 })
    }

    const safeQuoteId = quoteId.replace(/[^a-zA-Z0-9._-]/g, '_')
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${business.business_id}/quotes/${safeQuoteId}/${timestamp}_${safeName}`

    let buffer: Buffer
    try {
      const arrayBuffer = await file.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
    } catch (bufErr: any) {
      console.error('[quotes/attachments/upload] arrayBuffer misslyckades:', bufErr?.message || bufErr)
      return NextResponse.json({ error: 'Kunde inte läsa filinnehållet' }, { status: 500 })
    }

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (uploadError) {
      console.error('[quotes/attachments/upload] Storage upload misslyckades:', uploadError.message)
      return NextResponse.json({ error: 'Kunde inte ladda upp filen: ' + uploadError.message }, { status: 500 })
    }

    // Signerad URL bara för OMEDELBAR visning i kompositionsläget — sparas
    // ALDRIG. Klienten ska spara `path` i attachments-listan.
    const signedUrl = await signStorageUrl(supabase, BUCKET, filePath, 3600)

    return NextResponse.json({
      name: file.name,
      path: filePath,
      size: file.size,
      url: signedUrl || filePath,
    })
  } catch (error: any) {
    console.error('[quotes/attachments/upload] Oväntat fel:', error?.message || error)
    return NextResponse.json({ error: error?.message || 'Oväntat fel vid uppladdning' }, { status: 500 })
  }
}
