import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { isFortnoxConnected } from '@/lib/fortnox'
import { importSupplierInvoicesForBusiness } from '@/lib/fortnox/import-supplier-invoices'
import { logFortnoxOperation } from '@/lib/fortnox/api-log'

/**
 * POST /api/integrations/fortnox/import/supplier-invoices
 *
 * Manuell import av leverantörsfakturor från Fortnox ("Hämta historik"-
 * knappen). TUNN sedan 2026-08-26: auth + anslutningskoll + den svenska
 * återanslut-mappningen bor här; själva importen (hämta → dedup → mappa →
 * infoga → audit) bor i lib/fortnox/import-supplier-invoices.ts och delas
 * med 2h-cronen (app/api/cron/fortnox-sync), som tidigare bara friskade
 * upp betalstatus på redan importerade rader — nya leverantörsfakturor
 * kom aldrig in utan att någon tryckte på knappen.
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

    businessId = business.business_id

    const connected = await isFortnoxConnected(businessId)
    if (!connected) {
      return NextResponse.json({ error: 'Fortnox not connected' }, { status: 400 })
    }

    const result = await importSupplierInvoicesForBusiness(businessId)

    if (result.needs_reconnect) {
      return NextResponse.json(
        { error: 'Återanslut Fortnox för att hämta leverantörsfakturor — behörigheten saknas på den nuvarande anslutningen.' },
        { status: 403 },
      )
    }

    return NextResponse.json({
      success: true,
      imported: result.imported,
      skipped: result.skipped,
      total: result.total,
      total_amount_kr: result.total_amount_kr,
      errors: result.errors,
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
