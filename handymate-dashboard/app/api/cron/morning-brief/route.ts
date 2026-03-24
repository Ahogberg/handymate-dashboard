import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/morning-brief
 * Genererar morning brief för alla aktiva businesses.
 * Körs kl 06:00 UTC (08:00 svensk tid) via vercel.json cron.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

  const res = await fetch(`${appUrl}/api/morning-brief`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
  })

  const result = await res.json()
  return NextResponse.json(result)
}
