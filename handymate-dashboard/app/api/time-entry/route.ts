import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedBusiness } from '@/lib/auth'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET - Hämta tidsrapporter för ett företag
 * Query params: startDate, endDate, customerId, invoiced, workTypeId
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabase()
    const businessId = business.business_id
    const startDate = request.nextUrl.searchParams.get('startDate')
    const endDate = request.nextUrl.searchParams.get('endDate')
    const customerId = request.nextUrl.searchParams.get('customerId')
    const invoiced = request.nextUrl.searchParams.get('invoiced')
    const workTypeId = request.nextUrl.searchParams.get('workTypeId')

    let query = supabase
      .from('time_entry')
      .select(`
        *,
        customer:customer_id (
          customer_id,
          name,
          phone_number
        ),
        booking:booking_id (
          booking_id,
          scheduled_start,
          notes
        ),
        work_type:work_type_id (
          work_type_id,
          name,
          multiplier
        )
      `)
      .eq('business_id', businessId)
      .order('work_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (startDate) query = query.gte('work_date', startDate)
    if (endDate) query = query.lte('work_date', endDate)
    if (customerId) query = query.eq('customer_id', customerId)
    if (workTypeId) query = query.eq('work_type_id', workTypeId)
    if (invoiced === 'true') query = query.eq('invoiced', true)
    if (invoiced === 'false') query = query.eq('invoiced', false)

    const { data: entries, error } = await query

    if (error) throw error

    // Calculate totals using duration_minutes
    const totalMinutes = entries?.reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0) || 0
    const billableMinutes = entries?.filter((e: any) => e.is_billable).reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0) || 0
    const totalRevenue = entries?.reduce((sum: number, e: any) => {
      const hours = (e.duration_minutes || 0) / 60
      return sum + (hours * (e.hourly_rate || 0))
    }, 0) || 0

    return NextResponse.json({
      entries,
      totals: {
        minutes: totalMinutes,
        hours: Math.round((totalMinutes / 60) * 10) / 10,
        billable_minutes: billableMinutes,
        revenue: Math.round(totalRevenue),
        count: entries?.length || 0
      }
    })

  } catch (error: unknown) {
    console.error('Get time entries error:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST - Skapa ny tidsrapport
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabase()
    const body = await request.json()
    const {
      booking_id,
      customer_id,
      work_type_id,
      work_date,
      start_time,
      end_time,
      duration_minutes,
      description,
      hourly_rate,
      is_billable
    } = body

    if (!work_date || !duration_minutes) {
      return NextResponse.json({ error: 'work_date och duration_minutes krävs' }, { status: 400 })
    }

    // Get default hourly rate from business config if not provided
    let effectiveRate = hourly_rate
    if (!effectiveRate) {
      const { data: config } = await supabase
        .from('business_config')
        .select('default_hourly_rate')
        .eq('business_id', business.business_id)
        .single()
      effectiveRate = config?.default_hourly_rate || 500
    }

    // Apply work type multiplier if provided
    if (work_type_id) {
      const { data: workType } = await supabase
        .from('work_type')
        .select('multiplier, billable_default')
        .eq('work_type_id', work_type_id)
        .eq('business_id', business.business_id)
        .single()

      if (workType) {
        effectiveRate = effectiveRate * workType.multiplier
      }
    }

    const { data, error } = await supabase
      .from('time_entry')
      .insert({
        business_id: business.business_id,
        booking_id: booking_id || null,
        customer_id: customer_id || null,
        work_type_id: work_type_id || null,
        work_date,
        start_time: start_time || null,
        end_time: end_time || null,
        duration_minutes,
        description: description || null,
        hourly_rate: effectiveRate,
        is_billable: is_billable ?? true
      })
      .select(`
        *,
        customer:customer_id (customer_id, name, phone_number),
        work_type:work_type_id (work_type_id, name, multiplier)
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ entry: data })

  } catch (error: unknown) {
    console.error('Create time entry error:', error)
    const message = error instanceof Error ? error.message : 'Failed to create'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera tidsrapport
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabase()
    const body = await request.json()
    const { entry_id, ...updates } = body

    if (!entry_id) {
      return NextResponse.json({ error: 'entry_id krävs' }, { status: 400 })
    }

    // Block update if invoiced
    const { data: existing } = await supabase
      .from('time_entry')
      .select('invoiced')
      .eq('time_entry_id', entry_id)
      .eq('business_id', business.business_id)
      .single()

    if (existing?.invoiced) {
      return NextResponse.json({ error: 'Kan inte ändra fakturerade tidposter' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('time_entry')
      .update(updates)
      .eq('time_entry_id', entry_id)
      .eq('business_id', business.business_id)
      .select(`
        *,
        customer:customer_id (customer_id, name, phone_number),
        work_type:work_type_id (work_type_id, name, multiplier)
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ entry: data })

  } catch (error: unknown) {
    console.error('Update time entry error:', error)
    const message = error instanceof Error ? error.message : 'Failed to update'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort tidsrapport
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabase()
    const entryId = request.nextUrl.searchParams.get('entryId')

    if (!entryId) {
      return NextResponse.json({ error: 'entryId krävs' }, { status: 400 })
    }

    // Block delete if invoiced
    const { data: existing } = await supabase
      .from('time_entry')
      .select('invoiced')
      .eq('time_entry_id', entryId)
      .eq('business_id', business.business_id)
      .single()

    if (existing?.invoiced) {
      return NextResponse.json({ error: 'Kan inte ta bort fakturerade tidposter' }, { status: 400 })
    }

    const { error } = await supabase
      .from('time_entry')
      .delete()
      .eq('time_entry_id', entryId)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: unknown) {
    console.error('Delete time entry error:', error)
    const message = error instanceof Error ? error.message : 'Failed to delete'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
