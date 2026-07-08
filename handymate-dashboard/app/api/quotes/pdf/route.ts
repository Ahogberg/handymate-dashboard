import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { selectTemplate, buildQuoteTemplateData } from '@/lib/quote-templates'

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // TD-71 (2026-05-22): rollskydd. Offert-PDF visar priser
    // — kräver see_financials-permission. Owner/admin auto.
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'see_financials')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const { quoteId } = await request.json()

    const { data: quote } = await supabase
      .from('quotes')
      .select('*')
      .eq('quote_id', quoteId)
      .eq('business_id', business.business_id)
      .single()

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    const { data: quoteItems } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', quoteId)
      .order('sort_order', { ascending: true })
    quote.quote_items = quoteItems || []

    if (quote.customer_id) {
      const { data: customer } = await supabase
        .from('customer')
        .select('*')
        .eq('customer_id', quote.customer_id)
        .single()
      quote.customer = customer
    }

    // Resolva deal-nummer om offerten är kopplad till ett ärende
    if (quote.deal_id) {
      const { data: deal } = await supabase
        .from('deal')
        .select('deal_number')
        .eq('id', quote.deal_id)
        .maybeSingle()
      if (deal?.deal_number != null) quote.deal_number = deal.deal_number
    }

    const { data: config } = await supabase
      .from('business_config')
      .select('business_name, accent_color, logo_url, bankgiro, plusgiro, default_quote_terms, swish_number, org_number, f_skatt_registered, contact_email, phone_number, address, service_area, contact_name, website, quote_template_style')
      .eq('business_id', business.business_id)
      .single()

    const templateData = buildQuoteTemplateData(quote, business, config)
    // Per-quote override → fallback till business default
    const renderFn = selectTemplate(quote.template_style || config?.quote_template_style)
    const html = renderFn(templateData)

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="Offert-${quote.quote_number || quoteId}.html"`,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('PDF generation error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getServerSupabase()
    const quoteId = request.nextUrl.searchParams.get('id')
    const signToken = request.nextUrl.searchParams.get('token')

    // Stöd för publik åtkomst via sign_token (signeringssidan)
    let quote: any = null

    if (signToken) {
      const { data } = await supabase
        .from('quotes')
        .select('*')
        .eq('sign_token', signToken)
        .single()
      quote = data
    } else if (quoteId) {
      // Auth krävs för id-baserad åtkomst
      const business = await getAuthenticatedBusiness(request)
      if (!business) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // TD-71 (2026-05-22): rollskydd för pris-data. Offert-PDF visar
      // priser — kräver see_financials-permission. Publik ?token=-vägen
      // ovan är medveten kund-vy och lämnas orörd.
      const currentUser = await getCurrentUser(request)
      if (!currentUser || !hasPermission(currentUser, 'see_financials')) {
        return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
      }

      const { data } = await supabase
        .from('quotes')
        .select('*')
        .eq('quote_id', quoteId)
        .eq('business_id', business.business_id)
        .single()
      quote = data
    } else {
      return NextResponse.json({ error: 'Missing quote ID or token' }, { status: 400 })
    }

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    const { data: quoteItems } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', quote.quote_id)
      .order('sort_order', { ascending: true })
    quote.quote_items = quoteItems || []

    if (quote.customer_id) {
      const { data: customer } = await supabase
        .from('customer')
        .select('*')
        .eq('customer_id', quote.customer_id)
        .single()
      quote.customer = customer
    }

    // Resolva deal-nummer om offerten är kopplad till ett ärende
    if (quote.deal_id) {
      const { data: deal } = await supabase
        .from('deal')
        .select('deal_number')
        .eq('id', quote.deal_id)
        .maybeSingle()
      if (deal?.deal_number != null) quote.deal_number = deal.deal_number
    }

    // Hämta business-config (används som business-objekt i PDF-generatorn)
    const { data: bizConfig } = await supabase
      .from('business_config')
      .select('business_name, contact_name, contact_email, phone_number, address, service_area, website, accent_color, logo_url, bankgiro, plusgiro, default_quote_terms, swish_number, org_number, f_skatt_registered, quote_template_style')
      .eq('business_id', quote.business_id)
      .single()

    const templateData = buildQuoteTemplateData(quote, bizConfig, bizConfig)
    // Style-precedence: ?style=... (settings-preview) > quote.template_style > business default
    const styleOverride = request.nextUrl.searchParams.get('style')
    const renderFn = selectTemplate(
      styleOverride || quote.template_style || bizConfig?.quote_template_style,
    )
    const html = renderFn(templateData)

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
