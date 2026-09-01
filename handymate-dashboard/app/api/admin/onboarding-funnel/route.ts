import { NextRequest, NextResponse } from 'next/server'
import { isAdmin, getAdminSupabase } from '@/lib/admin-auth'
import { sammanstallTratt, STEG_ETIKETTER, type FunnelRow } from '@/lib/onboarding/funnel'

export const dynamic = 'force-dynamic'

const DAYS_DEFAULT = 90
const DAYS_MAX = 365

/**
 * GET /api/admin/onboarding-funnel?days=90
 *
 * Plattformsinstrument (isAdmin, läser över alla företag — därför medvetet
 * utanför tests/permission-contract.spec.ts:s tenant-karta, samma som
 * admin/kortkvalitet och admin/mandate-maturity).
 *
 * Räknar per onboardingsteg hur många som nådde det, bortfall mot
 * föregående steg, median tid per steg (bara konton med tidsstämplar,
 * dvs. skapade efter 2026-09-01), utfall per variant (Setup Studio /
 * klassisk) och var de ofullbordade fastnat. Testkonton (E2E/Testkund/
 * "Test") räknas inte i summeringen men listas med flagga.
 */
export async function GET(request: NextRequest) {
  try {
    const adminCheck = await isAdmin(request)
    if (!adminCheck.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const daysRaw = Number(new URL(request.url).searchParams.get('days'))
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(DAYS_MAX, Math.round(daysRaw)) : DAYS_DEFAULT
    const since = new Date(Date.now() - days * 86_400_000).toISOString()

    const supabase = getAdminSupabase()
    const { data, error } = await supabase
      .from('business_config')
      .select('business_id, business_name, created_at, onboarding_step, onboarding_completed_at, subscription_status, stripe_subscription_id, onboarding_data')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(2000)
    if (error) throw error

    const { summering, foretag } = sammanstallTratt((data || []) as FunnelRow[])

    return NextResponse.json({
      days,
      since,
      etiketter: STEG_ETIKETTER,
      summering,
      foretag,
      note:
        'Räknade fakta per steg. Tidsstämplar finns bara för konton skapade efter 2026-09-01; ' +
        'äldre konton approximeras ur onboarding_step. Aldrig ett påstående om VARFÖR någon föll bort.',
    })
  } catch (err: any) {
    console.error('[admin/onboarding-funnel] error:', err)
    return NextResponse.json({ error: err?.message || 'Kunde inte läsa onboardingtratten' }, { status: 500 })
  }
}
