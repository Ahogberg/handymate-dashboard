import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/expire-approvals
 * Marks pending approvals as expired if expires_at has passed.
 * Run daily (or more frequently) via vercel.json cron.
 */
export async function GET() {
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
