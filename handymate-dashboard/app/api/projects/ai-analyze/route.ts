import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { handleProjectEvent } from '@/lib/project-ai-engine'

/**
 * POST /api/projects/ai-analyze
 * Trigger AI health check for a specific project
 * Body: { project_id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { project_id } = await request.json()

    if (!project_id) {
      return NextResponse.json({ error: 'project_id krävs' }, { status: 400 })
    }

    await handleProjectEvent({
      type: 'daily_health_check',
      businessId: business.business_id,
      projectId: project_id,
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('AI analyze error:', error)
    const message = error instanceof Error ? error.message : 'Failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
