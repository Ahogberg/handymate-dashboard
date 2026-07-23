import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getEfterkalkylInsight } from '@/lib/efterkalkyl/get-insight'

/**
 * GET /api/quotes/efterkalkyl-insikt
 *
 * Motor 1 (Lärande prissättning) — steg 2. Läser project_outcome för
 * businessen, grupperat på template_id (primär) eller job_type (sekundär),
 * och returnerar snittdiffar som driver QuoteNewEfterkalkylBanner i
 * offertflödet.
 *
 * Query-params: template_id och/eller job_type. template_id vinner om
 * båda skickas (samma prioritering som freeze-outcome: mallen är den
 * skarpaste grupperingsnyckeln, jobbtyp är bredare/sekundär).
 *
 * Själva lazy-backfillen + aggregeringen ligger i lib/efterkalkyl/get-
 * insight.ts — delad med Matte-verktyget get_efterkalkyl_insight
 * (app/api/agent/trigger/tool-router.ts) så de aldrig kan glida isär.
 */

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const jobType = searchParams.get('job_type')
    const templateId = searchParams.get('template_id')

    if (!jobType && !templateId) {
      return NextResponse.json({ error: 'job_type eller template_id krävs' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const insight = await getEfterkalkylInsight(supabase, business.business_id, { jobType, templateId })

    return NextResponse.json(insight)
  } catch (error: any) {
    console.error('[efterkalkyl-insikt] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
