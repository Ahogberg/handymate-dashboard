import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/storefront - Hämta storefront för inloggat företag
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('storefront')
      .select('*')
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({ storefront: data })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Okänt fel'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * PUT /api/storefront - Uppdatera storefront-inställningar
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    // Validate slug if changing
    if (body.slug) {
      const slugClean = body.slug
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .substring(0, 30)

      const { data: slugTaken } = await supabase
        .from('storefront')
        .select('id')
        .eq('slug', slugClean)
        .neq('business_id', business.business_id)
        .maybeSingle()

      if (slugTaken) {
        return NextResponse.json({ error: 'Denna URL är redan tagen' }, { status: 409 })
      }

      body.slug = slugClean
    }

    const allowedFields = [
      'slug', 'is_published', 'hero_headline', 'hero_description',
      'about_text', 'hero_image_url', 'gallery_images', 'color_scheme',
      'service_descriptions', 'meta_title', 'meta_description',
      'sections', 'show_chat_widget', 'certifications',
    ]

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        updates[key] = body[key]
      }
    }

    const { error } = await supabase
      .from('storefront')
      .update(updates)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Okänt fel'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
