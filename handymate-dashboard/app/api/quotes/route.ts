import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { calculateQuoteTotals } from '@/lib/quote-calculations'
import type { QuoteItem } from '@/lib/types/quote'

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

      // Fetch structured items from quote_items table
      const { data: quoteItems } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', quoteId)
        .order('sort_order', { ascending: true })

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

      return NextResponse.json({
        quote: {
          ...quote,
          quote_items: quoteItems || [],
          customer,
        }
      })
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

    // Permission check: kräver create_invoices (offerter leder till fakturor)
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
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
        // New fields
        introduction_text: source.introduction_text,
        conclusion_text: source.conclusion_text,
        not_included: source.not_included,
        ata_terms: source.ata_terms,
        payment_terms_text: source.payment_terms_text,
        payment_plan: source.payment_plan,
        reference_person: source.reference_person,
        customer_reference: source.customer_reference,
        project_address: source.project_address,
        detail_level: source.detail_level,
        show_unit_prices: source.show_unit_prices,
        show_quantities: source.show_quantities,
        rot_work_cost: source.rot_work_cost,
        rot_deduction: source.rot_deduction,
        rot_customer_pays: source.rot_customer_pays,
        rut_work_cost: source.rut_work_cost,
        rut_deduction: source.rut_deduction,
        rut_customer_pays: source.rut_customer_pays,
      }

      if (source.personnummer) dupData.personnummer = source.personnummer
      if (source.fastighetsbeteckning) dupData.fastighetsbeteckning = source.fastighetsbeteckning

      const { data: newQuote, error: dupErr } = await supabase
        .from('quotes')
        .insert(dupData)
        .select()
        .single()

      if (dupErr) throw dupErr

      // Duplicate quote_items
      const { data: sourceItems } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', body.duplicate_from)
        .order('sort_order')

      if (sourceItems && sourceItems.length > 0) {
        const dupItems = sourceItems.map((item: any) => ({
          ...item,
          id: 'qi_' + Math.random().toString(36).substr(2, 12),
          quote_id: newId,
        }))
        await supabase.from('quote_items').insert(dupItems)
      }

      return NextResponse.json({ quote: newQuote })
    }

    // New quote creation - support both legacy items and structured quote_items
    const quoteId = 'quote_' + Math.random().toString(36).substr(2, 9)
    const quoteNumber = await generateQuoteNumber(supabase, businessId)
    const validDays = body.valid_days ?? 30
    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + validDays)

    const structuredItems: QuoteItem[] = body.quote_items || []
    const legacyItems = body.items || []
    const vatRate = body.vat_rate ?? 25
    const discountPercent = body.discount_percent ?? 0

    let laborTotal = 0, materialTotal = 0, subtotal = 0, discountAmount = 0
    let vatAmount = 0, total = 0
    let rotWorkCost = 0, rotDeduction = 0, rotCustomerPays = 0
    let rutWorkCost = 0, rutDeduction = 0, rutCustomerPays = 0
    let rotRutEligible = 0, rotRutDeduction = 0, customerPays = 0

    if (structuredItems.length > 0) {
      // Use new calculation engine
      const totals = calculateQuoteTotals(structuredItems, discountPercent, vatRate)
      laborTotal = totals.laborTotal
      materialTotal = totals.materialTotal
      subtotal = totals.subtotal
      discountAmount = totals.discountAmount
      vatAmount = totals.vat
      total = totals.total
      rotWorkCost = totals.rotWorkCost
      rotDeduction = totals.rotDeduction
      rotCustomerPays = totals.rotCustomerPays
      rutWorkCost = totals.rutWorkCost
      rutDeduction = totals.rutDeduction
      rutCustomerPays = totals.rutCustomerPays
      // Legacy compat
      rotRutEligible = rotWorkCost + rutWorkCost
      rotRutDeduction = rotDeduction + rutDeduction
      customerPays = (rotDeduction > 0 || rutDeduction > 0) ? total - rotRutDeduction : total
    } else if (legacyItems.length > 0) {
      // Legacy calculation
      laborTotal = legacyItems.filter((i: any) => i.type === 'labor').reduce((s: number, i: any) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0)
      materialTotal = legacyItems.filter((i: any) => i.type === 'material').reduce((s: number, i: any) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0)
      const serviceTotal = legacyItems.filter((i: any) => i.type === 'service').reduce((s: number, i: any) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0)
      subtotal = laborTotal + materialTotal + serviceTotal
      discountAmount = subtotal * (discountPercent / 100)
      const afterDiscount = subtotal - discountAmount
      vatAmount = afterDiscount * (vatRate / 100)
      total = afterDiscount + vatAmount

      if (body.rot_rut_type) {
        rotRutEligible = laborTotal
        const rate = body.rot_rut_type === 'rot' ? 0.30 : 0.50
        const maxDed = body.rot_rut_type === 'rot' ? 50000 : 75000
        rotRutDeduction = Math.min(rotRutEligible * rate, maxDed)
        customerPays = total - rotRutDeduction
      } else {
        customerPays = total
      }
    }

    const processedLegacyItems = legacyItems.map((i: any) => ({
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
      items: structuredItems.length > 0 ? [] : processedLegacyItems,
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
      // New fields
      introduction_text: body.introduction_text || null,
      conclusion_text: body.conclusion_text || null,
      not_included: body.not_included || null,
      ata_terms: body.ata_terms || null,
      payment_terms_text: body.payment_terms_text || null,
      payment_plan: body.payment_plan || [],
      reference_person: body.reference_person || null,
      customer_reference: body.customer_reference || null,
      project_address: body.project_address || null,
      detail_level: body.detail_level || 'detailed',
      show_unit_prices: body.show_unit_prices ?? true,
      show_quantities: body.show_quantities ?? true,
      rot_work_cost: rotWorkCost || null,
      rot_deduction: rotDeduction || null,
      rot_customer_pays: rotCustomerPays || null,
      rut_work_cost: rutWorkCost || null,
      rut_deduction: rutDeduction || null,
      rut_customer_pays: rutCustomerPays || null,
    }

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

    // Save structured items to quote_items table
    if (structuredItems.length > 0) {
      const itemInserts = structuredItems.map((item, idx) => ({
        id: item.id || ('qi_' + Math.random().toString(36).substr(2, 12)),
        quote_id: quoteId,
        business_id: businessId,
        item_type: item.item_type,
        group_name: item.group_name || null,
        description: item.description || '',
        quantity: item.quantity || 0,
        unit: item.unit || 'st',
        unit_price: item.unit_price || 0,
        total: item.item_type === 'item' ? (item.quantity || 0) * (item.unit_price || 0) : (item.total || 0),
        cost_price: item.cost_price || null,
        article_number: item.article_number || null,
        is_rot_eligible: item.is_rot_eligible || false,
        is_rut_eligible: item.is_rut_eligible || false,
        sort_order: idx,
      }))

      const { error: itemsError } = await supabase.from('quote_items').insert(itemInserts)
      if (itemsError) console.error('Insert quote_items error:', itemsError)
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

    // Permission check: kräver create_invoices
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { quote_id } = body

    if (!quote_id) {
      return NextResponse.json({ error: 'Missing quote_id' }, { status: 400 })
    }

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

    // Update simple fields
    if (body.customer_id !== undefined) updates.customer_id = body.customer_id
    if (body.title !== undefined) updates.title = body.title
    if (body.description !== undefined) updates.description = body.description
    if (body.personnummer !== undefined && body.personnummer !== null) updates.personnummer = body.personnummer
    if (body.fastighetsbeteckning !== undefined && body.fastighetsbeteckning !== null) updates.fastighetsbeteckning = body.fastighetsbeteckning
    if (body.terms !== undefined) updates.terms = body.terms
    if (body.images !== undefined) updates.images = body.images

    // New text fields
    if (body.introduction_text !== undefined) updates.introduction_text = body.introduction_text
    if (body.conclusion_text !== undefined) updates.conclusion_text = body.conclusion_text
    if (body.not_included !== undefined) updates.not_included = body.not_included
    if (body.ata_terms !== undefined) updates.ata_terms = body.ata_terms
    if (body.payment_terms_text !== undefined) updates.payment_terms_text = body.payment_terms_text
    if (body.payment_plan !== undefined) updates.payment_plan = body.payment_plan
    if (body.reference_person !== undefined) updates.reference_person = body.reference_person
    if (body.customer_reference !== undefined) updates.customer_reference = body.customer_reference
    if (body.project_address !== undefined) updates.project_address = body.project_address
    if (body.detail_level !== undefined) updates.detail_level = body.detail_level
    if (body.show_unit_prices !== undefined) updates.show_unit_prices = body.show_unit_prices
    if (body.show_quantities !== undefined) updates.show_quantities = body.show_quantities

    if (body.status !== undefined) {
      updates.status = body.status
      if (body.status === 'sent' && !existing.status?.includes('sent')) {
        updates.sent_at = new Date().toISOString()
      }
    }

    const structuredItems: QuoteItem[] = body.quote_items || []
    const vatRate = body.vat_rate ?? 25
    const discountPercent = body.discount_percent ?? 0

    // Recalculate from structured items
    if (structuredItems.length > 0) {
      const totals = calculateQuoteTotals(structuredItems, discountPercent, vatRate)

      updates.labor_total = totals.laborTotal
      updates.material_total = totals.materialTotal
      updates.subtotal = totals.subtotal
      updates.discount_percent = discountPercent
      updates.discount_amount = totals.discountAmount
      updates.vat_rate = vatRate
      updates.vat_amount = totals.vat
      updates.total = totals.total
      updates.items = [] // Clear legacy JSONB

      // ROT/RUT new split
      updates.rot_work_cost = totals.rotWorkCost
      updates.rot_deduction = totals.rotDeduction
      updates.rot_customer_pays = totals.rotCustomerPays
      updates.rut_work_cost = totals.rutWorkCost
      updates.rut_deduction = totals.rutDeduction
      updates.rut_customer_pays = totals.rutCustomerPays

      // Legacy compat
      const totalDeduction = totals.rotDeduction + totals.rutDeduction
      if (totals.rotWorkCost > 0 && totals.rutWorkCost > 0) {
        updates.rot_rut_type = 'rot' // both active, prefer rot
      } else if (totals.rotWorkCost > 0) {
        updates.rot_rut_type = 'rot'
      } else if (totals.rutWorkCost > 0) {
        updates.rot_rut_type = 'rut'
      } else if (body.rot_rut_type !== undefined) {
        updates.rot_rut_type = body.rot_rut_type || null
      }
      updates.rot_rut_eligible = totals.rotWorkCost + totals.rutWorkCost
      updates.rot_rut_deduction = totalDeduction
      updates.customer_pays = totalDeduction > 0 ? totals.total - totalDeduction : totals.total

      // Replace quote_items rows
      await supabase.from('quote_items').delete().eq('quote_id', quote_id)
      const itemInserts = structuredItems.map((item, idx) => ({
        id: item.id || ('qi_' + Math.random().toString(36).substr(2, 12)),
        quote_id: quote_id,
        business_id: business.business_id,
        item_type: item.item_type,
        group_name: item.group_name || null,
        description: item.description || '',
        quantity: item.quantity || 0,
        unit: item.unit || 'st',
        unit_price: item.unit_price || 0,
        total: item.item_type === 'item' ? (item.quantity || 0) * (item.unit_price || 0) : (item.total || 0),
        cost_price: item.cost_price || null,
        article_number: item.article_number || null,
        is_rot_eligible: item.is_rot_eligible || false,
        is_rut_eligible: item.is_rut_eligible || false,
        sort_order: idx,
      }))
      if (itemInserts.length > 0) {
        const { error: itemsErr } = await supabase.from('quote_items').insert(itemInserts)
        if (itemsErr) console.error('Update quote_items error:', itemsErr)
      }
    } else if (body.items !== undefined) {
      // Legacy JSONB items recalculation
      const items = body.items || []
      const laborTotal = items.filter((i: any) => i.type === 'labor').reduce((s: number, i: any) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0)
      const materialTotal = items.filter((i: any) => i.type === 'material').reduce((s: number, i: any) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0)
      const serviceTotal = items.filter((i: any) => i.type === 'service').reduce((s: number, i: any) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0)
      const subtotal = laborTotal + materialTotal + serviceTotal
      const discountAmt = subtotal * (discountPercent / 100)
      const afterDiscount = subtotal - discountAmt
      const vatAmount = afterDiscount * (vatRate / 100)
      const total = afterDiscount + vatAmount

      const processedItems = items.map((i: any) => ({ ...i, total: (i.quantity || 0) * (i.unit_price || 0) }))

      updates.items = processedItems
      updates.labor_total = laborTotal
      updates.material_total = materialTotal
      updates.subtotal = subtotal
      updates.discount_percent = discountPercent
      updates.discount_amount = discountAmt
      updates.vat_rate = vatRate
      updates.vat_amount = vatAmount
      updates.total = total

      if (body.rot_rut_type !== undefined) updates.rot_rut_type = body.rot_rut_type
      if (body.rot_rut_type) {
        const rotRutEligible = laborTotal
        const rate = body.rot_rut_type === 'rot' ? 0.30 : 0.50
        const maxDed = body.rot_rut_type === 'rot' ? 50000 : 75000
        const rotRutDeduction = Math.min(rotRutEligible * rate, maxDed)
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
 * DELETE - Ta bort offert
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission check: kräver create_invoices
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const quoteId = request.nextUrl.searchParams.get('quoteId')

    if (!quoteId) {
      return NextResponse.json({ error: 'Missing quoteId' }, { status: 400 })
    }

    const { data: quote } = await supabase
      .from('quotes')
      .select('status')
      .eq('quote_id', quoteId)
      .eq('business_id', business.business_id)
      .single()

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    // quote_items are CASCADE deleted via FK
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
