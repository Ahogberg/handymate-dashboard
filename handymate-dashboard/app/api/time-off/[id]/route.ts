import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'

/**
 * PATCH /api/time-off/[id] - Godkänn eller avslå ledighetsansökan
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check approve_time permission
    if (!hasPermission(currentUser, 'approve_time')) {
      return NextResponse.json(
        { error: 'Otillräcklig behörighet för att godkänna ledighet' },
        { status: 403 }
      )
    }

    const supabase = getServerSupabase()
    const requestId = params.id
    const body = await request.json()
    const { action } = body

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'action måste vara "approve" eller "reject"' },
        { status: 400 }
      )
    }

    // Fetch existing request
    const { data: existing, error: fetchError } = await supabase
      .from('time_off_request')
      .select('*')
      .eq('id', requestId)
      .eq('business_id', business.business_id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Ledighetsansökan hittades inte' },
        { status: 404 }
      )
    }

    // Only pending requests can be approved/rejected
    if (existing.status !== 'pending') {
      return NextResponse.json(
        { error: `Kan inte ändra status på en ansökan som redan är ${existing.status}` },
        { status: 400 }
      )
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected'
    const now = new Date().toISOString()

    // Update the request
    const { data: updated, error: updateError } = await supabase
      .from('time_off_request')
      .update({
        status: newStatus,
        approved_by: currentUser.id,
        approved_at: now,
      })
      .eq('id', requestId)
      .eq('business_id', business.business_id)
      .select(`
        *,
        business_user:business_user_id (id, name, color)
      `)
      .single()

    if (updateError) throw updateError

    // If approving, create schedule_entry for each day in the range
    if (action === 'approve') {
      const scheduleEntries = generateDayEntries(
        existing,
        business.business_id,
        currentUser.id
      )

      if (scheduleEntries.length > 0) {
        const { error: scheduleError } = await supabase
          .from('schedule_entry')
          .insert(scheduleEntries)

        if (scheduleError) {
          console.error('Error creating schedule entries for time off:', scheduleError)
          // Don't fail the whole request, the approval already went through
        }
      }
    }

    return NextResponse.json({ request: updated })

  } catch (error: any) {
    console.error('Update time off request error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/time-off/[id] - Ta bort ledighetsansökan (bara pending)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const requestId = params.id

    // Fetch existing request
    const { data: existing, error: fetchError } = await supabase
      .from('time_off_request')
      .select('*')
      .eq('id', requestId)
      .eq('business_id', business.business_id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Ledighetsansökan hittades inte' },
        { status: 404 }
      )
    }

    // Only pending requests can be deleted (unless user has manage_users)
    if (existing.status !== 'pending') {
      return NextResponse.json(
        { error: 'Kan bara ta bort ansökningar med status "pending"' },
        { status: 400 }
      )
    }

    // Must be own request or have manage_users permission
    const isOwnRequest = existing.business_user_id === currentUser.id
    if (!isOwnRequest && !hasPermission(currentUser, 'manage_users')) {
      return NextResponse.json(
        { error: 'Kan bara ta bort egna ansökningar' },
        { status: 403 }
      )
    }

    // Hard delete
    const { error: deleteError } = await supabase
      .from('time_off_request')
      .delete()
      .eq('id', requestId)
      .eq('business_id', business.business_id)

    if (deleteError) throw deleteError

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Delete time off request error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * Helper: Generera schedule_entry-poster för varje dag i ledighetsperioden
 */
function generateDayEntries(
  timeOffRequest: any,
  businessId: string,
  createdBy: string
): any[] {
  const entries: any[] = []
  const startDate = new Date(timeOffRequest.start_date)
  const endDate = new Date(timeOffRequest.end_date)

  const titles: Record<string, string> = {
    vacation: 'Semester',
    sick: 'Sjukfrånvaro',
    parental: 'Föräldraledighet',
    other: 'Ledig',
  }
  const title = titles[timeOffRequest.type] || 'Ledig'

  const current = new Date(startDate)
  while (current <= endDate) {
    const dateStr = current.toISOString().split('T')[0]
    const id = `toff_sch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    entries.push({
      id,
      business_id: businessId,
      business_user_id: timeOffRequest.business_user_id,
      project_id: null,
      title,
      description: timeOffRequest.note || null,
      start_datetime: `${dateStr}T00:00:00`,
      end_datetime: `${dateStr}T23:59:59`,
      all_day: true,
      type: 'time_off',
      status: 'scheduled',
      color: '#9ca3af',
      created_by: createdBy,
    })

    current.setDate(current.getDate() + 1)
  }

  return entries
}
