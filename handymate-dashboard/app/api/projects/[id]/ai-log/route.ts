import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/projects/[id]/ai-log
 * Hämta AI-handlingslogg för ett projekt
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

    // Verify project belongs to this business
    const { data: project } = await supabase
      .from('project')
      .select('project_id')
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { data: logs, error } = await supabase
      .from('project_ai_log')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    return NextResponse.json({ logs: logs || [] })
  } catch (error: unknown) {
    console.error('Get AI log error:', error)
    const message = error instanceof Error ? error.message : 'Failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
