import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/** POST — Batch-godkänn eller batch-skicka leads */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, leadIds } = await request.json()
  const supabase = getServerSupabase()

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return NextResponse.json({ error: 'Inga leads angivna' }, { status: 400 })
  }

  if (action === 'approve') {
    const { error } = await supabase
      .from('leads_outbound')
      .update({ status: 'approved' })
      .in('id', leadIds)
      .eq('business_id', business.business_id)
      .eq('status', 'draft')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, approved: leadIds.length })
  }

  return NextResponse.json({ error: 'Ogiltig åtgärd' }, { status: 400 })
}
