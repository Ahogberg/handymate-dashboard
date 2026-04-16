import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/expire-approvals
 * Marks pending approvals as expired if expires_at has passed.
 * Run daily (or more frequently) via vercel.json cron.
 *
 * Requires: Authorization: Bearer ${CRON_SECRET}
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServerSupabase()

    const { data, error } = await supabase
      .from('pending_approvals')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())
      .select('id')

    if (error) throw error

    const count = data?.length || 0
    console.log(`[expire-approvals] Expired ${count} approvals`)

    return NextResponse.json({ expired: count })
  } catch (error: any) {
    console.error('[expire-approvals] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
