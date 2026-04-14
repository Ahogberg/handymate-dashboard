import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getOrCreatePortalLink } from '@/lib/portal-link'
import crypto from 'crypto'

/**
 * POST /api/quotes/[id]/sign-link — Generera kundportal-länk för offert
 *
 * Returnerar /portal/[token]?tab=quotes så kunden alltid landar i portalen.
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

    const { data: quote, error: fetchError } = await supabase
      .from('quotes')
      .select('quote_id, status, sign_token, customer_id')
      .eq('quote_id', quoteId)
      .eq('business_id', business.business_id)
      .single()

    if (fetchError || !quote) {
      return NextResponse.json({ error: 'Offert hittades inte' }, { status: 404 })
    }

    // Säkerställ sign_token — krävs för signering
    let signToken = quote.sign_token
    if (!signToken) {
      signToken = crypto.randomUUID()
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
    }

    if (!quote.customer_id) {
      return NextResponse.json({ error: 'Offert saknar kund — kan inte skapa portal-länk' }, { status: 400 })
    }

    const portalUrl = await getOrCreatePortalLink(supabase, quote.customer_id, 'quotes')
    if (!portalUrl) {
      return NextResponse.json({ error: 'Kunde inte skapa portal-länk' }, { status: 500 })
    }

    return NextResponse.json({
      url: portalUrl,
      token: signToken,
    })

  } catch (error: any) {
    console.error('Generate sign link error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
