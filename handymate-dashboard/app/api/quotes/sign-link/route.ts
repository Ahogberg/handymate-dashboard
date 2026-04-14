import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getOrCreatePortalLink } from '@/lib/portal-link'
import crypto from 'crypto'

/**
 * POST /api/quotes/sign-link — Generera kundportal-länk för offert
 * Body: { quoteId: string }
 *
 * Returnerar /portal/[token]?tab=quotes så kunden alltid landar i portalen.
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

    const { data: quote, error: fetchError } = await supabase
      .from('quotes')
      .select('quote_id, status, sign_token, customer_id, business_id')
      .eq('quote_id', quoteId)
      .single()

    if (fetchError || !quote) {
      return NextResponse.json({ error: 'Offert hittades inte' }, { status: 404 })
    }

    // Verifiera ägarskap (multi-account safe)
    const { data: ownerCheck } = await supabase
      .from('business_config')
      .select('business_id')
      .eq('business_id', quote.business_id)
      .or(`user_id.eq.${business.user_id},contact_email.eq.${business.contact_email}`)
      .maybeSingle()

    if (!ownerCheck) {
      return NextResponse.json({ error: 'Ingen behörighet' }, { status: 403 })
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
      await supabase.from('quotes').update(updates).eq('quote_id', quoteId)
    }

    // Bygg portal-länk (skapar portal_token om saknas)
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
