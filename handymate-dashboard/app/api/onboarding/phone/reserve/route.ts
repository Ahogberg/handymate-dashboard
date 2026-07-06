import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { purchaseAndAssignNumber } from '@/lib/phone/purchase-number'

/**
 * POST /api/onboarding/phone/reserve — köper + kopplar numret i STEG 3
 * (aha-testet kräver ett RIKTIGT, aktivt nummer före betalningen).
 * Komponentens fallback-platshållare kvarstår om env saknas (dev).
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await purchaseAndAssignNumber(getServerSupabase(), business.business_id)
  if (!result.ok) {
    // 200 med tom kropp → komponenten faller till platshållare (befintligt beteende)
    return NextResponse.json({ error: result.error })
  }
  return NextResponse.json({ phone_number: result.phone_number })
}
