import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import crypto from 'crypto'

/**
 * POST /api/quotes/[id]/sign-link - Generera signeringslänk för offert
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const quoteId = params.id

    // Verify quote belongs to business
    const { data: quote, error: fetchError } = await supabase
      .from('quotes')
      .select('quote_id, status, sign_token')
      .eq('quote_id', quoteId)
      .eq('business_id', business.business_id)
      .single()

    if (fetchError || !quote) {
      return NextResponse.json({ error: 'Offert hittades inte' }, { status: 404 })
    }

    // If already has a sign token, return existing URL
    if (quote.sign_token) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
      return NextResponse.json({
        url: `${baseUrl}/quote/${quote.sign_token}`,
        token: quote.sign_token,
      })
    }

    // Generate new sign token
    const signToken = crypto.randomUUID()

    // Update quote with sign token and set status to 'sent' if draft
    const updates: any = { sign_token: signToken }
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

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
    return NextResponse.json({
      url: `${baseUrl}/quote/${signToken}`,
      token: signToken,
    })

  } catch (error: any) {
    console.error('Generate sign link error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
