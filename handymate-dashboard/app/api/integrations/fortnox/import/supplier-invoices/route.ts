import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { isFortnoxConnected, getFortnoxSupplierInvoices } from '@/lib/fortnox'
import { mapFortnoxSupplierInvoice } from '@/lib/fortnox/map-supplier-invoice'
import { logFortnoxOperation } from '@/lib/fortnox/api-log'

interface ExistingSupplierInvoice {
  fortnox_supplier_invoice_number: string | null
}

/**
 * POST /api/integrations/fortnox/import/supplier-invoices
 *
 * Importerar leverantörsfakturor från Fortnox till lokala supplier_invoices-
 * rader. PULL-ONLY. Nya rader börjar ALLTID med project_id=NULL och
 * subcontractor_id=NULL — matchningskön på Karins sida (Etapp 3) äger den
 * kopplingen, aldrig importen.
 *
 * DEDUP: hoppar över fakturor vars fortnox_supplier_invoice_number redan
 * finns lokalt.
 *
 * SCOPE: kräver Fortnox-scopet "supplierinvoice" — konton anslutna innan
 * detta byte saknar rättigheten och måste återansluta.
 */
export async function POST(request: NextRequest) {
  let businessId: string | null = null
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    businessId = business.business_id

    const connected = await isFortnoxConnected(businessId)
    if (!connected) {
      return NextResponse.json({ error: 'Fortnox not connected' }, { status: 400 })
    }

    let fortnoxSupplierInvoices
    try {
      fortnoxSupplierInvoices = await getFortnoxSupplierInvoices(businessId)
    } catch (fetchError: unknown) {
      const message = fetchError instanceof Error ? fetchError.message : ''
      if (message.includes('403') || message.toLowerCase().includes('scope')) {
        return NextResponse.json(
          { error: 'Återanslut Fortnox för att hämta leverantörsfakturor — behörigheten saknas på den nuvarande anslutningen.' },
          { status: 403 },
        )
      }
      throw fetchError
    }

    const { data: existingInvoices } = await supabase
      .from('supplier_invoices')
      .select('fortnox_supplier_invoice_number')
      .eq('business_id', businessId)
      .not('fortnox_supplier_invoice_number', 'is', null)

    const existingDocNumbers = new Set(
      (existingInvoices as ExistingSupplierInvoice[] | null)
        ?.map(i => i.fortnox_supplier_invoice_number)
        .filter((n): n is string => !!n) ?? []
    )

    const results = {
      imported: 0,
      skipped: 0,
      total_amount_kr: 0,
      errors: [] as { documentNumber: string; error: string }[],
    }

    const today = new Date().toISOString().split('T')[0]

    for (const fi of fortnoxSupplierInvoices) {
      const mapped = mapFortnoxSupplierInvoice(fi, today)
      if (!mapped) {
        results.skipped++
        continue
      }

      const { docNumber, row } = mapped

      if (existingDocNumbers.has(docNumber)) {
        results.skipped++
        continue
      }

      try {
        const id = `sinv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
        const { error: insertError } = await supabase
          .from('supplier_invoices')
          .insert({
            id,
            business_id: businessId,
            supplier_name: row.supplier_name,
            invoice_number: row.invoice_number,
            invoice_date: row.invoice_date,
            due_date: row.due_date,
            amount_excl_vat: row.amount_excl_vat,
            vat_amount: row.vat_amount,
            total_amount: row.total_amount,
            status: row.status === 'overdue' ? 'unpaid' : row.status,
            fortnox_supplier_invoice_number: row.fortnox_supplier_invoice_number,
            fortnox_supplier_number: row.fortnox_supplier_number,
            fortnox_synced_at: new Date().toISOString(),
          })

        if (insertError) throw insertError

        existingDocNumbers.add(docNumber)
        results.imported++
        results.total_amount_kr += row.total_amount
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        results.errors.push({ documentNumber: docNumber, error: errorMessage })
      }
    }

    await logFortnoxOperation(businessId, 'import_supplier_invoices', {
      imported: results.imported,
      skipped: results.skipped,
      total: fortnoxSupplierInvoices.length,
      total_amount_kr: Math.round(results.total_amount_kr),
      error_count: results.errors.length,
    })

    return NextResponse.json({
      success: true,
      imported: results.imported,
      skipped: results.skipped,
      total: fortnoxSupplierInvoices.length,
      total_amount_kr: Math.round(results.total_amount_kr),
      errors: results.errors,
    })
  } catch (error: unknown) {
    console.error('Import supplier invoices error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Import failed'
    if (businessId) {
      await logFortnoxOperation(businessId, 'import_supplier_invoices', null, errorMessage)
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
