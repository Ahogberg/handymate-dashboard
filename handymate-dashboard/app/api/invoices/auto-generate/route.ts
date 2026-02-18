import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * POST - Auto-generera fakturor från ofakturerade tidrapporter.
 * Grupperar per kund, skapar en faktura per kund.
 *
 * Body (optional):
 *   customer_id: string   - Begränsa till specifik kund
 *   auto_send: boolean     - Skicka fakturan automatiskt via email
 *   max_amount: number     - Max belopp per faktura (säkerhetsgräns)
 *
 * Kan också anropas av cron med CRON_SECRET (för schemalagd auto-fakturering).
 */
export async function POST(request: NextRequest) {
  try {
    let businessId: string
    let autoSend = false
    let maxAmount = 50000

    // Auth: either authenticated user or cron secret
    const authHeader = request.headers.get('authorization')
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`

    if (isCron) {
      // Cron mode: process all businesses with auto_invoice_enabled
      return await processCronAutoInvoice()
    }

    // User mode
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    businessId = business.business_id

    const body = await request.json().catch(() => ({}))
    const customerFilter = body.customer_id
    autoSend = body.auto_send === true
    maxAmount = body.max_amount || 50000

    const result = await generateInvoicesForBusiness({
      businessId,
      customerId: customerFilter,
      autoSend,
      maxAmount,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Auto-generate invoice error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── Core Logic ─────────────────────────────────────────────────

interface GenerateResult {
  success: boolean
  invoices_created: number
  invoices: { invoice_id: string; customer_name: string; total: number; items_count: number }[]
  skipped: { customer_name: string; reason: string }[]
  errors: string[]
}

async function generateInvoicesForBusiness(params: {
  businessId: string
  customerId?: string
  autoSend: boolean
  maxAmount: number
}): Promise<GenerateResult> {
  const supabase = getServerSupabase()
  const result: GenerateResult = {
    success: true,
    invoices_created: 0,
    invoices: [],
    skipped: [],
    errors: [],
  }

  // Get business config (for default payment days, VAT, etc.)
  const { data: business } = await supabase
    .from('business_config')
    .select('business_name, default_payment_days, default_hourly_rate, bankgiro, swish_number, org_number, contact_email')
    .eq('business_id', params.businessId)
    .single()

  if (!business) {
    return { ...result, success: false, errors: ['Business not found'] }
  }

  // Get all unbilled, billable time entries
  let query = supabase
    .from('time_entry')
    .select('*, customer:customer_id(customer_id, name, phone_number, email)')
    .eq('business_id', params.businessId)
    .eq('is_billable', true)
    .is('invoice_id', null)
    .order('work_date', { ascending: true })

  if (params.customerId) {
    query = query.eq('customer_id', params.customerId)
  }

  const { data: timeEntries, error: fetchError } = await query

  if (fetchError) {
    return { ...result, success: false, errors: [fetchError.message] }
  }

  if (!timeEntries || timeEntries.length === 0) {
    return { ...result, skipped: [{ customer_name: 'Alla', reason: 'Inga ofakturerade tidrapporter' }] }
  }

  // Group by customer
  const byCustomer: Record<string, any[]> = {}
  for (const entry of timeEntries) {
    if (!entry.customer_id) {
      result.skipped.push({ customer_name: 'Ingen kund', reason: 'Tidrapport saknar kundkoppling' })
      continue
    }
    if (!byCustomer[entry.customer_id]) byCustomer[entry.customer_id] = []
    byCustomer[entry.customer_id].push(entry)
  }

  // Generate invoice per customer
  for (const customerId of Object.keys(byCustomer)) {
    const entries = byCustomer[customerId]
    try {
      const customer = (entries[0] as any).customer
      const customerName = customer?.name || 'Okänd kund'

      // Build invoice items from time entries
      const items = entries.map((entry: any) => {
        const hours = (entry.duration_minutes || 0) / 60
        const rate = entry.hourly_rate || business.default_hourly_rate || 500
        const total = Math.round(hours * rate * 100) / 100

        return {
          description: entry.description || `Arbete ${new Date(entry.work_date).toLocaleDateString('sv-SE')}`,
          quantity: Math.round(hours * 100) / 100,
          unit: 'timmar',
          unit_price: rate,
          total,
          type: 'labor',
        }
      })

      const subtotal = items.reduce((sum: number, item: any) => sum + item.total, 0)
      const vatRate = 25
      const vat = Math.round(subtotal * (vatRate / 100) * 100) / 100
      const total = subtotal + vat

      // Safety check: max amount
      if (total > params.maxAmount) {
        result.skipped.push({
          customer_name: customerName,
          reason: `Belopp ${total} kr överstiger max ${params.maxAmount} kr`,
        })
        continue
      }

      // Generate invoice number
      const { count: invoiceCount } = await supabase
        .from('invoice')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', params.businessId)

      const invoiceNumber = `${new Date().getFullYear()}-${String((invoiceCount || 0) + 1).padStart(4, '0')}`

      // Calculate due date
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + (business.default_payment_days || 30))

      // Create invoice
      const { data: invoice, error: insertError } = await supabase
        .from('invoice')
        .insert({
          business_id: params.businessId,
          customer_id: customerId,
          invoice_number: invoiceNumber,
          status: 'draft',
          items,
          subtotal,
          vat_rate: vatRate,
          vat,
          total,
          customer_pays: total,
          due_date: dueDate.toISOString().split('T')[0],
          source: 'auto_generated',
          notes: `Auto-genererad från ${entries.length} tidrapport${entries.length > 1 ? 'er' : ''}`,
        })
        .select('invoice_id')
        .single()

      if (insertError) {
        result.errors.push(`${customerName}: ${insertError.message}`)
        continue
      }

      // Mark time entries as invoiced
      const entryIds = entries.map((e: any) => e.time_entry_id)
      await supabase
        .from('time_entry')
        .update({ invoice_id: invoice.invoice_id, invoiced: true })
        .in('time_entry_id', entryIds)

      // Log customer activity
      await supabase.from('customer_activity').insert({
        activity_id: 'act_' + Math.random().toString(36).substr(2, 9),
        customer_id: customerId,
        business_id: params.businessId,
        activity_type: 'invoice_created',
        title: `Faktura #${invoiceNumber} skapad`,
        description: `Auto-genererad faktura på ${total} kr från ${entries.length} tidrapporter`,
        created_by: 'system',
      })

      result.invoices.push({
        invoice_id: invoice.invoice_id,
        customer_name: customerName,
        total,
        items_count: items.length,
      })
      result.invoices_created++

      // Auto-send if enabled
      if (params.autoSend && customer?.email) {
        try {
          const { sendEmail } = await import('@/lib/email')
          const { invoiceEmail } = await import('@/lib/email-templates')

          const { subject, html } = invoiceEmail({
            branding: {
              businessName: business.business_name || 'Handymate',
              contactEmail: business.contact_email,
              orgNumber: business.org_number,
            },
            customerName,
            invoiceNumber,
            totalAmount: total.toLocaleString('sv-SE'),
            dueDate: dueDate.toLocaleDateString('sv-SE'),
          })

          const emailResult = await sendEmail({
            to: customer.email,
            subject,
            html,
            fromName: business.business_name || 'Handymate',
            replyTo: business.contact_email,
          })

          if (emailResult.success) {
            await supabase
              .from('invoice')
              .update({ status: 'sent', sent_at: new Date().toISOString() })
              .eq('invoice_id', invoice.invoice_id)

            // Log email
            const { logEmail } = await import('@/lib/email')
            await logEmail({
              businessId: params.businessId,
              customerId,
              to: customer.email,
              subject,
              channel: 'email',
              status: 'sent',
              messageId: emailResult.messageId,
            })
          }
        } catch (sendErr: any) {
          result.errors.push(`${customerName}: E-post kunde inte skickas: ${sendErr.message}`)
        }
      }
    } catch (err: any) {
      result.errors.push(`Kund ${customerId}: ${err.message}`)
    }
  }

  return result
}

// ── Cron Mode ──────────────────────────────────────────────────

async function processCronAutoInvoice(): Promise<NextResponse> {
  const supabase = getServerSupabase()

  // Find all businesses with auto_invoice_enabled
  const { data: businesses } = await supabase
    .from('business_config')
    .select('business_id, auto_invoice_send, auto_invoice_max_amount')
    .eq('auto_invoice_enabled', true)

  if (!businesses || businesses.length === 0) {
    return NextResponse.json({ success: true, message: 'Inga företag med auto-faktura aktiverat', processed: 0 })
  }

  const allResults = []

  for (const biz of businesses) {
    const result = await generateInvoicesForBusiness({
      businessId: biz.business_id,
      autoSend: biz.auto_invoice_send || false,
      maxAmount: biz.auto_invoice_max_amount || 50000,
    })
    allResults.push({ business_id: biz.business_id, ...result })
  }

  const totalCreated = allResults.reduce((sum, r) => sum + r.invoices_created, 0)

  return NextResponse.json({
    success: true,
    businesses_processed: businesses.length,
    total_invoices_created: totalCreated,
    results: allResults,
  })
}
