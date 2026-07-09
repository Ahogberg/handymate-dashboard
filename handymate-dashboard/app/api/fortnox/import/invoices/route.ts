import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { isFortnoxConnected, getFortnoxInvoices } from '@/lib/fortnox'

interface ExistingInvoice {
  fortnox_document_number: string | null
}

interface CustomerRow {
  customer_id: string
  fortnox_customer_number: string | null
}

/**
 * POST /api/fortnox/import/invoices
 *
 * Importerar ÖPPNA/OBETALDA Fortnox-fakturor till lokala `invoice`-rader så att
 * Karin/pengar-in-radarn ser dem direkt (och kan FÖRESLÅ påminnelser via den
 * godkännande-gatade vägen).
 *
 * KRITISK SÄKERHET: detta är HISTORISK data — importen skickar ALDRIG något
 * utskick. reminder_count sätts till 0, next_reminder_at lämnas orört (null),
 * och ingen reminder-/send-funktion anropas. Bara data-rader skapas.
 *
 * Körs typiskt EFTER /api/fortnox/import/customers så att kundkopplingen finns.
 * Omatchade fakturor importeras ändå med customer_id = null (räknas som
 * `unlinked` i svaret) så totalsumman ändå syns.
 *
 * DEDUP: hoppar över fakturor vars fortnox_document_number redan finns lokalt.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id

    const connected = await isFortnoxConnected(businessId)
    if (!connected) {
      return NextResponse.json({ error: 'Fortnox not connected' }, { status: 400 })
    }

    const fortnoxInvoices = await getFortnoxInvoices(businessId)

    // Befintliga fortnox_document_number för dedup.
    const { data: existingInvoices } = await supabase
      .from('invoice')
      .select('fortnox_document_number')
      .eq('business_id', businessId)
      .not('fortnox_document_number', 'is', null)

    const existingDocNumbers = new Set(
      (existingInvoices as ExistingInvoice[] | null)
        ?.map(i => i.fortnox_document_number)
        .filter((n): n is string => !!n) ?? []
    )

    // Kund-uppslag: Fortnox CustomerNumber → lokalt customer_id.
    const { data: customers } = await supabase
      .from('customer')
      .select('customer_id, fortnox_customer_number')
      .eq('business_id', businessId)
      .not('fortnox_customer_number', 'is', null)

    const customerByFortnoxNumber = new Map<string, string>()
    for (const c of (customers as CustomerRow[] | null) ?? []) {
      if (c.fortnox_customer_number) {
        customerByFortnoxNumber.set(c.fortnox_customer_number, c.customer_id)
      }
    }

    const results = {
      imported: 0,
      skipped: 0,
      unlinked: 0,
      total_outstanding_kr: 0,
      errors: [] as { documentNumber: string; error: string }[],
    }

    const today = new Date().toISOString().split('T')[0]

    for (const fi of fortnoxInvoices) {
      const docNumber = fi.DocumentNumber ?? fi.InvoiceNumber
      if (!docNumber) {
        // Utan dokumentnummer kan vi varken dedup:a eller peka tillbaka — hoppa.
        results.skipped++
        continue
      }

      // Dedup: redan importerad?
      if (existingDocNumbers.has(docNumber)) {
        results.skipped++
        continue
      }

      try {
        const customerId = fi.CustomerNumber
          ? customerByFortnoxNumber.get(fi.CustomerNumber) ?? null
          : null
        if (!customerId) results.unlinked++

        const total = Number(fi.Total) || 0
        // Balance = utestående. När listan saknar Balance faller vi tillbaka
        // på Total (obetald faktura → hela beloppet utestående).
        const outstanding = fi.Balance != null ? Number(fi.Balance) || 0 : total

        const invoiceDate = fi.InvoiceDate ?? today
        const dueDate = fi.DueDate ?? null
        // Förfallen om förfallodatum passerat, annars bara skickad.
        const status = dueDate && dueDate < today ? 'overdue' : 'sent'

        const { error: insertError } = await supabase
          .from('invoice')
          .insert({
            business_id: businessId,
            customer_id: customerId,
            invoice_number: fi.InvoiceNumber ?? docNumber,
            invoice_type: 'standard',
            status,
            total,
            invoice_date: invoiceDate,
            due_date: dueDate,
            fortnox_document_number: docNumber,
            fortnox_invoice_number: fi.InvoiceNumber ?? null,
            fortnox_synced_at: new Date().toISOString(),
            // SÄKERHET: historisk faktura — inga påminnelser trigggas. Håll
            // reminder_count = 0 och rör INTE next_reminder_at.
            reminder_count: 0,
          })

        if (insertError) {
          throw insertError
        }

        // Registrera för dedup inom samma körning (om Fortnox listar dubbletter).
        existingDocNumbers.add(docNumber)
        results.imported++
        results.total_outstanding_kr += outstanding
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        results.errors.push({ documentNumber: docNumber, error: errorMessage })
      }
    }

    return NextResponse.json({
      success: true,
      imported: results.imported,
      skipped: results.skipped,
      unlinked: results.unlinked,
      total: fortnoxInvoices.length,
      total_outstanding_kr: Math.round(results.total_outstanding_kr),
      errors: results.errors,
    })
  } catch (error: unknown) {
    console.error('Import invoices error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Import failed'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
