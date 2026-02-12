import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const supabase = getServerSupabase()
    const { token } = params

    // Find customer by portal token
    const { data: customer, error } = await supabase
      .from('customer')
      .select('customer_id, business_id, name, phone_number, email, address_line, portal_enabled')
      .eq('portal_token', token)
      .single()

    if (error || !customer) {
      return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })
    }

    if (!customer.portal_enabled) {
      return NextResponse.json({ error: 'Portalen är inte aktiv' }, { status: 403 })
    }

    // Get business info
    const { data: business } = await supabase
      .from('business_config')
      .select('business_name, contact_name, contact_email, phone_number')
      .eq('business_id', customer.business_id)
      .single()

    // Update last visited
    await supabase
      .from('customer')
      .update({ portal_last_visited_at: new Date().toISOString() })
      .eq('customer_id', customer.customer_id)

    // Count unread messages
    const { count: unreadCount } = await supabase
      .from('customer_message')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', customer.customer_id)
      .eq('direction', 'outbound')
      .is('read_at', null)

    return NextResponse.json({
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone_number,
        customerId: customer.customer_id
      },
      business: {
        name: business?.business_name || '',
        contactName: business?.contact_name || '',
        email: business?.contact_email || '',
        phone: business?.phone_number || ''
      },
      unreadMessages: unreadCount || 0
    })
  } catch (error: any) {
    console.error('Portal error:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
