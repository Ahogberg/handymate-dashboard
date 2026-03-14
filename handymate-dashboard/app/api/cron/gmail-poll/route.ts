/**
 * Cron: GET /api/cron/gmail-poll
 * Polls Gmail for all connected businesses.
 * Uses History API for incremental fetching (only new messages since last poll).
 */

import { NextRequest, NextResponse } from 'next/server'
import { pollAllBusinesses } from '@/lib/gmail/poller'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await pollAllBusinesses()

    console.log(
      `[gmail-poll] Done: ${result.businesses} businesses, ${result.totalProcessed} processed, ${result.totalStored} stored`,
      result.errors.length > 0 ? `Errors: ${result.errors.join('; ')}` : ''
    )

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[gmail-poll] Fatal error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
