import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { generateOCR } from '@/lib/ocr'

/**
 * POST - Skapa kreditfaktura (hel eller delkredit)
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const {
      original_invoice_id,
      credit_type = 'full', // 'full' | 'partial'
      items: partialItems,
      credit_reason,
    } = body
    const business_id = business.business_id

    if (!original_invoice_id) {
      return NextResponse.json({ error: 'Missing original_invoice_id' }, { status: 400 })
    }

    // Hämta originalfaktura
    const { data: original, error: origError } = await supabase
      .from('invoice')
      .select('*')
      .eq('invoice_id', original_invoice_id)
      .eq('business_id', business_id)
      .single()

    if (origError || !original) {
      return NextResponse.json({ error: 'Originalfaktura hittades inte' }, { status: 404 })
    }

    if (original.status === 'credited' || original.status === 'draft' || original.status === 'cancelled') {
      return NextResponse.json({ error: 'Denna faktura kan inte krediteras' }, { status: 400 })
    }

    let creditItems: any[]

    if (credit_type === 'full') {
      // Full kreditering: kopiera alla items, negera belopp
      creditItems = (original.items || []).map((item: any) => ({
        ...item,
        id: 'ii_' + Math.random().toString(36).substr(2, 12),
        total: -Math.abs(item.total || 0),
        unit_price: -Math.abs(item.unit_price || 0),
      }))
    } else {
      // Delkreditering: använd angivna items
      if (!partialItems || partialItems.length === 0) {
        return NextResponse.json({ error: 'Inga rader angivna för delkredit' }, { status: 400 })
      }
      creditItems = partialItems.map((item: any) => ({
        ...item,
        id: item.id || 'ii_' + Math.random().toString(36).substr(2, 12),
        total: -Math.abs(item.total || (item.quantity * item.unit_price) || 0),
        unit_price: -Math.abs(item.unit_price || 0),
      }))
    }

    // Beräkna krediterade totaler
    const subtotal = creditItems.reduce((sum: number, item: any) => sum + item.total, 0)
    const vatRate = original.vat_rate || 25
    const vatAmount = subtotal * (vatRate / 100)
    const total = subtotal + vatAmount

    // Generera kreditfakturanummer
    const year = new Date().getFullYear()
    const { count } = await supabase
      .from('invoice')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business_id)
      .eq('invoice_type', 'credit')
      .gte('created_at', `${year}-01-01`)

    const creditNumber = `KF-${year}-${String((count || 0) + 1).padStart(3, '0')}`
    const ocrNumber = generateOCR(creditNumber.replace(/\D/g, '') || String((count || 0) + 1))
    const invoiceDate = new Date()

    // ROT/RUT: negera avdrag proportionellt
    let rotRutDeduction = 0
    let customerPays = total
    if (original.rot_rut_deduction && original.total) {
      if (credit_type === 'full') {
        rotRutDeduction = -Math.abs(original.rot_rut_deduction)
      } else {
        // Proportionell negering
        const proportion = Math.abs(total) / Math.abs(original.total)
        rotRutDeduction = -Math.abs(Math.round(original.rot_rut_deduction * proportion))
      }
      customerPays = total - rotRutDeduction
    }

    const { data: creditNote, error: creditError } = await supabase
      .from('invoice')
      .insert({
        business_id,
        customer_id: original.customer_id,
        invoice_number: creditNumber,
        invoice_type: 'credit',
        status: 'sent',
        items: creditItems,
        subtotal,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total,
        rot_rut_type: original.rot_rut_type,
        rot_rut_deduction: rotRutDeduction,
        customer_pays: customerPays,
        personnummer: original.personnummer,
        fastighetsbeteckning: original.fastighetsbeteckning,
        invoice_date: invoiceDate.toISOString().split('T')[0],
        due_date: invoiceDate.toISOString().split('T')[0],
        is_credit_note: true,
        original_invoice_id,
        credit_for_invoice_id: original_invoice_id,
        credit_reason: credit_reason || null,
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

    if (creditError) throw creditError

    // Markera originalfaktura som krediterad (only if full credit)
    if (credit_type === 'full') {
      await supabase
        .from('invoice')
        .update({ status: 'credited' })
        .eq('invoice_id', original_invoice_id)
        .eq('business_id', business_id)
    }

    return NextResponse.json({ invoice: creditNote })

  } catch (error: any) {
    console.error('Create credit note error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
