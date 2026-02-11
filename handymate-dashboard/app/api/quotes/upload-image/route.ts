import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('image') as File

    if (!file) {
      return NextResponse.json({ error: 'Ingen bild' }, { status: 400 })
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Ogiltig filtyp' }, { status: 400 })
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Bilden är för stor (max 10MB)' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const timestamp = Date.now()
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${business.business_id}/${timestamp}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { data, error } = await supabase.storage
      .from('quote-images')
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false
      })

    if (error) {
      // If bucket doesn't exist, just return without URL - image will be sent as base64
      console.error('Upload error:', error)
      return NextResponse.json({
        success: true,
        url: null,
        message: 'Bilden kunde inte laddas upp till storage, men kan fortfarande användas för AI-analys'
      })
    }

    const { data: urlData } = supabase.storage
      .from('quote-images')
      .getPublicUrl(path)

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      path
    })
  } catch (error: any) {
    console.error('Image upload error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
