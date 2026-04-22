import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/lead-sources/list
 * Lättviktslista av alla aktiva lead-källor (för dropdowns i pipeline/leads).
 * Returnerar både portaler och manuella kanaler.
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('lead_sources')
    .select('id, name, source_type, color, default_category')
    .eq('business_id', business.business_id)
    .eq('is_active', true)
    .order('source_type', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ sources: data || [] })
}
