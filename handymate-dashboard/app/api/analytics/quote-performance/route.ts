import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

interface QuoteRow {
  quote_id: string
  status: string
  created_at: string
  sent_at: string | null
  first_viewed_at: string | null
  accepted_at: string | null
  signed_at: string | null
  declined_at: string | null
  view_count: number | null
  total: number | null
  detail_level: string | null
  rot_enabled: boolean | null
  customer_id: string | null
}

const WON_STATUSES = ['accepted', 'signed']
const LOST_STATUSES = ['declined', 'expired']

const DETAIL_LEVEL_LABELS: Record<string, string> = {
  detailed: 'Rad för rad',
  subtotals_only: 'Bara delsummor',
  total_only: 'Endast totalsumma',
}

function round(n: number): number {
  return Math.round(n)
}

function avgHoursBetween(pairs: Array<{ from: string; to: string }>): number | null {
  if (pairs.length === 0) return null
  const totalHours = pairs.reduce((sum, p) => {
    const diffMs = new Date(p.to).getTime() - new Date(p.from).getTime()
    return sum + diffMs / (1000 * 60 * 60)
  }, 0)
  return Math.round((totalHours / pairs.length) * 10) / 10
}

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const periodParam = request.nextUrl.searchParams.get('period') || '90d'
    const period = ['30d', '90d', '365d'].includes(periodParam) ? periodParam : '90d'

    const days = period === '30d' ? 30 : period === '365d' ? 365 : 90
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)

    const { data: quotesData } = await supabase
      .from('quotes')
      .select(
        'quote_id, status, created_at, sent_at, first_viewed_at, accepted_at, signed_at, declined_at, view_count, total, detail_level, rot_enabled, customer_id'
      )
      .eq('business_id', business.business_id)
      .gte('created_at', cutoff.toISOString())

    const quotes = (quotesData as QuoteRow[]) || []

    // Sent-or-further = anything except draft
    const sentOrFurther = quotes.filter(q => q.status !== 'draft')
    const wonQuotes = quotes.filter(q => WON_STATUSES.includes(q.status))
    const lostQuotes = quotes.filter(q => LOST_STATUSES.includes(q.status))
    const openQuotes = sentOrFurther.filter(
      q => !WON_STATUSES.includes(q.status) && !LOST_STATUSES.includes(q.status)
    )

    const isOpened = (q: QuoteRow) =>
      (q.view_count || 0) > 0 || ['opened', 'accepted', 'signed', 'declined'].includes(q.status)

    const closedCount = wonQuotes.length + lostQuotes.length
    const acceptanceRate = closedCount > 0 ? round((wonQuotes.length / closedCount) * 100) : null

    const wonValue = wonQuotes.reduce((sum, q) => sum + (q.total || 0), 0)

    const openPairs = sentOrFurther
      .filter(q => q.sent_at && q.first_viewed_at)
      .map(q => ({ from: q.sent_at as string, to: q.first_viewed_at as string }))
    const avgHoursToOpen = avgHoursBetween(openPairs)

    const winPairs = wonQuotes
      .filter(q => q.sent_at && (q.accepted_at || q.signed_at))
      .map(q => ({ from: q.sent_at as string, to: (q.accepted_at || q.signed_at) as string }))
    const avgHoursToWin = avgHoursBetween(winPairs)

    const neverOpenedCount = sentOrFurther.filter(q => !isOpened(q)).length
    const neverOpenedPct =
      sentOrFurther.length > 0 ? round((neverOpenedCount / sentOrFurther.length) * 100) : 0

    const openedCount = sentOrFurther.filter(isOpened).length

    const funnel = [
      { label: 'Skickade', count: sentOrFurther.length },
      { label: 'Öppnade av kund', count: openedCount },
      { label: 'Accepterade', count: wonQuotes.length },
    ]

    // By detail level
    const detailLevels = ['detailed', 'subtotals_only', 'total_only']
    const byDetailLevel = detailLevels
      .map(level => {
        const rows = sentOrFurther.filter(q => (q.detail_level || 'detailed') === level)
        const won = rows.filter(q => WON_STATUSES.includes(q.status)).length
        const lost = rows.filter(q => LOST_STATUSES.includes(q.status)).length
        const closed = won + lost
        return {
          level,
          label: DETAIL_LEVEL_LABELS[level] || level,
          sent: rows.length,
          won,
          acceptance_rate: closed > 0 ? round((won / closed) * 100) : null,
        }
      })
      .filter(row => row.sent > 0)

    // By opened vs never opened
    const openedRows = sentOrFurther.filter(isOpened)
    const neverOpenedRows = sentOrFurther.filter(q => !isOpened(q))
    const buildOpenedGroup = (label: string, rows: QuoteRow[]) => {
      const won = rows.filter(q => WON_STATUSES.includes(q.status)).length
      const lost = rows.filter(q => LOST_STATUSES.includes(q.status)).length
      const closed = won + lost
      return {
        label,
        sent: rows.length,
        won,
        acceptance_rate: closed > 0 ? round((won / closed) * 100) : null,
      }
    }
    const byOpened = [
      buildOpenedGroup('Öppnade offerter', openedRows),
      buildOpenedGroup('Aldrig öppnade', neverOpenedRows),
    ]

    // Loss reasons — defensive, column may not exist
    let lossReasons: Array<{ reason: string; count: number }> = []
    try {
      const { data: lossData, error: lossError } = await supabase
        .from('quotes')
        .select('lost_reason')
        .eq('business_id', business.business_id)
        .gte('created_at', cutoff.toISOString())
        .in('status', LOST_STATUSES)

      if (!lossError && lossData) {
        const reasonMap = new Map<string, number>()
        for (const row of lossData as Array<{ lost_reason: string | null }>) {
          if (!row.lost_reason) continue
          reasonMap.set(row.lost_reason, (reasonMap.get(row.lost_reason) || 0) + 1)
        }
        lossReasons = Array.from(reasonMap.entries())
          .map(([reason, count]) => ({ reason, count }))
          .sort((a, b) => b.count - a.count)
      }
    } catch {
      lossReasons = []
    }

    return NextResponse.json({
      period,
      totals: {
        sent_count: sentOrFurther.length,
        won_count: wonQuotes.length,
        lost_count: lostQuotes.length,
        open_count: openQuotes.length,
        acceptance_rate: acceptanceRate,
        won_value: wonValue,
        avg_hours_to_open: avgHoursToOpen,
        avg_hours_to_win: avgHoursToWin,
        never_opened_pct: neverOpenedPct,
      },
      funnel,
      by_detail_level: byDetailLevel,
      by_opened: byOpened,
      loss_reasons: lossReasons,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
