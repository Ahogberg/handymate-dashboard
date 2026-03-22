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

    // Increment page_views — try RPC, fallback to manual update
    const rpcRes = await supabase.rpc('increment_storefront_views', { bid: business_id })
    if (rpcRes.error) {
      const { data } = await supabase
        .from('storefront')
        .select('page_views')
        .eq('business_id', business_id)
        .single()
      if (data) {
        await supabase
          .from('storefront')
          .update({ page_views: ((data as any).page_views || 0) + 1 })
          .eq('business_id', business_id)
      }
    }

    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  } catch {
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  }
}
