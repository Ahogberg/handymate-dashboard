import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness, checkFeatureAccess } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const featureCheck = checkFeatureAccess(business, 'lead_intelligence')
    if (!featureCheck.allowed) {
      return NextResponse.json({ error: featureCheck.error, feature: featureCheck.feature, required_plan: featureCheck.required_plan }, { status: 403 })
    }

    // Fetch win-loss and speed data in parallel
    const baseUrl = request.nextUrl.origin
    const headers: Record<string, string> = {}
    const cookie = request.headers.get('cookie')
    if (cookie) headers.cookie = cookie
    const auth = request.headers.get('authorization')
    if (auth) headers.authorization = auth

    const [winLossRes, speedRes] = await Promise.all([
      fetch(`${baseUrl}/api/analytics/win-loss?period=90d&business_id=${business.business_id}`, { headers }),
      fetch(`${baseUrl}/api/analytics/speed-to-lead?period=90d&business_id=${business.business_id}`, { headers }),
    ])

    const winLoss = winLossRes.ok ? await winLossRes.json() : null
    const speed = speedRes.ok ? await speedRes.json() : null

    // Generate insights based on data
    const insights: string[] = []

    if (winLoss) {
      if (winLoss.win_rate > 0) {
        insights.push(`Din win-rate ligger på ${winLoss.win_rate}% de senaste 90 dagarna.`)
      }

      // Best source
      const bestSource = winLoss.win_rate_by_source?.sort((a: any, b: any) => b.rate - a.rate)[0]
      if (bestSource && bestSource.leads >= 3) {
        insights.push(`${bestSource.source} har bäst konvertering (${bestSource.rate}%) – överväg att satsa mer där.`)
      }

      // Top loss reason
      const topLoss = winLoss.loss_reasons?.[0]
      if (topLoss && topLoss.count >= 2) {
        const pct = winLoss.lost > 0 ? Math.round((topLoss.count / winLoss.lost) * 100) : 0
        insights.push(`${pct}% av förlorade deals beror på "${topLoss.reason}" – det kan vara värt att adressera.`)
      }

      if (winLoss.avg_deal_size_won > 0 && winLoss.avg_deal_size_lost > 0) {
        if (winLoss.avg_deal_size_won > winLoss.avg_deal_size_lost * 1.3) {
          insights.push(`Du vinner oftare på större jobb (snitt ${Math.round(winLoss.avg_deal_size_won / 1000)}k kr vs ${Math.round(winLoss.avg_deal_size_lost / 1000)}k kr för förlorade).`)
        }
      }
    }

    if (speed) {
      if (speed.avg_response_seconds > 0 && speed.industry_avg_seconds > 0) {
        const factor = Math.round(speed.industry_avg_seconds / speed.avg_response_seconds)
        if (factor > 1) {
          insights.push(`Du svarar ${factor}x snabbare än branschsnittet – det ger dig en stor fördel.`)
        }
      }

      const fastBucket = speed.win_rate_by_speed?.under_1_min
      const slowBucket = speed.win_rate_by_speed?.over_4_hours
      if (fastBucket > 0 && slowBucket >= 0) {
        insights.push(`Leads som besvaras inom 1 minut har ${fastBucket}% win-rate, jämfört med ${slowBucket}% för leads över 4 timmar.`)
      }
    }

    if (insights.length === 0) {
      insights.push('Samla fler datapunkter för att få AI-drivna insikter om din försäljning.')
    }

    return NextResponse.json({ insights })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
