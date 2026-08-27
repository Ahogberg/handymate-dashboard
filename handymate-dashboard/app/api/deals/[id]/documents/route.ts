import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/** GET /api/deals/[id]/documents — bara dokument som faktiskt hör till affären. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: dealId } = await params
  const supabase = getServerSupabase()
  const { data: deal, error: dealError } = await supabase
    .from('deal')
    .select('id')
    .eq('id', dealId)
    .eq('business_id', business.business_id)
    .maybeSingle()

  if (dealError) return NextResponse.json({ error: dealError.message }, { status: 500 })
  if (!deal) return NextResponse.json({ error: 'Affären hittades inte' }, { status: 404 })

  const { data, error } = await supabase
    .from('customer_document')
    .select('*')
    .eq('business_id', business.business_id)
    .eq('deal_id', dealId)
    .order('uploaded_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ documents: data || [] })
}

