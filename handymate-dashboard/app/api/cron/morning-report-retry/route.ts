import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { morningReliabilityEnabled, retryMorningReports } from '@/lib/automation/morning-report'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!morningReliabilityEnabled()) return NextResponse.json({ skipped: 'disabled' })
  try { return NextResponse.json(await retryMorningReports(getServerSupabase())) }
  catch { return NextResponse.json({ error: 'Morgonrapporternas återförsök kunde inte läsas' }, { status: 503 }) }
}
