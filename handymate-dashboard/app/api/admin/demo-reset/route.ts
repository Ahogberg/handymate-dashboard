import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { resetDemoAccount, isError } from '@/lib/demo/seed-demo-account'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/demo-reset
 *
 * Återställer DEMOKONTOT med färsk exempeldata inför en säljdemo. Detta är
 * en destruktiv operation (delete → insert) och skyddas därför av en hård
 * grind utöver vanlig inloggning:
 *
 *   1. getAuthenticatedBusiness — kräver inloggad session, som alla routes.
 *   2. business.business_id === process.env.DEMO_BUSINESS_ID — annars 403.
 *
 * Utan DEMO_BUSINESS_ID satt i miljön svarar routen ALLTID 403, oavsett vem
 * som är inloggad. Detta gör det omöjligt att av misstag (eller avsiktligt)
 * radera en riktig kunds data — resetten kan bara någonsin köras inloggad
 * på själva demokontot, och bara mot det.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const demoBusinessId = process.env.DEMO_BUSINESS_ID
    if (!demoBusinessId || business.business_id !== demoBusinessId) {
      return NextResponse.json(
        { error: 'Det här är inte demokontot. Återställningen kan bara köras på demokontot.' },
        { status: 403 }
      )
    }

    const result = await resetDemoAccount(business.business_id)
    if (isError(result)) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('[demo-reset] Error:', error)
    return NextResponse.json({ error: error.message || 'Kunde inte återställa demon' }, { status: 500 })
  }
}
