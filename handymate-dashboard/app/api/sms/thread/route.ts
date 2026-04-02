import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/sms/thread?phone=+46XXXXXXXXX — Hämta alla meddelanden i en SMS-tråd.
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const phone = request.nextUrl.searchParams.get('phone')
  if (!phone) return NextResponse.json({ error: 'phone parameter krävs' }, { status: 400 })

  const supabase = getServerSupabase()

  const { data: messages, error } = await supabase
    .from('sms_conversation')
    .select('id, phone_number, role, content, created_at')
    .eq('business_id', business.business_id)
    .eq('phone_number', phone)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) {
    console.error('[SMS thread] Error:', error)
    return NextResponse.json({ messages: [] })
  }

  return NextResponse.json({ messages: messages || [] })
}
