import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { syncInvoicesFromFortnox } from '@/lib/fortnox/sync-invoices'

export const maxDuration = 300
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { return NextResponse.json(await syncInvoicesFromFortnox(business.business_id)) }
  catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Synken misslyckades' }, { status: 500 }) }
}
