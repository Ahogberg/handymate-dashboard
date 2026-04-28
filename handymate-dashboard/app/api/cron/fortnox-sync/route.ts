import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { syncFortnoxPaymentsForBusiness } from '@/lib/fortnox/sync-payments'

export const maxDuration = 300

/**
 * GET /api/cron/fortnox-sync
 *
 * Pollar Fortnox-betalstatus för alla kopplade businesses. Kallas från Vercel
 * cron varje 2 timmar. När en faktura ändrar status från 'sent' till 'paid'
 * eller 'overdue' triggas automation-pipelinen via
 * lib/fortnox/sync-payments.runPostPaymentAutomations.
 *
 * Säkerhet: Vercel sätter authorization header Bearer CRON_SECRET.
 * Andra anrop utan secret refuseras (men endpoint är ändå idempotent).
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization') || ''
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = getServerSupabase()

  // Hämta alla kopplade businesses
  const { data: businesses, error } = await supabase
    .from('business_config')
    .select('business_id')
    .eq('fortnox_connected', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results = []
  let totalChecked = 0
  let totalMarkedPaid = 0
  let totalMarkedOverdue = 0
  const errors: string[] = []

  for (const biz of businesses || []) {
    try {
      const result = await syncFortnoxPaymentsForBusiness(biz.business_id)
      results.push(result)
      totalChecked += result.checked
      totalMarkedPaid += result.marked_paid
      totalMarkedOverdue += result.marked_overdue
      if (result.errors.length > 0) {
        errors.push(`${biz.business_id}: ${result.errors.join('; ')}`)
      }
    } catch (err: any) {
      errors.push(`${biz.business_id}: ${err?.message || 'sync failed'}`)
    }
  }

  return NextResponse.json({
    ok: true,
    businesses_synced: businesses?.length || 0,
    total_checked: totalChecked,
    total_marked_paid: totalMarkedPaid,
    total_marked_overdue: totalMarkedOverdue,
    errors,
    results,
  })
}
