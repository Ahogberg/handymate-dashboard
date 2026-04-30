import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB enligt sprint-spec
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

/**
 * POST /api/matte/upload-image
 *
 * Multipart upload för bilder som hantverkaren bifogar i Matte-chat.
 * Återanvänder Supabase storage-bucket "quote-images" med subfolder
 * "matte/<business_id>/<timestamp>.<ext>" istället för en ny bucket.
 *
 * Returnerar { url, path, base64? }. Klienten kan välja att skicka antingen
 * url:en eller base64:en till /api/matte/chat — backend hanterar båda.
 *
 * Begränsningar:
 *   - Max 5 MB per bild (sprint-spec)
 *   - Bara image/jpeg|png|webp|gif
 *   - Svensk fellabel
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('image') as File | null
    if (!file) {
      return NextResponse.json({ error: 'Ingen bild bifogad' }, { status: 400 })
    }

    if (!file.type || !ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: 'Ogiltig filtyp. Tillåtna: JPEG, PNG, WebP, GIF.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'Bilden är för stor (max 5 MB).' },
        { status: 400 }
      )
    }

    const supabase = getServerSupabase()
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const timestamp = Date.now()
    const path = `matte/${business.business_id}/${timestamp}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadErr } = await supabase.storage
      .from('quote-images')
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      })

    // Vid storage-fel: fall tillbaka till base64-flow så användaren
    // ändå kan skicka bilden i chat (samma mönster som /api/quotes/upload-image)
    if (uploadErr) {
      console.error('[matte/upload-image] storage error:', uploadErr.message)
      const base64 = buffer.toString('base64')
      return NextResponse.json({
        success: true,
        url: null,
        path: null,
        base64,
        media_type: file.type,
        size_bytes: file.size,
        warning: 'Bilden lagrades inte i storage men kan analyseras direkt.',
      })
    }

    const { data: urlData } = supabase.storage
      .from('quote-images')
      .getPublicUrl(path)

    return NextResponse.json({
      success: true,
      url: urlData?.publicUrl || null,
      path,
      media_type: file.type,
      size_bytes: file.size,
    })
  } catch (err: any) {
    console.error('[matte/upload-image] error:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
