import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

async function getCustomerFromToken(token: string) {
  const supabase = getServerSupabase()
  const { data } = await supabase
    .from('customer')
    .select('customer_id, business_id, portal_enabled')
    .eq('portal_token', token)
    .single()
  if (!data || !data.portal_enabled) return null
  return data
}

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const customer = await getCustomerFromToken(params.token)
    if (!customer) return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })

    const supabase = getServerSupabase()

    const { data: quotes } = await supabase
      .from('quotes')
      .select('quote_id, title, status, total, customer_pays, rot_rut_type, rot_rut_deduction, valid_until, created_at, sent_at, accepted_at, sign_token')
      .eq('business_id', customer.business_id)
      .eq('customer_id', customer.customer_id)
      .in('status', ['sent', 'opened', 'accepted', 'declined', 'expired'])
      .order('created_at', { ascending: false })

    return NextResponse.json({ quotes: quotes || [] })
  } catch (error: any) {
    console.error('Portal quotes error:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
