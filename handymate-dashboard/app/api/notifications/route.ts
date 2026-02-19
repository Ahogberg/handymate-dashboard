import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET - Hämta notifikationer för inloggat företag
 * Query params:
 *   unread_only: boolean (default false)
 *   limit: number (default 20, max 100)
 *   offset: number (default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get('unread_only') === 'true'
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    const supabase = getServerSupabase()

    let query = supabase
      .from('notification')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (unreadOnly) {
      query = query.eq('is_read', false)
    }

    const { data: notifications, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get unread count
    const { count: unreadCount } = await supabase
      .from('notification')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business.business_id)
      .eq('is_read', false)

    return NextResponse.json({
      notifications: notifications || [],
      unread_count: unreadCount || 0,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Markera notifikationer som lästa
 * Body:
 *   notification_ids: string[]   - Specifika att markera
 *   mark_all_read: boolean       - Markera alla som lästa
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const supabase = getServerSupabase()

    if (body.mark_all_read) {
      await supabase
        .from('notification')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('business_id', business.business_id)
        .eq('is_read', false)

      return NextResponse.json({ success: true, message: 'Alla notifikationer markerade som lästa' })
    }

    if (body.notification_ids && Array.isArray(body.notification_ids)) {
      await supabase
        .from('notification')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('business_id', business.business_id)
        .in('id', body.notification_ids)

      return NextResponse.json({ success: true, updated: body.notification_ids.length })
    }

    return NextResponse.json({ error: 'Ange notification_ids eller mark_all_read' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
