import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { selectTemplate, buildQuoteTemplateData } from '@/lib/quote-templates'
import { fetchQuoteCreator } from '@/lib/quotes/fetch-quote-creator'
import { generateQuotePDF, type QuotePdfData, type BusinessPdfData } from '@/lib/pdf-generator'

/**
 * Bygg ett PDF-svar (application/pdf, attachment) från en hämtad quote + config
 * + creator. Delas av alla tre ingångar (POST, GET ?token=, GET ?id=).
 * Renderar ALLA rader (arkivkopia) — visningsnivåfiltret gäller bara HTML-vyn.
 */
async function buildQuotePdfResponse(quote: any, config: any, creator: any): Promise<NextResponse> {
  const items: QuotePdfData['items'] = (quote.quote_items || []).map((i: any) => ({
    item_type: i.item_type || 'item',
    description: i.description || '',
    quantity: Number(i.quantity || 0),
    unit: i.unit || 'st',
    unit_price: Number(i.unit_price || 0),
    total: Number(i.total || 0),
    is_rot_eligible: !!i.is_rot_eligible || i.rot_rut_type === 'rot',
    is_rut_eligible: !!i.is_rut_eligible || i.rot_rut_type === 'rut',
    option_selected: i.item_type === 'option' ? i.option_selected === true : undefined,
  }))

  const pdfData: QuotePdfData = {
    quote_number: quote.quote_number || String(quote.quote_id || '').substring(0, 8).toUpperCase(),
    issued_date: quote.issued_date,
    created_at: quote.created_at,
    valid_until: quote.valid_until,
    title: quote.title,
    description: quote.description,
    items,
    subtotal: Number(quote.subtotal || 0),
    vat_rate: Number(quote.vat_rate || 25),
    vat_amount: Number(quote.vat_amount || 0),
    total: Number(quote.total || 0),
    rot_rut_type: quote.rot_rut_type,
    rot_work_cost: quote.rot_work_cost,
    rot_deduction: quote.rot_deduction ?? quote.rot_rut_deduction,
    rot_customer_pays: quote.rot_customer_pays ?? quote.customer_pays,
    rut_work_cost: quote.rut_work_cost,
    rut_deduction: quote.rut_deduction,
    rut_customer_pays: quote.rut_customer_pays ?? quote.customer_pays,
    reference_person: quote.reference_person,
    personnummer: quote.personnummer,
    fastighetsbeteckning: quote.fastighetsbeteckning,
    customer: quote.customer
      ? {
          name: quote.customer.name || 'Kund',
          address_line: quote.customer.address_line || quote.customer.address || null,
          phone_number: quote.customer.phone_number || quote.customer.phone || null,
          email: quote.customer.email || null,
          personnummer: quote.customer.personnummer || null,
        }
      : undefined,
    creator: creator || null,
    introduction_text: quote.introduction_text,
    conclusion_text: quote.conclusion_text,
    not_included: quote.not_included,
    payment_terms_text: quote.payment_terms_text,
  }

  const businessData: BusinessPdfData = {
    business_name: config?.business_name,
    org_number: config?.org_number,
    address: config?.address || config?.service_area,
    contact_name: config?.contact_name,
    contact_email: config?.contact_email,
    contact_phone: config?.phone_number,
    accent_color: config?.accent_color,
    f_skatt_registered: config?.f_skatt_registered,
    bankgiro: config?.bankgiro,
    plusgiro: config?.plusgiro,
    swish_number: config?.swish_number,
  }

  // Hämta loggan server-side och konvertera till base64 så jsPDF kan rita
  // den i PDF-headern. Endast PNG/JPEG stöds av jsPDF addImage — andra
  // format (t.ex. webp/svg) hoppas över. Misslyckas hämtningen på något
  // sätt renderas PDF:en precis som innan — utan logga, aldrig ett fel.
  if (config?.logo_url) {
    try {
      const logoRes = await fetch(config.logo_url)
      if (logoRes.ok) {
        const contentType = logoRes.headers.get('content-type') || ''
        const format: 'PNG' | 'JPEG' | null = contentType.includes('png')
          ? 'PNG'
          : (contentType.includes('jpeg') || contentType.includes('jpg'))
            ? 'JPEG'
            : null
        if (format) {
          const arrayBuffer = await logoRes.arrayBuffer()
          const base64 = Buffer.from(arrayBuffer).toString('base64')
          const mime = format === 'PNG' ? 'image/png' : 'image/jpeg'
          businessData.logo_base64 = `data:${mime};base64,${base64}`
          businessData.logo_format = format
        }
      }
    } catch (err) {
      console.error('[quotes/pdf] Kunde inte hämta logga för PDF:', err)
    }
  }

  const pdfBuffer = generateQuotePDF(pdfData, businessData)
  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Offert-${pdfData.quote_number}.pdf"`,
    },
  })
}

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
    const body = await request.json()
    const { quoteId } = body

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

    // Offert-identitet (v68): avsändaren = offertens skapare. Hämtas via
    // created_by → business_users. Null när kolumnen saknas (gammal offert)
    // → buildQuoteTemplateData faller tillbaka på ägarens business_config.
    const creator = await fetchQuoteCreator(supabase, quote.created_by)

    // format=pdf → riktig nedladdningsbar PDF (query eller body). Default = HTML.
    const format = request.nextUrl.searchParams.get('format') || body?.format || 'html'
    if (format === 'pdf') {
      return buildQuotePdfResponse(quote, config, creator)
    }

    const templateData = buildQuoteTemplateData(quote, business, config, creator)
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

    // Offert-identitet (v68): avsändaren = skaparen (fallback ägaren när null).
    const creator = await fetchQuoteCreator(supabase, quote.created_by)

    // format=pdf → riktig nedladdningsbar PDF. Fungerar för både ?token= (publik,
    // ingen auth — samma som HTML-token-vägen) och ?id= (auth redan gjord ovan).
    const format = request.nextUrl.searchParams.get('format') || 'html'
    if (format === 'pdf') {
      return buildQuotePdfResponse(quote, bizConfig, creator)
    }

    const templateData = buildQuoteTemplateData(quote, bizConfig, bizConfig, creator)
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
