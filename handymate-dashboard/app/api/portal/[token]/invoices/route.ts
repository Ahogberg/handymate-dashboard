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

    const { data: invoices } = await supabase
      .from('invoice')
      .select('invoice_id, invoice_number, status, total, due_date, paid_at, created_at, rot_rut_type')
      .eq('business_id', customer.business_id)
      .eq('customer_id', customer.customer_id)
      .in('status', ['sent', 'paid', 'overdue'])
      .order('created_at', { ascending: false })

    // Get business payment info
    const { data: biz } = await supabase
      .from('business_config')
      .select('bankgiro, phone_number')
      .eq('business_id', customer.business_id)
      .single()

    return NextResponse.json({
      invoices: invoices || [],
      paymentInfo: {
        bankgiro: biz?.bankgiro || null,
        swish: biz?.phone_number || null
      }
    })
  } catch (error: any) {
    console.error('Portal invoices error:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
