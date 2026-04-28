import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { syncFortnoxPaymentsForBusiness } from '@/lib/fortnox/sync-payments'

/**
 * POST /api/integrations/fortnox/sync-now
 *
 * Trigga manuell synk av Fortnox-betalstatus för det inloggade företaget.
 * Använder samma logik som cron-jobbet (/api/cron/fortnox-sync) men för en
 * enskild business — rätt att klicka när som helst.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await syncFortnoxPaymentsForBusiness(business.business_id)

    return NextResponse.json({
      success: result.errors.length === 0,
      ...result,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
