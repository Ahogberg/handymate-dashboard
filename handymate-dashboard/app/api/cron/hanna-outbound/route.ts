import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { runHannaOutbound } from '@/lib/agents/hanna-outbound'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/hanna-outbound
 *
 * Hannas dagliga proaktiva säljkörning: skapar GATADE reaktiverings-förslag
 * (pending_approvals) för gamla kunder. Drip-begränsad per företag. Körs via
 * vercel.json. Skickar ingenting själv — hantverkaren godkänner.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()

  const { data: businesses } = await supabase
    .from('business_config')
    .select('business_id')

  const results = []
  for (const b of businesses || []) {
    try {
      results.push(await runHannaOutbound(supabase, b.business_id))
    } catch (err: any) {
      results.push({ business_id: b.business_id, error: err?.message || String(err) })
    }
  }

  const totalProposed = results.reduce((s, r) => s + (('proposed' in r ? r.proposed : 0) || 0), 0)
  return NextResponse.json({ ok: true, businesses: results.length, total_proposed: totalProposed, results })
}
