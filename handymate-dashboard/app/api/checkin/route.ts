import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * POST /api/checkin — Checka in (GPS-position valfri)
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { project_id, lat, lng, user_name } = body
  const supabase = getServerSupabase()

  // Kolla att ingen aktiv incheckning finns
  const { data: existing } = await supabase
    .from('time_checkins')
    .select('id')
    .eq('business_id', business.business_id)
    .eq('user_id', business.user_id)
    .eq('status', 'active')
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Redan incheckad' }, { status: 400 })
  }

  // Hämta projektnamn om project_id angivits
  let projectName: string | null = null
  if (project_id) {
    const { data: project } = await supabase
      .from('project')
      .select('name')
      .eq('project_id', project_id)
      .maybeSingle()
    projectName = project?.name || null
  }

  const { data: checkin, error } = await supabase
    .from('time_checkins')
    .insert({
      business_id: business.business_id,
      user_id: business.user_id,
      user_name: user_name || business.contact_name || 'Okänd',
      project_id: project_id || null,
      project_name: projectName,
      checked_in_at: new Date().toISOString(),
      lat_in: lat || null,
      lng_in: lng || null,
      status: 'active',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ checkin })
}

/**
 * GET /api/checkin — Hämta aktiv incheckning för inloggad användare
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()

  const { data: checkin } = await supabase
    .from('time_checkins')
    .select('*')
    .eq('business_id', business.business_id)
    .eq('user_id', business.user_id)
    .eq('status', 'active')
    .maybeSingle()

  return NextResponse.json({ checkin: checkin || null })
}
