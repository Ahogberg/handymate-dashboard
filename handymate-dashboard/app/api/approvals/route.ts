import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/approvals — List pending approvals
 * POST /api/approvals — Create a new approval request
 */

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const status = request.nextUrl.searchParams.get('status') || 'pending'

    const { data, error } = await supabase
      .from('pending_approvals')
      .select('*')
      .eq('business_id', business.business_id)
      .eq('status', status)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ approvals: data || [] })
  } catch (error: any) {
    console.error('GET /api/approvals error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { approval_type, title, description, payload, agent_run_id } = body

    if (!approval_type || !title) {
      return NextResponse.json({ error: 'Missing approval_type or title' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    const id = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    const { data, error } = await supabase
      .from('pending_approvals')
      .insert({
        id,
        business_id: business.business_id,
        agent_run_id: agent_run_id || null,
        approval_type,
        title,
        description: description || null,
        payload: payload || {},
        status: 'pending',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    // Send push notification (fire and forget)
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
      fetch(`${appUrl}/api/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.business_id,
          title: 'Nytt att godkänna',
          body: title,
          url: '/dashboard/approvals',
        }),
      }).catch(() => {})
    } catch { /* non-fatal */ }

    return NextResponse.json({ approval: data }, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/approvals error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
