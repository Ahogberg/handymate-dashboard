import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { SUPPLIER_DEFINITIONS } from '@/lib/suppliers/registry'

/**
 * GET /api/grossist - Lista grossister + anslutningsstatus
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    const { data: connections } = await supabase
      .from('supplier_connection')
      .select('*')
      .eq('business_id', business.business_id)

    const connectionMap = new Map(
      (connections || []).map((c: any) => [c.supplier_key, c])
    )

    const suppliers = SUPPLIER_DEFINITIONS.map(def => {
      const conn = connectionMap.get(def.key) as any
      return {
        ...def,
        connected: conn?.is_connected || false,
        connection_id: conn?.connection_id || null,
        connected_at: conn?.connected_at || null,
        last_sync_at: conn?.last_sync_at || null,
        sync_error: conn?.sync_error || null,
        settings: conn?.settings || {}
      }
    })

    return NextResponse.json({ suppliers })

  } catch (error: any) {
    console.error('Get grossist error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
