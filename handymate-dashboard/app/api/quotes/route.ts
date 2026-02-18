import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET - Lista offerter för ett företag
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id
    const status = request.nextUrl.searchParams.get('status')
    const customerId = request.nextUrl.searchParams.get('customerId')
    const search = request.nextUrl.searchParams.get('search')
    const quoteId = request.nextUrl.searchParams.get('quoteId')

    // Single quote fetch
    if (quoteId) {
      const { data: quote, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('quote_id', quoteId)
        .eq('business_id', businessId)
        .single()

      if (error || !quote) {
        return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
      }

      // Fetch customer separately
      let customer = null
      if (quote.customer_id) {
        const { data } = await supabase
          .from('customer')
          .select('customer_id, name, phone_number, email, address_line, personal_number, property_designation')
          .eq('customer_id', quote.customer_id)
          .single()
        customer = data
      }

      return NextResponse.json({ quote: { ...quote, customer } })
    }

    // List quotes
    let query = supabase
      .from('quotes')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }
    if (customerId) {
      query = query.eq('customer_id', customerId)
    }
    if (search) {
      query = query.ilike('title', `%${search}%`)
    }

    const { data: quotes, error } = await query
    if (error) throw error

    // Fetch customer data separately (no FK)
    const customerIds = Array.from(new Set((quotes || []).map((q: any) => q.customer_id).filter(Boolean)))
    const customerMap: Record<string, any> = {}
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from('customer')
        .select('customer_id, name, phone_number, email, address_line')
        .in('customer_id', customerIds)
      for (const c of (customers || [])) {
        customerMap[c.customer_id] = c
      }
    }

    const enrichedQuotes = (quotes || []).map((q: any) => ({
      ...q,
      customer: q.customer_id ? customerMap[q.customer_id] || null : null,
    }))

    return NextResponse.json({ quotes: enrichedQuotes })
  } catch (error: any) {
    console.error('Get quotes error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa ny offert
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const businessId = business.business_id

    // Duplicate from existing quote
    if (body.duplicate_from) {
      const { data: source, error: srcErr } = await supabase
        .from('quotes')
        .select('*')
        .eq('quote_id', body.duplicate_from)
        .eq('business_id', businessId)
        .single()

      if (srcErr || !source) {
        return NextResponse.json({ error: 'Source quote not found' }, { status: 404 })
      }

      const newId = 'quote_' + Math.random().toString(36).substr(2, 9)
      const quoteNumber = await generateQuoteNumber(supabase, businessId)
      const validUntil = new Date()
      validUntil.setDate(validUntil.getDate() + 30)

      const dupData: Record<string, any> = {
        quote_id: newId,
        business_id: businessId,
        customer_id: source.customer_id,
        quote_number: quoteNumber,
        status: 'draft',
        title: source.title ? source.title + ' (kopia)' : 'Kopia',
        description: source.description,
        items: source.items,
        labor_total: source.labor_total,
        material_total: source.material_total,
        subtotal: source.subtotal,
        discount_percent: source.discount_percent,
        discount_amount: source.discount_amount,
        vat_rate: source.vat_rate,
        vat_amount: source.vat_amount,
        total: source.total,
        rot_rut_type: source.rot_rut_type,
        rot_rut_eligible: source.rot_rut_eligible,
        rot_rut_deduction: source.rot_rut_deduction,
        customer_pays: source.customer_pays,
        terms: source.terms,
        images: source.images,
        valid_until: validUntil.toISOString().split('T')[0],
        duplicated_from: body.duplicate_from,
        ai_generated: source.ai_generated,
      }

      // Only include ROT/RUT personal fields when they have values
      if (source.personnummer) dupData.personnummer = source.personnummer
      if (source.fastighetsbeteckning) dupData.fastighetsbeteckning = source.fastighetsbeteckning

      const { data: newQuote, error: dupErr } = await supabase
        .from('quotes')
        .insert(dupData)
        .select()
        .single()

      if (dupErr) throw dupErr
      return NextResponse.json({ quote: newQuote })
    }

    // Normal creation
    const items = body.items || []
    const vatRate = body.vat_rate ?? 25
    const discountPercent = body.discount_percent ?? 0

    // Server-side calculations
    const laborTotal = items.filter((i: any) => i.type === 'labor').reduce((s: number, i: any) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0)
    const materialTotal = items.filter((i: any) => i.type === 'material').reduce((s: number, i: any) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0)
    const serviceTotal = items.filter((i: any) => i.type === 'service').reduce((s: number, i: any) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0)
    const subtotal = laborTotal + materialTotal + serviceTotal
    const discountAmount = subtotal * (discountPercent / 100)
    const afterDiscount = subtotal - discountAmount
    const vatAmount = afterDiscount * (vatRate / 100)
    const total = afterDiscount + vatAmount

    // ROT/RUT
    let rotRutEligible = 0
    let rotRutDeduction = 0
    let customerPays = total
    if (body.rot_rut_type) {
      rotRutEligible = laborTotal
      const rate = body.rot_rut_type === 'rot' ? 0.30 : 0.50
      const maxDeduction = body.rot_rut_type === 'rot' ? 50000 : 75000
      rotRutDeduction = Math.min(rotRutEligible * rate, maxDeduction)
      customerPays = total - rotRutDeduction
    }

    const quoteId = 'quote_' + Math.random().toString(36).substr(2, 9)
    const quoteNumber = await generateQuoteNumber(supabase, businessId)
    const validDays = body.valid_days ?? 30
    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + validDays)

    // Ensure items have calculated totals
    const processedItems = items.map((i: any) => ({
      ...i,
      total: (i.quantity || 0) * (i.unit_price || 0)
    }))

    const insertData: Record<string, any> = {
      quote_id: quoteId,
      business_id: businessId,
      customer_id: body.customer_id || null,
      quote_number: quoteNumber,
      status: body.status || 'draft',
      title: body.title || '',
      description: body.description || null,
      items: processedItems,
      labor_total: laborTotal,
      material_total: materialTotal,
      subtotal,
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      total,
      rot_rut_type: body.rot_rut_type || null,
      rot_rut_eligible: rotRutEligible,
      rot_rut_deduction: rotRutDeduction,
      customer_pays: customerPays,
      terms: body.terms || {},
      images: body.images || [],
      valid_until: validUntil.toISOString().split('T')[0],
      sent_at: body.status === 'sent' ? new Date().toISOString() : null,
      ai_generated: body.ai_generated || false,
      ai_confidence: body.ai_confidence || null,
      source_transcript: body.source_transcript || null,
      template_id: body.template_id || null,
    }

    // Only include ROT/RUT personal fields when they have values
    // (columns may not exist if migration hasn't been run yet)
    if (body.personnummer) insertData.personnummer = body.personnummer
    if (body.fastighetsbeteckning) insertData.fastighetsbeteckning = body.fastighetsbeteckning

    const { data: quote, error: insertError } = await supabase
      .from('quotes')
      .insert(insertData)
      .select()
      .single()

    if (insertError) {
      console.error('Quote insert error:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ quote })
  } catch (error: any) {
    console.error('Create quote error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera offert
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { quote_id } = body

    if (!quote_id) {
      return NextResponse.json({ error: 'Missing quote_id' }, { status: 400 })
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from('quotes')
      .select('quote_id, business_id, status')
      .eq('quote_id', quote_id)
      .eq('business_id', business.business_id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

    // Update provided fields
    if (body.customer_id !== undefined) updates.customer_id = body.customer_id
    if (body.title !== undefined) updates.title = body.title
    if (body.description !== undefined) updates.description = body.description
    // Only include ROT/RUT personal fields when explicitly provided with values
    if (body.personnummer !== undefined && body.personnummer !== null) updates.personnummer = body.personnummer
    if (body.fastighetsbeteckning !== undefined && body.fastighetsbeteckning !== null) updates.fastighetsbeteckning = body.fastighetsbeteckning
    if (body.terms !== undefined) updates.terms = body.terms
    if (body.images !== undefined) updates.images = body.images
    if (body.status !== undefined) {
      updates.status = body.status
      if (body.status === 'sent' && !existing.status?.includes('sent')) {
        updates.sent_at = new Date().toISOString()
      }
    }

    // Recalculate totals if items provided
    if (body.items !== undefined) {
      const items = body.items || []
      const vatRate = body.vat_rate ?? 25
      const discountPercent = body.discount_percent ?? 0

      const laborTotal = items.filter((i: any) => i.type === 'labor').reduce((s: number, i: any) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0)
      const materialTotal = items.filter((i: any) => i.type === 'material').reduce((s: number, i: any) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0)
      const serviceTotal = items.filter((i: any) => i.type === 'service').reduce((s: number, i: any) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0)
      const subtotal = laborTotal + materialTotal + serviceTotal
      const discountAmount = subtotal * (discountPercent / 100)
      const afterDiscount = subtotal - discountAmount
      const vatAmount = afterDiscount * (vatRate / 100)
      const total = afterDiscount + vatAmount

      const processedItems = items.map((i: any) => ({
        ...i,
        total: (i.quantity || 0) * (i.unit_price || 0)
      }))

      updates.items = processedItems
      updates.labor_total = laborTotal
      updates.material_total = materialTotal
      updates.subtotal = subtotal
      updates.discount_percent = discountPercent
      updates.discount_amount = discountAmount
      updates.vat_rate = vatRate
      updates.vat_amount = vatAmount
      updates.total = total

      // ROT/RUT
      const rotRutType = body.rot_rut_type !== undefined ? body.rot_rut_type : existing.status // fetch from existing if not provided
      if (body.rot_rut_type !== undefined) updates.rot_rut_type = body.rot_rut_type
      if (body.rot_rut_type) {
        const rotRutEligible = laborTotal
        const rate = body.rot_rut_type === 'rot' ? 0.30 : 0.50
        const maxDeduction = body.rot_rut_type === 'rot' ? 50000 : 75000
        const rotRutDeduction = Math.min(rotRutEligible * rate, maxDeduction)
        updates.rot_rut_eligible = rotRutEligible
        updates.rot_rut_deduction = rotRutDeduction
        updates.customer_pays = total - rotRutDeduction
      } else if (body.rot_rut_type === '' || body.rot_rut_type === null) {
        updates.rot_rut_type = null
        updates.rot_rut_eligible = 0
        updates.rot_rut_deduction = 0
        updates.customer_pays = total
      }
    } else {
      // Only update discount/vat/rot without items change
      if (body.discount_percent !== undefined) updates.discount_percent = body.discount_percent
      if (body.vat_rate !== undefined) updates.vat_rate = body.vat_rate
      if (body.rot_rut_type !== undefined) updates.rot_rut_type = body.rot_rut_type || null
    }

    if (body.valid_days !== undefined) {
      const validUntil = new Date()
      validUntil.setDate(validUntil.getDate() + body.valid_days)
      updates.valid_until = validUntil.toISOString().split('T')[0]
    }

    const { data: quote, error } = await supabase
      .from('quotes')
      .update(updates)
      .eq('quote_id', quote_id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ quote })
  } catch (error: any) {
    console.error('Update quote error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort offert (bara drafts)
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const quoteId = request.nextUrl.searchParams.get('quoteId')

    if (!quoteId) {
      return NextResponse.json({ error: 'Missing quoteId' }, { status: 400 })
    }

    // Check status
    const { data: quote } = await supabase
      .from('quotes')
      .select('status')
      .eq('quote_id', quoteId)
      .eq('business_id', business.business_id)
      .single()

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    const { error } = await supabase
      .from('quotes')
      .delete()
      .eq('quote_id', quoteId)
      .eq('business_id', business.business_id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete quote error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

async function generateQuoteNumber(supabase: any, businessId: string): Promise<string> {
  const year = new Date().getFullYear()
  const { count } = await supabase
    .from('quotes')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .gte('created_at', `${year}-01-01`)

  return `OFF-${year}-${String((count || 0) + 1).padStart(3, '0')}`
}
