import { NextRequest, NextResponse } from 'next/server'
import { isAdmin, getAdminSupabase } from '@/lib/admin-auth'
import { korPreflight } from '@/lib/launch/preflight'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/admin/launch-preflight — är lanseringsprovet ens körbart just nu?
 *
 * Körs FÖRE ett bevisprotokoll enligt docs/launch/LAUNCH_TEST_SUITE.md, så
 * blockerade stationer upptäcks innan någon lagt en halv dag på att komma
 * halvvägs. Svaret är avsett att stämplas in överst i protokollfilen
 * (scripts/launch-evidence.mjs gör det automatiskt).
 *
 * Läsande kontroller enbart — inget SMS, inget mejl, ingen kostnad. Se
 * lib/launch/preflight.ts för varför den finns utöver env-kontrollen i
 * lib/launch/readiness.ts.
 */
export async function GET(request: NextRequest) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
  }

  try {
    const resultat = await korPreflight(getAdminSupabase())
    return NextResponse.json(resultat)
  } catch (err) {
    console.error('[launch-preflight] sonden kastade:', err)
    return NextResponse.json(
      { error: 'Förkravssonden kunde inte köras', detalj: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
