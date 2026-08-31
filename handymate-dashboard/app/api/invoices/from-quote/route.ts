import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { calculateCappedDeduction } from '@/lib/rot-rut-limits'
import { createInvoice } from '@/lib/invoices/create-invoice'
import { mapQuoteItemsToInvoiceItems, rotRutLaborBasis } from '@/lib/invoices/quote-to-invoice-items'
import { getCurrentUser, hasPermission } from '@/lib/permissions'

/**
 * POST - Skapa faktura från offert (eller dry_run för att hämta items)
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rollgrind (2026-08-06, behörighetskontraktet): getAuthenticatedBusiness
    // avgör vilket FÖRETAG anropet gäller — inte vad användaren får se i det.
    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
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
    // Delade mapparen (Prisslingan V2 A1): tillvalsfilter, ??-kopierad
    // labor_amount (ROT-basen), bevarad linked_product_id/article_number,
    // och total-omräkning enbart för 'item'-rader — se
    // lib/invoices/quote-to-invoice-items.ts + dess facit.
    const items = mapQuoteItemsToInvoiceItems(quoteItems)

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

    // Hämta betalningsvillkor (nummer/OCR sköts nu av createInvoice-kärnan)
    const { data: config } = await supabase
      .from('business_config')
      .select('default_payment_days')
      .eq('business_id', business_id)
      .single()

    const dueDays = config?.default_payment_days || 30
    const invoiceDate = new Date()

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
      // Basen från RADERNA (A1): labor_amount ?? radtotal per berättigad rad —
      // nu när mapparen bevarar labor_amount är radbasen sanningen. Legacy-
      // offerter utan radflaggor: fall tillbaka på quotens lagrade
      // arbetskostnad, sist härledning ur avdraget (gamla beteendet).
      const radBas = rotRutLaborBasis(items, quote.rot_rut_type as 'rot' | 'rut')
      const workCost = quote.rot_rut_type === 'rot' ? quote.rot_work_cost : quote.rut_work_cost
      const laborCost = radBas > 0
        ? radBas
        : (workCost || (quote.rot_rut_deduction ? quote.rot_rut_deduction / rate : 0))
      if (laborCost > 0) {
        const capped = await calculateCappedDeduction(
          quote.customer_id,
          business_id,
          quote.rot_rut_type as 'rot' | 'rut',
          laborCost,
          { vatRate },
        )
        rotRutDeduction = capped.deduction
        customerPays = total - rotRutDeduction
      }
    }

    // ETAPP 6a (offert-masterplan.md): gemensam kärna för nummer/OCR/
    // datum/insert/bump — se lib/invoices/create-invoice.ts.
    const { invoice } = await createInvoice(supabase, {
      businessId: business_id,
      customerId: quote.customer_id,
      items,
      subtotal,
      vatRate,
      vatAmount,
      total,
      rotRutType: quote.rot_rut_type || null,
      rotRutDeduction,
      customerPays,
      projectId: linkedProjectId,
      quoteId: quote_id,
      invoiceType: 'standard',
      status: 'draft',
      dueDays,
      invoiceDate,
      personnummer: quote.personnummer || null,
      fastighetsbeteckning: quote.fastighetsbeteckning || null,
      selectClause: `*, customer:customer_id ( customer_id, name, phone_number, email, address_line )`,
    })

    return NextResponse.json({ invoice })

  } catch (error: any) {
    console.error('Create invoice from quote error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
