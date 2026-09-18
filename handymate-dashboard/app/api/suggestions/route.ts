import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

/**
 * GET - Lista AI-förslag för ett företag
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const status = request.nextUrl.searchParams.get('status')
    const type = request.nextUrl.searchParams.get('type')

    let query = supabase
      .from('ai_suggestion')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    } else {
      // Default: show pending suggestions
      query = query.eq('status', 'pending')
    }

    if (type) {
      query = query.eq('suggestion_type', type)
    }

    const { data: suggestions, error } = await query

    if (error) throw error

    return NextResponse.json({ suggestions: suggestions || [] })
  } catch (error: any) {
    console.error('Get suggestions error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
