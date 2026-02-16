import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * POST /api/feedback - Skicka feedback från pilotkunder
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { type, message, page, rating } = await request.json()

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Meddelande krävs' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    await supabase.from('pilot_feedback').insert({
      business_id: business.business_id,
      business_name: business.business_name,
      type: type || 'general',
      message: message.trim(),
      page: page || null,
      rating: rating || null,
      created_at: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Feedback error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * GET /api/feedback - Hämta feedback (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    const { data, error } = await supabase
      .from('pilot_feedback')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw error

    return NextResponse.json({ feedback: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
