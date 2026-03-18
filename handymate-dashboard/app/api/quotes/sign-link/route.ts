import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import crypto from 'crypto'

/**
 * POST /api/quotes/sign-link — Generera signeringslänk för offert
 * Body: { quoteId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { quoteId } = await request.json()
    if (!quoteId) {
      return NextResponse.json({ error: 'Missing quoteId' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    // Verify quote belongs to business
    const { data: quote, error: fetchError } = await supabase
      .from('quotes')
      .select('quote_id, status, sign_token, customer_id')
      .eq('quote_id', quoteId)
      .eq('business_id', business.business_id)
      .single()

    if (fetchError || !quote) {
      return NextResponse.json({ error: 'Offert hittades inte' }, { status: 404 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

    // If already has a sign token, return existing URL
    if (quote.sign_token) {
      return NextResponse.json({
        url: `${baseUrl}/quote/${quote.sign_token}`,
        token: quote.sign_token,
      })
    }

    // Generate new sign token
    const signToken = crypto.randomUUID()

    // Update quote with sign token and set status to 'sent' if draft
    const updates: Record<string, any> = { sign_token: signToken }
    if (quote.status === 'draft') {
      updates.status = 'sent'
      updates.sent_at = new Date().toISOString()
    }

    const { error: updateError } = await supabase
      .from('quotes')
      .update(updates)
      .eq('quote_id', quoteId)
      .eq('business_id', business.business_id)

    if (updateError) throw updateError

    // Auto-aktivera kundportal
    if (quote.customer_id) {
      const existingToken = await supabase
        .from('customers')
        .select('portal_token')
        .eq('customer_id', quote.customer_id)
        .single()

      if (!existingToken.data?.portal_token) {
        await supabase
          .from('customers')
          .update({ portal_token: crypto.randomUUID() })
          .eq('customer_id', quote.customer_id)
      }
    }

    return NextResponse.json({
      url: `${baseUrl}/quote/${signToken}`,
      token: signToken,
    })

  } catch (error: any) {
    console.error('Generate sign link error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
