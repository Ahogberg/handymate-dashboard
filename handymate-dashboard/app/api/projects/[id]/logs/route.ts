import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'

/**
 * GET /api/projects/[id]/logs - Lista byggdagbok
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const projectId = params.id

    const { data: logs, error } = await supabase
      .from('project_log')
      .select(`
        *,
        business_user:business_user_id (id, name, color)
      `)
      .eq('order_id', projectId)
      .eq('business_id', business.business_id)
      .order('date', { ascending: false })

    if (error) throw error

    return NextResponse.json({ logs: logs || [] })

  } catch (error: any) {
    console.error('Get project logs error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/projects/[id]/logs - Skapa dagboksanteckning
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    const supabase = getServerSupabase()
    const projectId = params.id
    const body = await request.json()

    const {
      log_date,
      weather,
      temperature,
      work_description,
      materials_used,
      hours_worked,
      notes,
      photos,
      workers_present,
      deviations,
    } = body

    if (!log_date) {
      return NextResponse.json({ error: 'Datum krävs' }, { status: 400 })
    }

    const id = `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    const { data: log, error } = await supabase
      .from('project_log')
      .insert({
        id,
        order_id: projectId,
        business_id: business.business_id,
        business_user_id: currentUser?.id || null,
        date: log_date,
        weather: weather || null,
        temperature: temperature != null ? temperature : null,
        work_performed: work_description || null,
        materials_used: materials_used || null,
        hours_worked: hours_worked != null ? hours_worked : null,
        description: notes || null,
        photos: photos || [],
        workers_count: workers_present != null ? workers_present : null,
        issues: deviations || null,
      })
      .select(`
        *,
        business_user:business_user_id (id, name, color)
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ log })

  } catch (error: any) {
    console.error('Create project log error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
