import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { generateOCR } from '@/lib/ocr'
import { calculateCappedDeduction } from '@/lib/rot-rut-limits'

/**
 * POST - Skapa faktura från offert (eller dry_run för att hämta items)
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { quote_id, dry_run = false } = body
    const business_id = business.business_id

    if (!quote_id) {
      return NextResponse.json({ error: 'Missing quote_id' }, { status: 400 })
    }

    // Hämta offert
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*')
      .eq('quote_id', quote_id)
      .eq('business_id', business_id)
      .single()

    if (quoteError || !quote) {
      return NextResponse.json({ error: 'Offert hittades inte' }, { status: 404 })
    }

    // Mappa QuoteItem → InvoiceItem. Moderna offerter lagrar rader i
    // quote_items-tabellen och sätter JSONB items:[] — läs därför strukturerade
    // rader när JSONB är tom, annars blir fakturan TOM (0 kr, 0 ROT).
    let quoteItems = quote.items || []
    if (!quoteItems.length) {
      const { data: structured } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', quote_id)
        .order('sort_order', { ascending: true })
      if (structured && structured.length) quoteItems = structured
    }
    const items = quoteItems.map((item: any, i: number) => ({
      id: 'ii_' + Math.random().toString(36).substr(2, 12),
      item_type: item.item_type || 'item',
      group_name: item.group_name || undefined,
      description: item.description || item.name || '',
      quantity: item.quantity || 1,
      unit: item.unit || 'st',
      unit_price: item.unit_price || item.price || 0,
      // Endast riktiga 'item'-rader räknas om (antal × á-pris). Delsummor
      // (quantity 0, lagrad total = summan) nollades av omräkningen, och
      // rabatter (lagrad NEGATIV total) fick fel tecken i fakturans JSONB.
      // Rubrik/text/delsumma/rabatt behåller därför sin lagrade total.
      total: (item.item_type || 'item') === 'item'
        ? (item.quantity || 1) * (item.unit_price || item.price || 0)
        : (item.total || 0),
      type: item.type,
      is_rot_eligible: item.is_rot_eligible || false,
      is_rut_eligible: item.is_rut_eligible || false,
      sort_order: item.sort_order ?? i,
      cost_price: item.cost_price,
      article_number: item.article_number,
    }))

    // Dry run: returnera bara items utan att skapa faktura
    if (dry_run) {
      return NextResponse.json({
        items,
        customer_id: quote.customer_id,
        rot_rut_type: quote.rot_rut_type,
        personnummer: quote.personnummer,
        fastighetsbeteckning: quote.fastighetsbeteckning,
        vat_rate: quote.vat_rate || 25,
      })
    }

    // Skapa faktura via huvudrutten
    const regularItems = items.filter((i: any) => (i.item_type || 'item') === 'item')
    const discountItems = items.filter((i: any) => i.item_type === 'discount')
    const subtotal = regularItems.reduce((sum: number, item: any) => sum + item.total, 0)
      - discountItems.reduce((sum: number, item: any) => sum + Math.abs(item.total || 0), 0)
    const vatRate = quote.vat_rate || 25
    const vatAmount = subtotal * (vatRate / 100)
    const total = subtotal + vatAmount

    // Hämta prefix + nummer
    const { data: config } = await supabase
      .from('business_config')
      .select('invoice_prefix, next_invoice_number, default_payment_days')
      .eq('business_id', business_id)
      .single()

    const prefix = config?.invoice_prefix || 'FV'
    const nextNum = config?.next_invoice_number || 1
    const year = new Date().getFullYear()
    const invoiceNumber = `${prefix}-${year}-${String(nextNum).padStart(3, '0')}`
    const ocrNumber = generateOCR(String(nextNum))
    const dueDays = config?.default_payment_days || 30
    const invoiceDate = new Date()
    const dueDate = new Date(invoiceDate)
    dueDate.setDate(dueDate.getDate() + dueDays)

    // Backlinka project_id via project.quote_id (Etapp 1, v52). Om en
    // offert har blivit projekt kopplar vi fakturan dit direkt. Om flera
    // projekt delar samma quote_id (TD-57 race condition) tar vi första
    // och loggar warning så Lars-marginal inte fail:ar tyst.
    const { data: projectMatches } = await supabase
      .from('project')
      .select('project_id, created_at')
      .eq('quote_id', quote_id)
      .eq('business_id', business_id)
      .order('created_at', { ascending: true })
      .limit(2)
    let linkedProjectId: string | null = null
    if (projectMatches && projectMatches.length > 0) {
      linkedProjectId = projectMatches[0].project_id
      if (projectMatches.length > 1) {
        console.warn('[from-quote] flera projekt har samma quote_id', {
          quote_id,
          chosen: linkedProjectId,
          alternatives: projectMatches.slice(1).map(p => p.project_id),
        })
      }
    }

    // ROT/RUT med årstaksvalidering — kopiera INTE quote-värdet rakt av (det
    // kringgick kundens årstak och kunde ge för högt avdrag som Skatteverket
    // nekar). Räkna om mot kundens återstående utrymme.
    let rotRutDeduction = quote.rot_rut_deduction || 0
    let customerPays = quote.customer_pays || total
    if (quote.rot_rut_type && quote.customer_id) {
      const rate = quote.rot_rut_type === 'rot' ? 0.30 : 0.50
      const workCost = quote.rot_rut_type === 'rot' ? quote.rot_work_cost : quote.rut_work_cost
      const laborCost = workCost || (quote.rot_rut_deduction ? quote.rot_rut_deduction / rate : 0)
      if (laborCost > 0) {
        const capped = await calculateCappedDeduction(
          quote.customer_id,
          business_id,
          quote.rot_rut_type as 'rot' | 'rut',
          laborCost,
        )
        rotRutDeduction = capped.deduction
        customerPays = total - rotRutDeduction
      }
    }

    const { data: invoice, error: insertError } = await supabase
      .from('invoice')
      .insert({
        business_id,
        customer_id: quote.customer_id,
        quote_id,
        project_id: linkedProjectId,
        invoice_number: invoiceNumber,
        invoice_type: 'standard',
        status: 'draft',
        items,
        subtotal,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total,
        rot_rut_type: quote.rot_rut_type || null,
        rot_rut_deduction: rotRutDeduction,
        customer_pays: customerPays,
        personnummer: quote.personnummer || null,
        fastighetsbeteckning: quote.fastighetsbeteckning || null,
        invoice_date: invoiceDate.toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        ocr_number: ocrNumber,
      })
      .select(`
        *,
        customer:customer_id (
          customer_id,
          name,
          phone_number,
          email,
          address_line
        )
      `)
      .single()

    if (insertError) throw insertError

    // Increment next number
    await supabase
      .from('business_config')
      .update({ next_invoice_number: nextNum + 1 })
      .eq('business_id', business_id)

    return NextResponse.json({ invoice })

  } catch (error: any) {
    console.error('Create invoice from quote error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
