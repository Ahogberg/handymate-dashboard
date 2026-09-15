import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getWeeklyValue } from '@/lib/weekly-value'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/weekly-value
 *
 * Tunn route-wrapper — själva beräkningen bor i lib/weekly-value.ts så att
 * app/api/cron/onboarding-followup (dag-7-mailet) kan återanvända den utan
 * copy-paste.
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getCurrentUser(request, business.business_id)
  if (!user || !isOwnerOrAdmin(user)) return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })

  const supabase = getServerSupabase()

  // ?days=30 för månadsräknaren (2026-08-08). Klampas hårt: fönstret styr
  // fyra frågor och attributionen — ett fritt värde vore en DoS-ratt.
  const daysRaw = parseInt(request.nextUrl.searchParams.get('days') || '7', 10)
  const days = [7, 30].includes(daysRaw) ? daysRaw : 7

  try {
    const value = await getWeeklyValue(supabase, business.business_id, days, { failOnReadError: true })
    return NextResponse.json(value)
  } catch {
    return NextResponse.json({ error: 'Veckans underlag kunde inte hämtas. Försök igen.' }, { status: 503 })
  }
}
