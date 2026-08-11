import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { processPendingMeetingJobs, cleanupStaleMeetingJobs } from '@/lib/meetings/process-job'

/**
 * Cron: GET /api/cron/meeting-worker
 *
 * Mötesassistenten V2 (sql/v119_meeting_v2.sql) — transkriberar väntande
 * mötessegment och sätter ihop klara transkript. Körs var 5:e minut som
 * säkerhetsnät; /api/voice/meeting/complete puttar dessutom denna endpoint
 * fire-and-forget direkt när ett möte avslutas, så korta möten inte
 * behöver vänta på nästa cron-tick.
 *
 * Whisper på flera segment kan dra ut på tiden — samma maxDuration-lärdom
 * som V1:s (nu raderade) site-visit-route byggde på.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServerSupabase()

    const { jobs, ready, errors } = await processPendingMeetingJobs(supabase)
    const cleaned = await cleanupStaleMeetingJobs(supabase)

    console.log(
      `[meeting-worker] Klart: ${jobs} jobb behandlade, ${ready} klara, ${cleaned} städade`,
      errors.length > 0 ? `Fel: ${errors.join('; ')}` : '',
    )

    return NextResponse.json({ success: true, jobs, ready, cleaned, errors })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[meeting-worker] Fatal error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
