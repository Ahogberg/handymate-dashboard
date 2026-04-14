import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getOrCreatePortalLink } from '@/lib/portal-link'

/**
 * GET /api/portal/verify-quote-flow?quoteId=Q-XXXX
 *
 * End-to-end diagnostik för offertsigneringsflödet via kundportalen.
 *
 * Steg:
 *   1. Offerten hittas och har sign_token
 *   2. Offerten har customer_id
 *   3. Kunden har portal_token (skapas via helper om saknas)
 *   4. Portal-URL byggs korrekt (/portal/{token}?tab=quotes)
 *   5. Public quote endpoint svarar och inkluderar portal_token
 *
 * Om quoteId saknas → använder senaste offerten för businesset.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const diagnostics: Record<string, unknown> = {}

    let quoteId = request.nextUrl.searchParams.get('quoteId')
    if (!quoteId) {
      const { data: latest } = await supabase
        .from('quotes')
        .select('quote_id')
        .eq('business_id', business.business_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      quoteId = latest?.quote_id || null
    }

    if (!quoteId) {
      return NextResponse.json({
        ok: false,
        summary: 'Inga offerter att testa mot',
      })
    }

    // Steg 1 — offerten finns och har sign_token
    const { data: quote, error: quoteErr } = await supabase
      .from('quotes')
      .select('quote_id, status, sign_token, customer_id, business_id, title')
      .eq('quote_id', quoteId)
      .eq('business_id', business.business_id)
      .maybeSingle()

    diagnostics.step1_quote_exists = {
      quote_id: quoteId,
      found: !!quote,
      has_sign_token: !!quote?.sign_token,
      status: quote?.status,
      error: quoteErr?.message || null,
    }

    if (!quote) {
      return NextResponse.json({ ok: false, summary: 'Offert saknas', diagnostics })
    }

    // Steg 2 — offerten har customer_id
    diagnostics.step2_has_customer = {
      passed: !!quote.customer_id,
      customer_id: quote.customer_id,
    }

    if (!quote.customer_id) {
      return NextResponse.json({ ok: false, summary: 'Offert saknar kund', diagnostics })
    }

    // Steg 3 — kunden får portal_token via helper (skapas vid behov)
    const { data: customerBefore } = await supabase
      .from('customer')
      .select('name, portal_token, portal_enabled')
      .eq('customer_id', quote.customer_id)
      .maybeSingle()

    const portalUrl = await getOrCreatePortalLink(supabase, quote.customer_id, 'quotes')

    const { data: customerAfter } = await supabase
      .from('customer')
      .select('portal_token, portal_enabled')
      .eq('customer_id', quote.customer_id)
      .maybeSingle()

    diagnostics.step3_customer_portal = {
      customer_name: customerBefore?.name,
      portal_token_before: customerBefore?.portal_token ? 'present' : 'missing',
      portal_token_after: customerAfter?.portal_token ? 'present' : 'missing',
      portal_enabled: customerAfter?.portal_enabled,
      passed: !!customerAfter?.portal_token && !!customerAfter?.portal_enabled,
    }

    // Steg 4 — portal-URL byggd korrekt
    const expectedFormat = /\/portal\/[a-f0-9-]{36}\?tab=quotes$/
    diagnostics.step4_portal_url = {
      url: portalUrl,
      format_ok: portalUrl ? expectedFormat.test(portalUrl) : false,
      passed: !!portalUrl && (portalUrl ? expectedFormat.test(portalUrl) : false),
    }

    // Steg 5 — public quote endpoint inkluderar portal_token så legacy-sidan kan redirecta
    let publicEndpointOk = false
    let publicReturnsPortalToken = false
    if (quote.sign_token) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
      try {
        const res = await fetch(`${appUrl}/api/quotes/public/${quote.sign_token}`)
        if (res.ok) {
          publicEndpointOk = true
          const data = await res.json()
          publicReturnsPortalToken = !!data?.quote?.customer?.portal_token
        }
      } catch { /* nät-fel */ }
    }

    diagnostics.step5_public_endpoint = {
      sign_token_present: !!quote.sign_token,
      endpoint_responds: publicEndpointOk,
      returns_portal_token: publicReturnsPortalToken,
      passed: publicEndpointOk && publicReturnsPortalToken,
    }

    const allPassed =
      !!quote.sign_token &&
      !!quote.customer_id &&
      (diagnostics.step3_customer_portal as any).passed &&
      (diagnostics.step4_portal_url as any).passed &&
      (diagnostics.step5_public_endpoint as any).passed

    return NextResponse.json({
      ok: allPassed,
      summary: allPassed
        ? 'Offertflödet via kundportalen fungerar ✓'
        : 'Något steg misslyckades — se diagnostik',
      quote_id: quote.quote_id,
      portal_url: portalUrl,
      diagnostics,
    })
  } catch (error: any) {
    console.error('[verify-quote-flow] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
