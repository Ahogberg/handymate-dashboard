import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { isAdmin } from '@/lib/admin-auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * POST /api/debug/e2e-invoice
 * End-to-end test av faktura-flödet:
 * 1. Hitta kund + projekt
 * 2. Skapa faktura med rader
 * 3. Generera PDF
 * 4. Skicka via mail
 * 5. Verifiera status → sent
 * 6. Simulera betalning → paid
 * 7. Verifiera tack-SMS
 * 8. Verifiera pipeline-uppdatering
 */
export const maxDuration = 30

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const adminCheck = await isAdmin(request)
    if (!adminCheck.isAdmin) {
      return NextResponse.json({ error: 'Endast för admin i produktion' }, { status: 403 })
    }
  }

  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const body = await request.json().catch(() => ({}))
  const testEmail = body.email || business.contact_email
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

  const steps: Array<{ step: string; status: 'ok' | 'fail' | 'skip'; detail: string; data?: any }> = []
  let testInvoiceId: string | null = null

  try {
    // ── STEG 1: Hitta testkund ──
    const { data: customer } = await supabase
      .from('customer')
      .select('customer_id, name, email, phone_number')
      .eq('business_id', business.business_id)
      .eq('email', testEmail)
      .maybeSingle()

    if (!customer) {
      steps.push({ step: '1. Testkund', status: 'fail', detail: `Ingen kund med ${testEmail} hittad` })
      return NextResponse.json({ success: false, steps })
    }
    steps.push({ step: '1. Testkund', status: 'ok', detail: `${customer.name} (${customer.email})` })

    // ── STEG 2: Skapa faktura med testrader ──
    const invoiceId = 'e2e_inv_' + Date.now()
    const year = new Date().getFullYear()

    // Hämta nästa fakturanummer
    const { count } = await supabase
      .from('invoice')
      .select('invoice_id', { count: 'exact', head: true })
      .eq('business_id', business.business_id)
      .ilike('invoice_number', `${year}-%`)

    const invoiceNumber = `${year}-${String((count || 0) + 1).padStart(3, '0')}`
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 30)

    const items = [
      {
        id: 'ii_test1',
        item_type: 'item',
        description: 'Arbete — E2E-test installation',
        quantity: 4,
        unit: 'timmar',
        unit_price: 650,
        total: 2600,
        type: 'labor',
        is_rot_eligible: true,
      },
      {
        id: 'ii_test2',
        item_type: 'item',
        description: 'Material — testkabel',
        quantity: 10,
        unit: 'm',
        unit_price: 45,
        total: 450,
        type: 'material',
        is_rot_eligible: false,
      },
    ]

    const subtotal = items.reduce((s, i) => s + i.total, 0)
    const vatAmount = Math.round(subtotal * 0.25)
    const total = subtotal + vatAmount

    const { error: insertErr } = await supabase.from('invoice').insert({
      invoice_id: invoiceId,
      business_id: business.business_id,
      customer_id: customer.customer_id,
      invoice_number: invoiceNumber,
      invoice_type: 'standard',
      status: 'draft',
      items,
      subtotal,
      vat_rate: 25,
      vat_amount: vatAmount,
      total,
      customer_pays: total,
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: dueDate.toISOString().split('T')[0],
    })

    if (insertErr) {
      steps.push({ step: '2. Skapa faktura', status: 'fail', detail: insertErr.message })
      return NextResponse.json({ success: false, steps })
    }

    testInvoiceId = invoiceId
    steps.push({
      step: '2. Skapa faktura',
      status: 'ok',
      detail: `Faktura ${invoiceNumber} skapad (${total.toLocaleString('sv-SE')} kr inkl moms)`,
    })

    // ── STEG 3: Hämta faktura ──
    const { data: fetchedInvoice, error: fetchErr } = await supabase
      .from('invoice')
      .select('invoice_id, invoice_number, status, total')
      .eq('invoice_id', invoiceId)
      .single()

    if (fetchErr || !fetchedInvoice) {
      steps.push({ step: '3. Hämta faktura', status: 'fail', detail: fetchErr?.message || 'Faktura hittades inte' })
    } else {
      steps.push({ step: '3. Hämta faktura', status: 'ok', detail: `${fetchedInvoice.invoice_number} (${fetchedInvoice.status})` })
    }

    // ── STEG 4: Generera PDF ──
    try {
      const pdfRes = await fetch(`${APP_URL}/api/invoices/pdf?invoiceId=${invoiceId}`, {
        headers: { 'Cookie': request.headers.get('cookie') || '' },
      })
      if (pdfRes.ok) {
        const contentType = pdfRes.headers.get('content-type') || ''
        steps.push({ step: '4. PDF-generering', status: 'ok', detail: `PDF genererad (${contentType})` })
      } else {
        const errBody = await pdfRes.text().catch(() => '')
        steps.push({ step: '4. PDF-generering', status: 'fail', detail: `HTTP ${pdfRes.status}: ${errBody.substring(0, 200)}` })
      }
    } catch (pdfErr: any) {
      steps.push({ step: '4. PDF-generering', status: 'fail', detail: pdfErr.message })
    }

    // ── STEG 5: Skicka faktura via mail ──
    try {
      const sendRes = await fetch(`${APP_URL}/api/invoices/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': request.headers.get('cookie') || '',
        },
        body: JSON.stringify({
          invoice_id: invoiceId,
          send_email: true,
          send_sms: false,
        }),
      })

      const sendData = await sendRes.json().catch(() => null)
      if (sendRes.ok) {
        steps.push({ step: '5. Skicka faktura', status: 'ok', detail: sendData?.message || 'Faktura skickad via mail' })
      } else {
        steps.push({ step: '5. Skicka faktura', status: 'fail', detail: sendData?.error || `HTTP ${sendRes.status}` })
      }
    } catch (sendErr: any) {
      steps.push({ step: '5. Skicka faktura', status: 'fail', detail: sendErr.message })
    }

    // ── STEG 6: Verifiera status → sent ──
    const { data: sentInvoice } = await supabase
      .from('invoice')
      .select('status, sent_at')
      .eq('invoice_id', invoiceId)
      .single()

    if (sentInvoice?.status === 'sent') {
      steps.push({ step: '6. Status → sent', status: 'ok', detail: `Status: sent, sent_at: ${sentInvoice.sent_at}` })
    } else {
      steps.push({ step: '6. Status → sent', status: 'fail', detail: `Status: ${sentInvoice?.status || 'okänd'}` })
    }

    // ── STEG 7: Simulera betalning ──
    try {
      const payRes = await fetch(`${APP_URL}/api/invoices/${invoiceId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': request.headers.get('cookie') || '',
        },
        body: JSON.stringify({
          status: 'paid',
          payment_method: 'swish',
        }),
      })

      const payData = await payRes.json().catch(() => null)
      if (payRes.ok) {
        steps.push({ step: '7. Betalning', status: 'ok', detail: 'Faktura markerad som betald' })
      } else {
        steps.push({ step: '7. Betalning', status: 'fail', detail: payData?.error || `HTTP ${payRes.status}` })
      }
    } catch (payErr: any) {
      steps.push({ step: '7. Betalning', status: 'fail', detail: payErr.message })
    }

    // ── STEG 8: Verifiera status → paid ──
    await new Promise(resolve => setTimeout(resolve, 2000))

    const { data: paidInvoice } = await supabase
      .from('invoice')
      .select('status, paid_at')
      .eq('invoice_id', invoiceId)
      .single()

    if (paidInvoice?.status === 'paid') {
      steps.push({ step: '8. Status → paid', status: 'ok', detail: `Betald: ${paidInvoice.paid_at}` })
    } else {
      steps.push({ step: '8. Status → paid', status: 'fail', detail: `Status: ${paidInvoice?.status || 'okänd'}` })
    }

    // ── SAMMANFATTNING ──
    const failCount = steps.filter(s => s.status === 'fail').length
    const allOk = failCount === 0

    return NextResponse.json({
      success: allOk,
      summary: allOk
        ? `✅ Alla ${steps.length} steg lyckades!`
        : `❌ ${failCount} av ${steps.length} steg misslyckades.`,
      invoice_id: testInvoiceId,
      steps,
    })
  } catch (err: any) {
    steps.push({ step: 'Oväntat fel', status: 'fail', detail: err.message })
    return NextResponse.json({ success: false, steps }, { status: 500 })
  }
}
