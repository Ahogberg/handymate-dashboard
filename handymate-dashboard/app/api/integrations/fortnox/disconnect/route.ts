import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { clearFortnoxConnection } from '@/lib/fortnox'

/**
 * POST /api/integrations/fortnox/disconnect
 *
 * Nollställer tokens och `fortnox_connected = false`. Kund/faktura-koppling
 * (fortnox_customer_number, fortnox_invoice_number) lämnas kvar — om man
 * kopplar igen ska gamla referenser fortfarande gälla.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await clearFortnoxConnection(business.business_id)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
