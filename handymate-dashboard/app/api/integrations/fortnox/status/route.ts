import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/integrations/fortnox/status
 *
 * Returnerar kopplings-status för UI. Inga tokens läcks — bara metadata.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { data } = await supabase
      .from('business_config')
      .select('fortnox_connected, fortnox_company_name, fortnox_connected_at, fortnox_last_synced_at, fortnox_token_expires_at')
      .eq('business_id', business.business_id)
      .maybeSingle()

    return NextResponse.json({
      connected: !!data?.fortnox_connected,
      company_name: data?.fortnox_company_name || null,
      connected_at: data?.fortnox_connected_at || null,
      last_synced_at: data?.fortnox_last_synced_at || null,
      token_expires_at: data?.fortnox_token_expires_at || null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
