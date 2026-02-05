import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedBusiness } from '@/lib/auth'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface TimeEntry {
  entry_id: string
  business_id: string
  booking_id: string | null
  customer_id: string | null
  work_date: string
  start_time: string | null
  end_time: string | null
  hours_worked: number
  description: string | null
  hourly_rate: number | null
  materials_cost: number | null
  created_at: string
}

/**
 * GET - Hämta tidsrapporter för ett företag
 * Query params: startDate (optional), endDate (optional), customerId (optional)
 */
export async function GET(request: NextRequest) {
  try {
    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabase()
    const businessId = business.business_id
    const startDate = request.nextUrl.searchParams.get('startDate')
    const endDate = request.nextUrl.searchParams.get('endDate')
    const customerId = request.nextUrl.searchParams.get('customerId')

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
        )
      `)
      .eq('business_id', businessId)
      .order('work_date', { ascending: false })
      .order('start_time', { ascending: false })

    if (startDate) {
      query = query.gte('work_date', startDate)
    }

    if (endDate) {
      query = query.lte('work_date', endDate)
    }

    if (customerId) {
      query = query.eq('customer_id', customerId)
    }

    const { data: entries, error } = await query

    if (error) throw error

    // Calculate totals
    const totalHours = entries?.reduce((sum: number, e: TimeEntry) => sum + (e.hours_worked || 0), 0) || 0
    const totalRevenue = entries?.reduce((sum: number, e: TimeEntry) => {
      const labor = (e.hours_worked || 0) * (e.hourly_rate || 0)
      return sum + labor + (e.materials_cost || 0)
    }, 0) || 0

    return NextResponse.json({
      entries,
      totals: {
        hours: totalHours,
        revenue: totalRevenue,
        count: entries?.length || 0
      }
    })

  } catch (error: any) {
    console.error('Get time entries error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa ny tidsrapport
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabase()
    const body = await request.json()
    const {
      booking_id,
      customer_id,
      work_date,
      start_time,
      end_time,
      hours_worked,
      description,
      hourly_rate,
      materials_cost
    } = body

    if (!work_date || !hours_worked) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('time_entry')
      .insert({
        business_id: business.business_id,
        booking_id,
        customer_id,
        work_date,
        start_time,
        end_time,
        hours_worked,
        description,
        hourly_rate: hourly_rate || 500, // Default 500 kr/h
        materials_cost: materials_cost || 0
      })
      .select(`
        *,
        customer:customer_id (
          customer_id,
          name,
          phone_number
        )
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ entry: data })

  } catch (error: any) {
    console.error('Create time entry error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera tidsrapport
 */
export async function PUT(request: NextRequest) {
  try {
    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabase()
    const body = await request.json()
    const { entry_id, ...updates } = body

    if (!entry_id) {
      return NextResponse.json({ error: 'Missing entry_id' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('time_entry')
      .update(updates)
      .eq('time_entry_id', entry_id)
      .eq('business_id', business.business_id)
      .select(`
        *,
        customer:customer_id (
          customer_id,
          name,
          phone_number
        )
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ entry: data })

  } catch (error: any) {
    console.error('Update time entry error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort tidsrapport
 */
export async function DELETE(request: NextRequest) {
  try {
    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabase()
    const entryId = request.nextUrl.searchParams.get('entryId')

    if (!entryId) {
      return NextResponse.json({ error: 'Missing entryId' }, { status: 400 })
    }

    const { error } = await supabase
      .from('time_entry')
      .delete()
      .eq('time_entry_id', entryId)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Delete time entry error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
