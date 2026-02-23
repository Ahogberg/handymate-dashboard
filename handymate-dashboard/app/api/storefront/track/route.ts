import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS })
}

export async function POST(request: NextRequest) {
  try {
    const { business_id, event } = await request.json()

    if (!business_id || event !== 'page_view') {
      return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
    }

    const supabase = getServerSupabase()

    // Increment page_views
    await supabase.rpc('increment_storefront_views', { bid: business_id }).catch(() => {
      // Fallback if RPC doesn't exist
      supabase
        .from('storefront')
        .select('page_views')
        .eq('business_id', business_id)
        .single()
        .then(({ data }: { data: Record<string, number> | null }) => {
          if (data) {
            supabase
              .from('storefront')
              .update({ page_views: (data.page_views || 0) + 1 })
              .eq('business_id', business_id)
              .then(() => {})
          }
        })
    })

    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  } catch {
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  }
}
