import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getEfterkalkylInsight } from '@/lib/efterkalkyl/get-insight'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

/**
 * GET /api/quotes/efterkalkyl-insikt
 *
 * Motor 1 (Lärande prissättning) — steg 2. Läser project_outcome för
 * businessen, grupperat på template_id (primär) eller job_type (sekundär),
 * och returnerar snittdiffar som driver "Matte säger" (MatteSager.tsx,
 * tidigare QuoteNewEfterkalkylBanner — RIVNING PAKET C 2026-09-17 rad 2.17)
 * i offertflödet.
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
