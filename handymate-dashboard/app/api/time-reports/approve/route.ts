import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'

/**
 * GET - Hämta väntande veckorapporter (för godkännande)
 * Grupperar per medarbetare och vecka
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission check: kräver approve_time
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'approve_time')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id

    // Hämta alla pending entries
    const { data: entries, error } = await supabase
      .from('time_entry')
      .select(`
        time_entry_id, work_date, duration_minutes, break_minutes,
        hourly_rate, is_billable, approval_status, work_category,
        overtime_minutes, description,
        business_user:business_user_id (id, name, color, email),
        customer:customer_id (customer_id, name)
      `)
      .eq('business_id', businessId)
      .eq('approval_status', 'pending')
      .order('work_date', { ascending: false })

    if (error) throw error

    // Gruppera per medarbetare + vecka
    const grouped: Record<string, {
      user: { id: string; name: string; color: string; email: string }
      weekKey: string
      weekNumber: number
      year: number
      entries: any[]
      totalMinutes: number
      billableMinutes: number
      overtimeMinutes: number
      revenue: number
      entryCount: number
    }> = {}

    for (const entry of entries || []) {
      const userId = (entry.business_user as any)?.id || 'unknown'
      const userName = (entry.business_user as any)?.name || 'Okänd'
      const userColor = (entry.business_user as any)?.color || '#94a3b8'
      const userEmail = (entry.business_user as any)?.email || ''

      // Beräkna veckonummer
      const d = new Date(entry.work_date)
      const dayOfWeek = d.getDay()
      const monday = new Date(d)
      monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7))
      const weekKey = `${userId}_${monday.toISOString().split('T')[0]}`

      const yearStart = new Date(d.getFullYear(), 0, 1)
      const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7)

      if (!grouped[weekKey]) {
        grouped[weekKey] = {
          user: { id: userId, name: userName, color: userColor, email: userEmail },
          weekKey,
          weekNumber: weekNum,
          year: d.getFullYear(),
          entries: [],
          totalMinutes: 0,
          billableMinutes: 0,
          overtimeMinutes: 0,
          revenue: 0,
          entryCount: 0,
        }
      }

      const mins = entry.duration_minutes || 0
      grouped[weekKey].entries.push(entry)
      grouped[weekKey].totalMinutes += mins
      grouped[weekKey].entryCount += 1
      if (entry.is_billable) grouped[weekKey].billableMinutes += mins
      grouped[weekKey].overtimeMinutes += entry.overtime_minutes || 0
      if (entry.hourly_rate) grouped[weekKey].revenue += (mins / 60) * entry.hourly_rate
    }

    const pendingWeeks = Object.values(grouped).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year
      return b.weekNumber - a.weekNumber
    })

    return NextResponse.json({ pendingWeeks })
  } catch (error: any) {
    console.error('Get pending approvals error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Godkänn eller avslå en veckorapport
 * body: { entry_ids, action: 'approve'|'reject', rejection_reason? }
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission check: kräver approve_time
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'approve_time')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { entry_ids, action, rejection_reason } = body

    if (!entry_ids || !Array.isArray(entry_ids) || entry_ids.length === 0) {
      return NextResponse.json({ error: 'Missing entry_ids' }, { status: 400 })
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const updates: Record<string, any> = {
      approval_status: action === 'approve' ? 'approved' : 'rejected',
      approved_at: new Date().toISOString(),
    }

    if (action === 'reject' && rejection_reason) {
      updates.rejection_reason = rejection_reason
    }

    const { data, error } = await supabase
      .from('time_entry')
      .update(updates)
      .eq('business_id', business.business_id)
      .in('time_entry_id', entry_ids)
      .eq('approval_status', 'pending')
      .select('time_entry_id')

    if (error) throw error

    return NextResponse.json({
      count: data?.length || 0,
      action,
    })
  } catch (error: any) {
    console.error('Approve/reject error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
