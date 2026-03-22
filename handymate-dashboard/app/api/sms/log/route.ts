import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/sms/log — Hämta senaste SMS-loggar
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '30')

  const { data: logs, error } = await supabase
    .from('sms_log')
    .select('sms_id, direction, phone_from, phone_to, message, status, error_message, elks_id, created_at')
    .eq('business_id', business.business_id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    // Tabellen kanske inte finns ännu
    return NextResponse.json({ logs: [] })
  }

  return NextResponse.json({ logs: logs || [] })
}
