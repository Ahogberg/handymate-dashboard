import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { selectTemplate, buildQuoteTemplateData } from '@/lib/quote-templates'

/**
 * POST /api/quotes/preview-html
 * Renderar samma HTML som /api/quotes/pdf men från form-data utan att spara
 * något i DB. Används för live-förhandsgranskning på quote-skapande/edit-sidan
 * så hantverkaren ser slutdesignen (Modern/Premium/Friendly) i realtid.
 *
 * Body: {
 *   quote: <quote-fält i samma form som DB-raden, ev. utan quote_id>,
 *   quote_items: <quote_items-array>,
 *   customer_id?: string,        // hämtar customer-data om satt
 *   deal_id?: string,            // hämtar deal_number om satt
 *   template_style?: 'modern' | 'premium' | 'friendly',
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    const quote: Record<string, any> = body.quote || {}
    quote.business_id = business.business_id
    quote.quote_items = body.quote_items || []

    // Säkra fallback-fält som mallen förväntar sig
    if (!quote.created_at) quote.created_at = new Date().toISOString()
    if (!quote.quote_number) quote.quote_number = quote.quote_number ?? 'PREVIEW'

    // Hämta kund om customer_id finns men customer-objektet saknas
    if (body.customer_id && !quote.customer) {
      const { data: customer } = await supabase
        .from('customer')
        .select('*')
        .eq('customer_id', body.customer_id)
        .maybeSingle()
      if (customer) quote.customer = customer
    }

    // Hämta deal_number om deal_id finns
    if (body.deal_id) {
      const { data: deal } = await supabase
        .from('deal')
        .select('deal_number')
        .eq('id', body.deal_id)
        .eq('business_id', business.business_id)
        .maybeSingle()
      if (deal?.deal_number != null) quote.deal_number = deal.deal_number
    }

    // Hämta business-config — samma fält som /api/quotes/pdf
    const { data: config } = await supabase
      .from('business_config')
      .select(
        'business_name, accent_color, logo_url, bankgiro, plusgiro, default_quote_terms, swish_number, org_number, f_skatt_registered, contact_email, phone_number, address, service_area, contact_name, website, quote_template_style'
      )
      .eq('business_id', business.business_id)
      .maybeSingle()

    const templateData = buildQuoteTemplateData(quote, business, config)
    const style = body.template_style || quote.template_style || config?.quote_template_style
    const renderFn = selectTemplate(style)
    const html = renderFn(templateData)

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Förhindra browser-caching mellan preview-anrop
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[quotes/preview-html] Error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
