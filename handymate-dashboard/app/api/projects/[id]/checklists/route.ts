import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/projects/[id]/checklists - Lista checklistor för projekt
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

    const { data: checklists, error } = await supabase
      .from('project_checklist')
      .select('*')
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Add progress info
    const withProgress = (checklists || []).map((cl: any) => {
      const items = cl.items || []
      const total = items.length
      const checked = items.filter((i: any) => i.checked).length
      return {
        ...cl,
        progress: { total, checked, percent: total > 0 ? Math.round((checked / total) * 100) : 0 },
      }
    })

    return NextResponse.json({ checklists: withProgress })

  } catch (error: any) {
    console.error('Get project checklists error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/projects/[id]/checklists - Skapa checklista från mall eller custom
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

    const supabase = getServerSupabase()
    const projectId = params.id
    const body = await request.json()

    const { name, template_id, items } = body

    if (!name) {
      return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })
    }

    // Reset checked status for all items
    const checklistItems = (items || []).map((item: any) => ({
      ...item,
      checked: false,
    }))

    const id = `cl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    const { data: checklist, error } = await supabase
      .from('project_checklist')
      .insert({
        id,
        project_id: projectId,
        business_id: business.business_id,
        template_id: template_id || null,
        name,
        items: checklistItems,
        status: 'in_progress',
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ checklist })

  } catch (error: any) {
    console.error('Create project checklist error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
