import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { summarizeQuietCustomersByJobType } from '@/lib/customers/reactivation-signal'
import { HANNA_OUTBOUND_QUIET_DAYS, QUIET_MONTH_DAYS } from '@/lib/customers/quiet-customer'

export const dynamic = 'force-dynamic'

/**
 * GET /api/jarvis/reactivation-signal
 *
 * "Låt Matte väga in det" (tasks/jaunty-pondering-hummingbird.md) — den
 * enda datan ReaktiveringsInsikt.tsx behöver: STÖRSTA jobbtyp-gruppen
 * bland tysta tidigare kunder, inget mer. Kortet visar en signal, inte en
 * lista — resten av rangordningen (om någon vill den senare) stannar i
 * summarizeQuietCustomersByJobType.
 *
 * Ingen kandidat når tröskeln (MIN_REACTIVATION_GROUP_SIZE) →
 * { signal: null }. Det är det ärliga svaret, inte ett fel.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()
    const groups = await summarizeQuietCustomersByJobType(supabase, business.business_id)
    const top = groups[0] ?? null

    return NextResponse.json({
      signal: top
        ? {
            job_type: top.job_type,
            count: top.count,
            // Beskriver gruppens DEFINIERANDE tröskel, inte ett per-kund
            // snittvärde — samma tröskel som fetchQuietCustomers anropades med.
            quietMonths: Math.round(HANNA_OUTBOUND_QUIET_DAYS / QUIET_MONTH_DAYS),
          }
        : null,
    })
  } catch (error: any) {
    console.error('GET /api/jarvis/reactivation-signal error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
