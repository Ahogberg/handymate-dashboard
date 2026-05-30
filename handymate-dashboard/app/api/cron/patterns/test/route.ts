/**
 * GET /api/cron/patterns/test
 *
 * Fas 1a Dag 4 (2026-05-30). Manuell trigger för pattern-cron-flödet.
 *
 * Auth — TVÅ accepterade vägar (samma mönster som agent-observation-test):
 *   a) Bearer CRON_SECRET-header + ?business_id=X
 *   b) Authenticated browser-session — använder current users business_id
 *      som default. Cross-business kräver CRON_SECRET.
 *
 * Skiljer sig från Vercel-cron-routen: kör BARA EN business åt gången,
 * returnerar full BusinessPatternRunResult inkl errors per pattern.
 *
 * Använd för:
 *   - Verifiera UPSERT-flödet mot Bee efter Dag 4-deploy
 *   - Testa idempotens (kör 2 gånger samma dag → samma rad uppdateras)
 *   - Felsökning per business utan att vänta på 05:00 UTC-cron
 *
 * INGEN cost-check här (pattern är ren SQL utan Claude-anrop) — testet
 * bypassar inga säkerhetsmekanismer eftersom det inte FINNS några
 * relevanta för patterns. agents_globally_paused respekteras dock —
 * test-routen ska bete sig som Vercel-cronen.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { runPatternsForBusiness } from '@/lib/patterns/run-patterns'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const requestedBizId = url.searchParams.get('business_id')

  const authHeader = request.headers.get('authorization')
  let businessId: string | null = null

  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    if (!requestedBizId) {
      return NextResponse.json(
        { error: 'business_id query-param krävs när Bearer CRON_SECRET används' },
        { status: 400 },
      )
    }
    businessId = requestedBizId
  } else {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json(
        { error: 'Unauthorized — kräver Bearer CRON_SECRET eller inloggad session' },
        { status: 401 },
      )
    }
    businessId = requestedBizId || business.business_id

    if (requestedBizId && requestedBizId !== business.business_id) {
      return NextResponse.json(
        { error: 'Du kan bara trigga patterns för ditt eget företag (eller använd CRON_SECRET)' },
        { status: 403 },
      )
    }
  }

  if (!businessId) {
    return NextResponse.json({ error: 'business_id kunde inte bestämmas' }, { status: 400 })
  }

  const supabase = getServerSupabase()

  // Respektera kill-switch — samma som Vercel-cronen
  const { data: biz } = await supabase
    .from('business_config')
    .select('agents_globally_paused')
    .eq('business_id', businessId)
    .maybeSingle()

  if (biz?.agents_globally_paused === true) {
    return NextResponse.json({
      ok: true,
      business_id: businessId,
      result: { skipped: 'agents_globally_paused' },
    })
  }

  try {
    const result = await runPatternsForBusiness(supabase, businessId)
    return NextResponse.json({
      ok: true,
      business_id: businessId,
      result,
    })
  } catch (err: any) {
    console.error(`[cron/patterns/test] error for business=${businessId}:`, err)
    return NextResponse.json(
      {
        ok: false,
        business_id: businessId,
        error: err?.message || 'Okänt fel',
        stack: err?.stack?.slice(0, 500),
      },
      { status: 500 },
    )
  }
}
