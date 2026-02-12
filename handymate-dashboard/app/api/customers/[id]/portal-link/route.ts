import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()
    const customerId = params.id

    // Verify customer belongs to business
    const { data: customer } = await supabase
      .from('customer')
      .select('customer_id, portal_token')
      .eq('customer_id', customerId)
      .eq('business_id', business.business_id)
      .single()

    if (!customer) return NextResponse.json({ error: 'Kund ej hittad' }, { status: 404 })

    // Generate new token
    const token = randomUUID()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://handymate.se'

    await supabase
      .from('customer')
      .update({
        portal_token: token,
        portal_token_created_at: new Date().toISOString(),
        portal_enabled: true
      })
      .eq('customer_id', customerId)

    return NextResponse.json({
      success: true,
      token,
      url: `${appUrl}/portal/${token}`
    })
  } catch (error: any) {
    console.error('Generate portal link error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()

    await supabase
      .from('customer')
      .update({ portal_enabled: false })
      .eq('customer_id', params.id)
      .eq('business_id', business.business_id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Disable portal error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
